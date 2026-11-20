from pydantic import BaseModel, ConfigDict


class PatronSearchParams(BaseModel):
    q: str = ""
    category_id: str | None = None
    library_id: str | None = None
    status: str | None = None
    page: int = 1
    per_page: int = 20
    sort: str = "surname"
    direction: str = "asc"


class PatronWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    surname: str | None = None
    firstname: str | None = None
    preferred_name: str | None = None
    cardnumber: str | None = None
    userid: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    library_id: str | None = None
    category_id: str | None = None
    expiry_date: str | None = None
    date_of_birth: str | None = None
    address: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    staff_notes: str | None = None
    confirm_duplicate: bool = False