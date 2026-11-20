export type PatronSearchState = {
  q: string;
  categoryId: string;
  libraryId: string;
  status: "" | "active" | "expired" | "restricted";
  page: number;
  sort: "surname" | "firstname" | "cardnumber" | "category_id" | "expiry_date";
  direction: "asc" | "desc";
};

const SORT_VALUES = new Set<PatronSearchState["sort"]>([
  "surname",
  "firstname",
  "cardnumber",
  "category_id",
  "expiry_date",
]);

const STATUS_VALUES = new Set<PatronSearchState["status"]>([
  "",
  "active",
  "expired",
  "restricted",
]);

function parsePage(value: string | null): number {
  const page = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return page;
}

function parseDirection(value: string | null): PatronSearchState["direction"] {
  if (value === "desc") {
    return "desc";
  }
  return "asc";
}

function parseSort(value: string | null): PatronSearchState["sort"] {
  const sort = (value ?? "surname") as PatronSearchState["sort"];
  return SORT_VALUES.has(sort) ? sort : "surname";
}

function parseStatus(value: string | null): PatronSearchState["status"] {
  const status = (value ?? "") as PatronSearchState["status"];
  return STATUS_VALUES.has(status) ? status : "";
}

function trimQ(value: string | null): string {
  const q = value ?? "";
  return q.length > 80 ? q.slice(0, 80) : q;
}

function trimParam(value: string | null): string {
  return (value ?? "").trim();
}

export function parsePatronSearch(params: URLSearchParams): PatronSearchState {
  return {
    q: trimQ(params.get("q")),
    categoryId: trimParam(params.get("category_id")),
    libraryId: trimParam(params.get("library_id")),
    status: parseStatus(params.get("status")),
    page: parsePage(params.get("page")),
    sort: parseSort(params.get("sort")),
    direction: parseDirection(params.get("direction")),
  };
}

export function serializePatronSearch(state: PatronSearchState): string {
  const params = new URLSearchParams();
  if (state.q) {
    params.set("q", state.q);
  }
  if (state.categoryId) {
    params.set("category_id", state.categoryId);
  }
  if (state.libraryId) {
    params.set("library_id", state.libraryId);
  }
  if (state.status) {
    params.set("status", state.status);
  }
  if (state.page !== 1) {
    params.set("page", String(state.page));
  }
  if (state.sort !== "surname") {
    params.set("sort", state.sort);
  }
  if (state.direction !== "asc") {
    params.set("direction", state.direction);
  }
  return params.toString();
}