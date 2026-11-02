// Mirrors KL_Test/api/openapi.yaml. Field names match the wire format.

export type Role = 'viewer' | 'manager' | 'ingest';

export const ACTION_TYPES = [
  'PRICE_REDUCTION_PLANNED',
  'PRICE_REDUCED',
  'TRANSFER_PLANNED',
  'WHOLESALE_PLANNED',
  'PROMOTION_PLANNED',
  'NO_ACTION_NEEDED',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  price: number | null;
  received_at: string;
  age_days: number;
  is_aging: boolean;
  current_action: ActionType | null;
  current_action_at: string | null;
}

export interface VehiclePage {
  items: Vehicle[];
  next_cursor: string | null;
}

export interface ListQuery {
  make?: string;
  model?: string;
  min_age_days?: number;
  max_age_days?: number;
  aging?: boolean;
  cursor?: string;
  limit?: number;
}

export interface Action {
  id: string;
  vehicle_id: string;
  action_type: ActionType;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface Summary {
  total_in_stock: number;
  aging_count: number;
  aging_pct: number;
  threshold_days: number;
  aging_by_make: { make: string; count: number }[];
  aging_by_action: { action: ActionType | null; count: number }[];
}

export interface IngestVehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
  price?: number | null;
  received_at: string;
  status?: 'IN_STOCK' | 'SOLD' | 'REMOVED';
}

export interface IngestResult {
  inserted: number;
  updated: number;
}

export interface LogActionBody {
  action_type: string;
  note?: string;
}

export interface LogActionResult {
  action: Action;
  replayed: boolean;
}

export interface Api {
  listVehicles(q: ListQuery): Promise<VehiclePage>;
  listAging(q: ListQuery): Promise<VehiclePage>;
  summary(): Promise<Summary>;
  logAction(vehicleId: string, body: LogActionBody, idempotencyKey: string): Promise<LogActionResult>;
  history(vehicleId: string, limit?: number): Promise<Action[]>;
  getThreshold(): Promise<number>;
  setThreshold(days: number): Promise<number>;
  ingest(body: unknown): Promise<IngestResult>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
