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
  letter: string | null;
  author: string;
  publisher: string;
  availability: "" | "available" | "on_loan";
  library: string;
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

function parseLetter(value: string | null): string | null {
  if (value === null || value === "") {
    return null;
  }
  const ch = value.trim().toUpperCase();
  if (ch.length === 1 && ch >= "A" && ch <= "Z") {
    return ch;
  }
  return null;
}

function parseAvailability(
  value: string | null,
): CatalogSearchState["availability"] {
  if (value === "available" || value === "on_loan") {
    return value;
  }
  return "";
}

function trimParam(value: string | null): string {
  return (value ?? "").trim();
}

export function parseCatalogSearch(params: URLSearchParams): CatalogSearchState {
  const rawSort = params.get("sort") ?? "title";
  const sort = rawSort === "copyright_date" ? "title" : rawSort;
  const direction =
    rawSort === "copyright_date"
      ? "asc"
      : parseDirection(params.get("direction"));

  return {
    q: params.get("q") ?? "",
    field: params.get("field") ?? "keyword",
    sort,
    direction,
    page: parsePage(params.get("page")),
    perPage: parsePerPage(params.get("per_page")),
    view: parseView(params.get("view")),
    yearFrom: parseYear(params.get("year_from")),
    yearTo: parseYear(params.get("year_to")),
    letter: parseLetter(params.get("letter")),
    author: trimParam(params.get("author")),
    publisher: trimParam(params.get("publisher")),
    availability: parseAvailability(params.get("availability")),
    library: trimParam(params.get("library")),
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
  if (state.letter) {
    params.set("letter", state.letter);
  }
  if (state.author) {
    params.set("author", state.author);
  }
  if (state.publisher) {
    params.set("publisher", state.publisher);
  }
  if (state.availability) {
    params.set("availability", state.availability);
  }
  if (state.library) {
    params.set("library", state.library);
  }
  return params.toString();
}