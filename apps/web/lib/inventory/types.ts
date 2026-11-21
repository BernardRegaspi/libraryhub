export type InventorySessionCounters = {
  expected_count: number;
  seen: number;
  verified: number;
  misplaced: number;
  unexpected: number;
  not_found: number;
  withdrawn: number;
  damaged: number;
  other_exception: number;
  needs_a_look: number;
  duplicates: number;
  remaining: number;
};

export type InventorySessionStatus =
  | "draft"
  | "in_progress"
  | "in_review"
  | "cancelled";

export type InventorySession = {
  id: string;
  reference: string;
  name: string;
  status: InventorySessionStatus;
  home_library_id: string;
  home_library_name: string | null;
  location: string | null;
  expected_count: number;
  started_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  counters: InventorySessionCounters;
};

export type InventorySessionListResponse = {
  items: InventorySession[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
};

export type InventoryScanOutcome =
  | "verified"
  | "misplaced"
  | "unexpected"
  | "not_found"
  | "withdrawn"
  | "damaged"
  | "other_exception"
  | "duplicate";

export type InventoryScanReviewDecision = {
  action: string;
  decision: "approved" | "no_action" | null;
  decided_by: string | null;
  decided_at: string | null;
};

export type InventoryScan = {
  id: string;
  client_scan_id: string;
  barcode: string;
  outcome: InventoryScanOutcome;
  outcome_label: string;
  message: string;
  is_primary: boolean;
  title: string | null;
  author: string | null;
  call_number: string | null;
  item_type_id: string | null;
  item_type_label: string | null;
  home_library_id: string | null;
  home_library_name: string | null;
  holding_library_id: string | null;
  holding_library_name: string | null;
  location: string | null;
  koha_status: string | null;
  koha_status_label: string | null;
  scanned_at: string;
  decision: InventoryScanReviewDecision | null;
};

export type InventoryScanListResponse = {
  items: InventoryScan[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
};