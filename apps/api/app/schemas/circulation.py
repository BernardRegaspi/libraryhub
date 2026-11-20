from pydantic import BaseModel


class DeskPatronOut(BaseModel):
    patron_id: int | None = None
    firstname: str | None = None
    surname: str | None = None
    preferred_name: str | None = None
    cardnumber: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    library_id: str | None = None
    library_name: str | None = None
    expiry_date: str | None = None
    expired: int | bool | None = None
    restricted: int | bool | None = None
    patron_card_lost: int | bool | None = None
    checkouts_count: int | None = None
    overdues_count: int | None = None
    balance: float | int | str | None = None


class DeskItemOut(BaseModel):
    item_id: int | None = None
    biblio_id: int | None = None
    title: str | None = None
    author: str | None = None
    call_number: str | None = None
    item_type_id: str | None = None
    item_type_label: str | None = None
    home_library_id: str | None = None
    home_library_name: str | None = None
    holding_library_id: str | None = None
    holding_library_name: str | None = None
    status: str | None = None
    status_label: str | None = None
    external_id: str | None = None


class LoansCapabilityOut(BaseModel):
    scope: str
    filters: list[str]


class CapabilitiesOut(BaseModel):
    checkout: bool
    checkin: bool
    renew: bool
    history: bool
    renewal_preview: bool
    checkin_confirmation: bool
    loans: LoansCapabilityOut
    single_loan: bool