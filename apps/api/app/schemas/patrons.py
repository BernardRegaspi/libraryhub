from pydantic import BaseModel


class PatronSearchParams(BaseModel):
    q: str = ""
    category_id: str | None = None
    library_id: str | None = None
    status: str | None = None
    page: int = 1
    per_page: int = 20
    sort: str = "surname"
    direction: str = "asc"