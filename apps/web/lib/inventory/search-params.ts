export type InventorySearchState = {
  q: string;
  status: "" | "draft" | "in_progress" | "in_review" | "cancelled";
  page: number;
  sort: "created_at" | "reference" | "name" | "status";
  direction: "asc" | "desc";
};

const SORT_VALUES = new Set<InventorySearchState["sort"]>([
  "created_at",
  "reference",
  "name",
  "status",
]);

const STATUS_VALUES = new Set<InventorySearchState["status"]>([
  "",
  "draft",
  "in_progress",
  "in_review",
  "cancelled",
]);

function parsePage(value: string | null): number {
  const page = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return page;
}

function parseDirection(value: string | null): InventorySearchState["direction"] {
  if (value === "asc") {
    return "asc";
  }
  return "desc";
}

function parseSort(value: string | null): InventorySearchState["sort"] {
  if (value === null) {
    return "created_at";
  }
  const sort = value as InventorySearchState["sort"];
  return SORT_VALUES.has(sort) ? sort : "created_at";
}

function parseStatus(value: string | null): InventorySearchState["status"] {
  const status = (value ?? "") as InventorySearchState["status"];
  return STATUS_VALUES.has(status) ? status : "";
}

function trimQ(value: string | null): string {
  const q = value ?? "";
  return q.length > 80 ? q.slice(0, 80) : q;
}

export function parseInventorySearch(
  params: URLSearchParams,
): InventorySearchState {
  const rawSort = params.get("sort");
  const sortKnown =
    rawSort === null ||
    SORT_VALUES.has(rawSort as InventorySearchState["sort"]);
  const sort = parseSort(rawSort);
  const direction = sortKnown ? parseDirection(params.get("direction")) : "desc";

  return {
    q: trimQ(params.get("q")),
    status: parseStatus(params.get("status")),
    page: parsePage(params.get("page")),
    sort,
    direction,
  };
}

export function serializeInventorySearch(state: InventorySearchState): string {
  const params = new URLSearchParams();
  if (state.q) {
    params.set("q", state.q);
  }
  if (state.status) {
    params.set("status", state.status);
  }
  if (state.page !== 1) {
    params.set("page", String(state.page));
  }
  if (state.sort !== "created_at") {
    params.set("sort", state.sort);
  }
  if (state.direction !== "desc") {
    params.set("direction", state.direction);
  }
  return params.toString();
}