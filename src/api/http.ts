import {
  type Action,
  type Api,
  ApiError,
  type IngestResult,
  type ListQuery,
  type Summary,
  type VehiclePage,
} from './types';

const UNREACHABLE = 'Cannot reach the backend. Is it running? Try: docker compose up -d in KL_Test.';

function queryString(q: ListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Talks to the real API. onUnauthorized fires on any 401 so the app can sign out. */
export function createHttpApi(token: string, onUnauthorized: () => void): Api {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ data: T; headers: Headers }> {
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', UNREACHABLE);
    }
    const payload: unknown = await res.json().catch(() => undefined);
    if (res.ok) return { data: payload as T, headers: res.headers };

    if (res.status === 401) onUnauthorized();
    const err = (payload as { error?: { code: string; message: string; request_id: string } } | undefined)?.error;
    // A response without our error shape comes from the proxy: the API is down.
    if (!err) throw new ApiError(res.status, 'NETWORK', UNREACHABLE);
    throw new ApiError(res.status, err.code, err.message, err.request_id);
  }

  return {
    listVehicles: async (q) => (await request<VehiclePage>('GET', `/v1/vehicles${queryString(q)}`)).data,
    listAging: async (q) => (await request<VehiclePage>('GET', `/v1/vehicles/aging${queryString(q)}`)).data,
    summary: async () => (await request<Summary>('GET', '/v1/dashboard/summary')).data,
    logAction: async (vehicleId, body, idempotencyKey) => {
      const { data, headers } = await request<Action>('POST', `/v1/vehicles/${vehicleId}/actions`, body, {
        'Idempotency-Key': idempotencyKey,
      });
      return { action: data, replayed: headers.get('Idempotency-Replayed') === 'true' };
    },
    history: async (vehicleId, limit = 200) =>
      (await request<{ items: Action[] }>('GET', `/v1/vehicles/${vehicleId}/actions?limit=${limit}`)).data.items,
    getThreshold: async () => (await request<{ days: number }>('GET', '/v1/settings/aging-threshold')).data.days,
    setThreshold: async (days) =>
      (await request<{ days: number }>('PUT', '/v1/settings/aging-threshold', { days })).data.days,
    ingest: async (body) => (await request<IngestResult>('POST', '/v1/ingest/vehicles', body)).data,
  };
}
