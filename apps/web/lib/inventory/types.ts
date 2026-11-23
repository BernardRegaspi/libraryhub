export type InventoryView =
  | "overview"
  | "scan"
  | "exceptions"
  | "adjustments"
  | "audit";

export type InventoryCapabilities = {
  item_list: boolean;
  locations: boolean;
  item_update: boolean;
  update_fields: string[];
};

export type ScopeOptions = {
  item_types: Array<{ id: string; label: string }>;
  locations: Array<{ id: string; label: string }>;
  home_library_id: string | null;
};

export type InventoryOperator = {
  id: string;
  display_name: string;
  username: string;
};

export type SessionStatus = "draft" | "in_progress" | "completed" | "cancelled";

export type InventorySession = {
  id: string;
  department_id: string;
  name: string;
  description: string | null;
  status: SessionStatus;
  home_library_id: string;
  item_type_id: number | null;
  start_on: string;
  target_on: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  reopened_at: string | null;
  snapshot_taken_at: string | null;
  expected_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  locations: string[];
  operator_ids: string[];
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
};

export type SessionSummary = {
  expected: number;
  scanned: number;
  unverified: number;
  open_exceptions: number;
  proposals_open: number;
  found: number;
  misplaced: number;
  damaged: number;
  withdrawn: number;
  unexpected: number;
  completion: number;
};

export type ItemCondition =
  | "all"
  | "unverified"
  | "found"
  | "not_found"
  | "misplaced"
  | "unexpected"
  | "damaged"
  | "withdrawn";

export type InventoryItemRow = {
  expected_item_id: string | null;
  scan_id: string | null;
  shelf_search_id: string | null;
  barcode?: string;
  koha_item_id: number | string;
  title: string;
  author: string;
  call_number: string;
  item_type: string;
  snapshot_location: string;
  live_or_station_location: string;
  condition: string;
  koha_status: string;
  scanned_at: string;
  operator_name: string;
  operator_id?: string | null;
  remark: string;
  observed_damaged?: boolean;
};

export type ScanResponse = {
  id?: string;
  outcome: string;
  match_basis: string | null;
  observed_damaged: boolean;
  counts: boolean;
  koha_item_id: number | null;
  title: string | null;
  live_status: string | null;
  station_location: string | null;
  live_location: string | null;
  external_id?: string;
  barcode_submitted?: string;
  original_outcome?: string;
};

export type InventoryAdjustment = {
  id: string;
  session_id: string;
  koha_item_id: number;
  expected_item_id: string | null;
  scan_id: string | null;
  field: string;
  from_value: string | null;
  to_value: string;
  reason: string;
  status: string;
  drafted_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  submitted_at: string | null;
  koha_http_status: number | null;
  koha_error: string | null;
};

export type AuditLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type ExportKind = "findings" | "filter" | "unverified" | "work_order";
export type ExportFormat = "csv" | "xlsx";