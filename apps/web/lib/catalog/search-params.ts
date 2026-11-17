export type CatalogSearchState = {
  q: string;
  field: string;
  sort: string;
  direction: "asc" | "desc";
  page: number;
  perPage: number;
  view: "cover" | "list";
  yearFrom: number | null;
  yearTo: number | null;
};

const PER_PAGE_VALUES = new Set([10, 20, 40]);
const VIEW_VALUES = new Set<CatalogSearchState["view"]>(["cover", "list"]);

function parseYear(value: string | null): number | null {
  if (value === null || value === "") {
    return null;
  }
  const year = Number.parseInt(value, 10);
  return Number.isNaN(year) ? null : year;
}

function parsePage(value: string | null): number {
  const page = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return page;
}

function parsePerPage(value: string | null): number {
  const perPage = Number.parseInt(value ?? "20", 10);
  if (PER_PAGE_VALUES.has(perPage)) {
    return perPage;
  }
  return 20;
}

function parseDirection(value: string | null): CatalogSearchState["direction"] {
  if (value === "desc") {
    return "desc";
  }
  return "asc";
}

function parseView(value: string | null): CatalogSearchState["view"] {
  const view = (value ?? "cover") as CatalogSearchState["view"];
  return VIEW_VALUES.has(view) ? view : "cover";
}

export function parseCatalogSearch(params: URLSearchParams): CatalogSearchState {
  return {
    q: params.get("q") ?? "",
    field: params.get("field") ?? "keyword",
    sort: params.get("sort") ?? "title",
    direction: parseDirection(params.get("direction")),
    page: parsePage(params.get("page")),
    perPage: parsePerPage(params.get("per_page")),
    view: parseView(params.get("view")),
    yearFrom: parseYear(params.get("year_from")),
    yearTo: parseYear(params.get("year_to")),
  };
}

export function serializeCatalogSearch(state: CatalogSearchState): string {
  const params = new URLSearchParams();
  if (state.q) {
    params.set("q", state.q);
  }
  params.set("field", state.field);
  params.set("sort", state.sort);
  params.set("direction", state.direction);
  params.set("page", String(state.page));
  params.set("per_page", String(state.perPage));
  params.set("view", state.view);
  if (state.yearFrom !== null) {
    params.set("year_from", String(state.yearFrom));
  }
  if (state.yearTo !== null) {
    params.set("year_to", String(state.yearTo));
  }
  return params.toString();
}