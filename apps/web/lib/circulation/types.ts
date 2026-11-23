export type CirculationTab = "checkout" | "checkin" | "renew" | "loans" | "history";

export type DeskPatron = {
  patron_id: number | null;
  firstname: string | null;
  surname: string | null;
  preferred_name: string | null;
  cardnumber: string | null;
  category_id: string | null;
  category_name: string | null;
  library_id: string | null;
  library_name: string | null;
  expiry_date: string | null;
  expired: number | boolean | null;
  restricted: number | boolean | null;
  patron_card_lost: number | boolean | null;
  checkouts_count: number | null;
  overdues_count: number | null;
  balance: number | string | null;
};

export type DeskItem = {
  item_id: number | null;
  biblio_id: number | null;
  title: string | null;
  author: string | null;
  call_number: string | null;
  item_type_id: string | null;
  item_type_label: string | null;
  home_library_id: string | null;
  home_library_name: string | null;
  holding_library_id: string | null;
  holding_library_name: string | null;
  status: string | null;
  status_label: string | null;
  external_id: string | null;
};

export type LoansCapability = {
  scope: string;
  filters: string[];
};

export type CirculationCapabilities = {
  checkout: boolean;
  checkin: boolean;
  renew: boolean;
  history: boolean;
  renewal_preview: boolean;
  checkin_confirmation: boolean;
  loans: LoansCapability;
  single_loan: boolean;
};

export type PrintLine = {
  outcome: string;
  title: string;
  dueDate?: string;
  checkoutId?: number;
};

export type PrintInput = {
  type: string;
  patronName: string;
  cardnumber: string;
  confirmedAt: string;
  lines: PrintLine[];
};