import { describe, expect, it } from 'vitest';
import { createMockApi, createMockStore } from './mock';
import { ApiError } from './types';

const setup = () => {
  const store = createMockStore();
  const as = (role: 'viewer' | 'manager' | 'ingest') => createMockApi(role, store, 0);
  return { store, viewer: as('viewer'), manager: as('manager'), ingest: as('ingest') };
};

const expectError = async (p: Promise<unknown>, status: number) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
};

describe('mock API rules match the backend', () => {
  it('treats day 91 as aging but not day 90', async () => {
    const { viewer } = setup();
    const { items } = await viewer.listVehicles({ min_age_days: 89, max_age_days: 91, limit: 200 });
    const boundary = items.filter((v) => v.vin.startsWith('BNDRY'));
    expect(boundary.map((v) => [v.age_days, v.is_aging])).toEqual([
      [91, true],
      [90, false],
      [89, false],
    ]);
    const aging = await viewer.listAging({ limit: 200 });
    expect(aging.items.every((v) => v.age_days > 90)).toBe(true);
  });

  it('applies a new threshold immediately', async () => {
    const { viewer, manager } = setup();
    await manager.setThreshold(89);
    const { items } = await viewer.listVehicles({ min_age_days: 90, max_age_days: 90, limit: 200 });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((v) => v.is_aging)).toBe(true);
    await expectError(manager.setThreshold(0), 400);
    await expectError(manager.setThreshold(3651), 400);
  });

  it('pages oldest first with no gaps or duplicates', async () => {
    const { store, viewer } = setup();
    const inStock = store.vehicles.filter((v) => v.status === 'IN_STOCK').length;
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await viewer.listVehicles({ limit: 37, cursor });
      seen.push(...page.items.map((v) => v.id));
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(seen.length).toBe(inStock);
    expect(new Set(seen).size).toBe(inStock);
  });

  it('rejects the same bad list parameters', async () => {
    const { viewer } = setup();
    await expectError(viewer.listVehicles({ limit: 0 }), 400);
    await expectError(viewer.listVehicles({ limit: 201 }), 400);
    await expectError(viewer.listVehicles({ min_age_days: 10, max_age_days: 5 }), 400);
    await expectError(viewer.listVehicles({ cursor: 'bogus' }), 400);
  });

  it('replays by idempotency key and rejects a changed request', async () => {
    const { store, viewer, manager } = setup();
    const id = (await viewer.listAging({ limit: 1 })).items[0].id;
    const before = store.actions.length;
    const body = { action_type: 'PRICE_REDUCED', note: 'x' };
    const first = await manager.logAction(id, body, 'k1');
    const again = await manager.logAction(id, body, 'k1');
    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.action.id).toBe(first.action.id);
    expect(store.actions.length).toBe(before + 1);
    await expectError(manager.logAction(id, { action_type: 'TRANSFER_PLANNED' }, 'k1'), 409);
    await expectError(manager.logAction(id, { action_type: 'NOPE' }, 'k2'), 400);
    await expectError(manager.logAction('missing', body, 'k3'), 404);
    expect((await viewer.history(id))[0].id).toBe(first.action.id);
  });

  it('enforces the role table', async () => {
    const { viewer, manager, ingest } = setup();
    const id = (await viewer.listVehicles({ limit: 1 })).items[0].id;
    await expectError(viewer.logAction(id, { action_type: 'PRICE_REDUCED' }, 'k'), 403);
    await expectError(viewer.setThreshold(60), 403);
    await expectError(viewer.ingest({ vehicles: [] }), 403);
    await expectError(ingest.listVehicles({}), 403);
    await expectError(ingest.summary(), 403);
    await expectError(manager.ingest({ vehicles: [] }), 403);
  });

  it('counts unchanged ingest rows as neither inserted nor updated', async () => {
    const { ingest } = setup();
    const vehicle = { vin: 'JTMWRREV0RD000001', make: 'Toyota', model: 'RAV4', year: 2025, price: 31999, received_at: '2026-01-01' };
    expect(await ingest.ingest({ vehicles: [vehicle] })).toEqual({ inserted: 1, updated: 0 });
    expect(await ingest.ingest({ vehicles: [vehicle] })).toEqual({ inserted: 0, updated: 0 });
    expect(await ingest.ingest({ vehicles: [{ ...vehicle, price: 29999 }] })).toEqual({ inserted: 0, updated: 1 });
    await expectError(ingest.ingest({ vehicles: [vehicle, vehicle] }), 400);
    await expectError(ingest.ingest({ vehicles: [] }), 400);
    await expectError(ingest.ingest({ vehicles: [{ ...vehicle, vin: 'SHORT' }] }), 400);
  });

  it('keeps summary totals consistent', async () => {
    const { viewer } = setup();
    const s = await viewer.summary();
    expect(s.aging_by_make.reduce((n, m) => n + m.count, 0)).toBe(s.aging_count);
    expect(s.aging_by_action.reduce((n, a) => n + a.count, 0)).toBe(s.aging_count);
    expect(s.aging_by_action.some((a) => a.action === null)).toBe(true);
  });
});
