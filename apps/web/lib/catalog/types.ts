export type CatalogAvailability = {
  status: string;
  label: string;
  copy_count: number;
  available_count: number;
  last_checked: string | null;
};

export type CatalogConfig = {
  fields: string[];
  sorts: string[];
  year_filter: boolean;
  opac_url: string | null;
};

export type CatalogHit = {
  biblio_id: number | null;
  title: string | null;
  author: string | null;
  edition: string | null;
  isbn: string | null;
  publication_year: number | string | null;
  item_type: string | null;
  availability: CatalogAvailability;
  has_cover: boolean;
};

export type CatalogLibrary = {
  id: string;
  name: string;
};

export type CatalogSearchResponse = {
  query: string;
  page: number;
  per_page: number;
  total: number | null;
  sort: string;
  direction: string;
  has_next: boolean;
  letter: string | null;
  author: string | null;
  publisher: string | null;
  availability: string | null;
  library: string | null;
  results: CatalogHit[];
};

export type CatalogRecord = {
  biblio_id: number;
  title?: string | null;
  author?: string | null;
  contributors?: string[];
  edition?: string | null;
  place?: string | null;
  publisher?: string | null;
  year?: number | string | null;
  isbns?: string[];
  subjects?: string[];
  description?: string | null;
};

export type CatalogCopy = {
  call_number: string | null;
  copy_number: number | null;
  item_type_id: string | number | null;
  item_type_label: string | null;
  home_library_id: string | number | null;
  home_library_name: string | null;
  holding_library_id: string | number | null;
  holding_library_name: string | null;
  location: string | null;
  status: string;
  status_label: string;
  barcode?: string | null;
};

export type CatalogItems = {
  copies: CatalogCopy[];
  last_checked: string | null;
  notice: string;
};

export type SavedSearchRow = {
  id: string;
  label: string | null;
  q: string;
  field: string;
  sort: string;
  direction: string;
  year_from: number | null;
  year_to: number | null;
  updated_at: string;
};