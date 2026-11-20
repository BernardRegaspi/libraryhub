export type PatronDirectoryItem = {
  patron_id: number;
  firstname: string | null;
  surname: string | null;
  preferred_name: string | null;
  cardnumber: string | null;
  category_id: string | null;
  category_name: string | null;
  library_id: string | null;
  library_name: string | null;
  expiry_date: string | null;
  expired: number;
  restricted: number;
  patron_card_lost: number;
  checkouts_count: number | null;
  overdues_count: number | null;
};

export type PatronDetail = PatronDirectoryItem & {
  userid: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  date_enrolled: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  staff_notes?: string | null;
};

export type PatronCategoryOption = {
  patron_category_id: string;
  name: string;
};

export type PatronLibraryOption = {
  id: string;
  name: string;
};

export type PatronOptionsResponse = {
  categories: PatronCategoryOption[] | null;
  libraries: PatronLibraryOption[] | null;
};

export type PatronSearchResponse = {
  query: string;
  page: number;
  per_page: number;
  total: number | null;
  sort: string;
  direction: string;
  category_id: string | null;
  library_id: string | null;
  status: string | null;
  has_next: boolean;
  items: PatronDirectoryItem[];
};

export type PatronCheckoutItem = {
  checkout_id: number | null;
  item_id: number | null;
  title: string | null;
  checkout_date: string | null;
  due_date: string | null;
  renewals_count: number | null;
  overdue: boolean;
  external_id?: string | null;
};

export type PatronHoldItem = {
  hold_id: number | null;
  status: string | null;
  hold_date: string | null;
  waiting_date: string | null;
  expiration_date: string | null;
  pickup_library_id: string | null;
  pickup_library_name: string | null;
  biblio_id: number | null;
  title: string | null;
};

export type PatronActivity<T> =
  | { status: "ok"; items: T[] }
  | { status: "unavailable" };

export type PatronCheckoutsResponse = PatronActivity<PatronCheckoutItem>;

export type PatronHoldsResponse = PatronActivity<PatronHoldItem>;