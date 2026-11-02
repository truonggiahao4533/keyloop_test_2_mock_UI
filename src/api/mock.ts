// In-browser stand-in for the API. It follows the same rules as KL_Test
// (aging boundary, keyset cursors, idempotency, roles, validation) so the UI
// behaves the same with or without a backend. State resets on page reload.
import {
  ACTION_TYPES,
  type Action,
  type ActionType,
  type Api,
  ApiError,
  type IngestResult,
  type ListQuery,
  type Role,
  type Summary,
  type Vehicle,
  type VehiclePage,
} from './types';

type Status = 'IN_STOCK' | 'SOLD' | 'REMOVED';

interface StoredVehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  price: number | null;
  received_at: string;
  status: Status;
  current_action: ActionType | null;
  current_action_at: string | null;
}

export interface MockStore {
  vehicles: StoredVehicle[];
  actions: Action[];
  idempotency: Map<string, { hash: string; action: Action }>;
  threshold: number;
}

const CATALOG: [string, [string, number][]][] = [
  ['Toyota', [['Corolla', 22000], ['Camry', 28000], ['RAV4', 31000], ['Highlander', 40000], ['Tacoma', 33000]]],
  ['Honda', [['Civic', 24000], ['Accord', 29000], ['CR-V', 32000], ['Pilot', 41000]]],
  ['Ford', [['F-150', 45000], ['Escape', 29000], ['Explorer', 39000], ['Mustang', 35000]]],
  ['Chevrolet', [['Silverado', 44000], ['Equinox', 28000], ['Malibu', 25000]]],
  ['Nissan', [['Altima', 26000], ['Rogue', 29000], ['Sentra', 21000]]],
  ['Hyundai', [['Elantra', 22000], ['Tucson', 29000], ['Santa Fe', 33000]]],
  ['Kia', [['Forte', 21000], ['Sportage', 28000], ['Telluride', 38000]]],
  ['Subaru', [['Forester', 29000], ['Outback', 31000]]],
];

const NOTES = [
  'Reviewed at weekly stock meeting',
  'Competitor listing is 5% lower',
  'Sister store has demand for this trim',
  'Feature in weekend promotion',
  'Send to auction if unsold in 2 weeks',
  null,
];

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const DAY_MS = 86_400_000;
const PERMISSIONS: Record<Role, string[]> = {
  viewer: ['read'],
  manager: ['read', 'act'],
  ingest: ['ingest'],
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function ageDays(receivedAt: string): number {
  return Math.round((todayMs() - Date.parse(`${receivedAt}T00:00:00Z`)) / DAY_MS);
}

export function createMockStore(count = 500, seed = 42): MockStore {
  const rand = mulberry32(seed);
  const int = (n: number) => Math.floor(rand() * n);
  const uuid = () =>
    'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => int(16).toString(16));
  const store: MockStore = { vehicles: [], actions: [], idempotency: new Map(), threshold: 90 };
  const today = todayMs();

  const add = (vin: string, age: number, demo: boolean) => {
    const [make, models] = CATALOG[int(CATALOG.length)];
    const [model, base] = models[int(models.length)];
    const yearsOld = int(4);
    const dollars = base * (1 - 0.07 * yearsOld) * (0.95 + 0.15 * rand());
    const received = today - age * DAY_MS;
    const vehicle: StoredVehicle = {
      id: uuid(),
      vin,
      make,
      model,
      year: new Date(today).getUTCFullYear() - yearsOld,
      price: Math.floor(dollars / 100) * 100 - 1,
      received_at: ymd(received),
      status: !demo && int(100) < 3 ? 'SOLD' : 'IN_STOCK',
      current_action: null,
      current_action_at: null,
    };
    if ((age > 90 && int(100) < 40) || (age > 60 && int(100) < 10)) {
      let at = received + 60 * DAY_MS;
      for (let i = 0, n = 1 + int(2); i < n; i++) {
        at = Math.min(at + (1 + int((age - 59) * 24)) * 3_600_000, Date.now() - int(3_600_000));
        const action: Action = {
          id: uuid(),
          vehicle_id: vehicle.id,
          action_type: ACTION_TYPES[int(ACTION_TYPES.length)],
          note: NOTES[int(NOTES.length)],
          created_by: 'seed',
          created_at: new Date(at).toISOString(),
        };
        store.actions.push(action);
        vehicle.current_action = action.action_type;
        vehicle.current_action_at = action.created_at;
      }
    }
    store.vehicles.push(vehicle);
  };

  for (const age of [89, 90, 91]) add(`BNDRY${String(age).padStart(12, '0')}`, age, true);
  while (store.vehicles.length < count) {
    const age = int(100) < 30 ? 91 + int(150) : int(91);
    let vin = '';
    for (let i = 0; i < 17; i++) vin += VIN_CHARS[int(VIN_CHARS.length)];
    add(vin, age, false);
  }
  return store;
}

/** The session-wide store, so switching role keeps what you logged. */
export const sharedStore = createMockStore();

function compareKey(a: { received_at: string; id: string }, b: { received_at: string; id: string }) {
  if (a.received_at !== b.received_at) return a.received_at < b.received_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createMockApi(role: Role, store: MockStore = sharedStore, delayMs = 150): Api {
  const fail = (status: number, code: string, message: string): never => {
    throw new ApiError(status, code, message, `mock-${Math.random().toString(36).slice(2, 10)}`);
  };
  const invalid = (message: string): never => fail(400, 'VALIDATION_ERROR', message);

  const call = async <T>(permission: string, fn: () => T): Promise<T> => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (!PERMISSIONS[role].includes(permission)) {
      fail(403, 'FORBIDDEN', 'role is not allowed to perform this operation');
    }
    return fn();
  };

  const view = (v: StoredVehicle): Vehicle => {
    const age = ageDays(v.received_at);
    return {
      id: v.id,
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      price: v.price,
      received_at: v.received_at,
      age_days: age,
      is_aging: age > store.threshold,
      current_action: v.current_action,
      current_action_at: v.current_action_at,
    };
  };

  const list = (q: ListQuery): VehiclePage => {
    const limit = q.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) invalid('limit must be between 1 and 200');
    for (const [name, value] of [['min_age_days', q.min_age_days], ['max_age_days', q.max_age_days]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 36500)) {
        invalid(`${name} must be between 0 and 36500`);
      }
    }
    if (q.min_age_days !== undefined && q.max_age_days !== undefined && q.min_age_days > q.max_age_days) {
      invalid('min_age_days must not exceed max_age_days');
    }
    let cursor: { received_at: string; id: string } | undefined;
    if (q.cursor) {
      try {
        const decoded = JSON.parse(atob(q.cursor)) as { d: string; id: string };
        if (!decoded.d || !decoded.id) throw new Error('incomplete');
        cursor = { received_at: decoded.d, id: decoded.id };
      } catch {
        invalid('invalid cursor');
      }
    }
    const rows = store.vehicles
      .filter((v) => {
        if (v.status !== 'IN_STOCK') return false;
        if (q.make && v.make !== q.make) return false;
        if (q.model && v.model !== q.model) return false;
        const age = ageDays(v.received_at);
        if (q.min_age_days !== undefined && age < q.min_age_days) return false;
        if (q.max_age_days !== undefined && age > q.max_age_days) return false;
        if (q.aging && age <= store.threshold) return false;
        return !cursor || compareKey(v, cursor) > 0;
      })
      .sort(compareKey);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(view),
      next_cursor: rows.length > limit ? btoa(JSON.stringify({ d: last.received_at, id: last.id })) : null,
    };
  };

  const validateIngest = (body: unknown): { vehicles: Record<string, unknown>[] } => {
    const vehicles = (body as { vehicles?: unknown } | null)?.vehicles;
    if (!Array.isArray(vehicles) || vehicles.length < 1 || vehicles.length > 1000) {
      invalid('vehicles must contain 1 to 1000 items');
    }
    return { vehicles: vehicles as Record<string, unknown>[] };
  };

  return {
    listVehicles: (q) => call('read', () => list(q)),
    listAging: (q) => call('read', () => list({ ...q, aging: true })),

    summary: () =>
      call('read', (): Summary => {
        const inStock = store.vehicles.filter((v) => v.status === 'IN_STOCK');
        const aging = inStock.filter((v) => ageDays(v.received_at) > store.threshold);
        const byMake = new Map<string, number>();
        const byAction = new Map<ActionType | null, number>();
        for (const v of aging) {
          byMake.set(v.make, (byMake.get(v.make) ?? 0) + 1);
          byAction.set(v.current_action, (byAction.get(v.current_action) ?? 0) + 1);
        }
        return {
          total_in_stock: inStock.length,
          aging_count: aging.length,
          aging_pct: inStock.length ? Math.round((1000 * aging.length) / inStock.length) / 10 : 0,
          threshold_days: store.threshold,
          aging_by_make: [...byMake]
            .map(([make, count]) => ({ make, count }))
            .sort((a, b) => b.count - a.count || a.make.localeCompare(b.make)),
          aging_by_action: [...byAction]
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count),
        };
      }),

    logAction: (vehicleId, body, key) =>
      call('act', () => {
        if (key.length < 1 || key.length > 128) {
          invalid('Idempotency-Key header is required (1 to 128 characters)');
        }
        if (!ACTION_TYPES.includes(body.action_type as ActionType)) {
          invalid(`unknown action_type "${body.action_type}"`);
        }
        const note = body.note ? body.note : null;
        if (note && [...note].length > 1000) invalid('note must be at most 1000 characters');

        const hash = JSON.stringify([vehicleId, body.action_type, body.note ?? null]);
        const seen = store.idempotency.get(key);
        if (seen) {
          if (seen.hash !== hash) fail(409, 'CONFLICT', 'Idempotency-Key was already used with a different request');
          return { action: seen!.action, replayed: true };
        }
        const vehicle = store.vehicles.find((v) => v.id === vehicleId);
        if (!vehicle) return fail(404, 'NOT_FOUND', `vehicle ${vehicleId} not found`);
        if (vehicle.status !== 'IN_STOCK') fail(409, 'CONFLICT', `vehicle ${vehicleId} is not in stock`);

        const action: Action = {
          id: crypto.randomUUID(),
          vehicle_id: vehicleId,
          action_type: body.action_type as ActionType,
          note,
          created_by: `demo-${role}`,
          created_at: new Date().toISOString(),
        };
        store.actions.push(action);
        vehicle.current_action = action.action_type;
        vehicle.current_action_at = action.created_at;
        store.idempotency.set(key, { hash, action });
        return { action, replayed: false };
      }),

    history: (vehicleId, limit = 200) =>
      call('read', () => {
        if (!store.vehicles.some((v) => v.id === vehicleId)) fail(404, 'NOT_FOUND', `vehicle ${vehicleId} not found`);
        return store.actions
          .filter((a) => a.vehicle_id === vehicleId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit);
      }),

    getThreshold: () => call('read', () => store.threshold),

    setThreshold: (days) =>
      call('act', () => {
        if (!Number.isInteger(days) || days < 1 || days > 3650) invalid('days must be between 1 and 3650');
        store.threshold = days;
        return days;
      }),

    ingest: (body) =>
      call('ingest', (): IngestResult => {
        const { vehicles } = validateIngest(body);
        const known = ['vin', 'make', 'model', 'year', 'price', 'received_at', 'status'];
        const seen = new Set<string>();
        const parsed = vehicles.map((raw, i) => {
          const at = `vehicles[${i}]: `;
          for (const field of Object.keys(raw)) {
            if (!known.includes(field)) invalid(`invalid JSON body: json: unknown field "${field}"`);
          }
          const vin = String(raw.vin ?? '').trim().toUpperCase();
          if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) invalid(`${at}vin must be 17 characters A-Z/0-9 excluding I, O, Q`);
          if (seen.has(vin)) invalid(`${at}duplicate vin ${vin}`);
          seen.add(vin);
          const make = String(raw.make ?? '').trim();
          const model = String(raw.model ?? '').trim();
          if (!make || !model) invalid(`${at}make and model are required (max 64 characters)`);
          const year = Number(raw.year);
          if (!Number.isInteger(year) || year < 1900 || year > new Date().getUTCFullYear() + 2) {
            invalid(`${at}year ${String(raw.year)} is out of range`);
          }
          const price = raw.price === undefined || raw.price === null ? null : Number(raw.price);
          if (price !== null && (!(price >= 0) || Math.round(price * 100) / 100 !== price)) {
            invalid(`${at}price must be a non-negative number with at most 2 decimals`);
          }
          const received = String(raw.received_at ?? '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(received) || Number.isNaN(Date.parse(received))) {
            invalid(`${at}received_at must be a YYYY-MM-DD date`);
          }
          if (Date.parse(`${received}T00:00:00Z`) > todayMs()) invalid(`${at}received_at must not be in the future`);
          const status = (raw.status ?? 'IN_STOCK') as Status;
          if (!['IN_STOCK', 'SOLD', 'REMOVED'].includes(status)) invalid(`${at}unknown vehicle status "${status}"`);
          return { vin, make, model, year, price, received_at: received, status };
        });

        const result: IngestResult = { inserted: 0, updated: 0 };
        for (const v of parsed) {
          const existing = store.vehicles.find((x) => x.vin === v.vin);
          if (!existing) {
            store.vehicles.push({ ...v, id: crypto.randomUUID(), current_action: null, current_action_at: null });
            result.inserted++;
          } else if (
            existing.make !== v.make ||
            existing.model !== v.model ||
            existing.year !== v.year ||
            existing.price !== v.price ||
            existing.received_at !== v.received_at ||
            existing.status !== v.status
          ) {
            Object.assign(existing, v);
            result.updated++;
          }
        }
        return result;
      }),
  };
}
