from pydantic import BaseModel


class SearchParams(BaseModel):
    q: str = ""
    field: str = "keyword"
    page: int = 1
    per_page: int = 20
    sort: str = "title"
    direction: str = "asc"
    year_from: int | None = None
    year_to: int | None = None
    letter: str | None = None
    author: str | None = None
    publisher: str | None = None
    availability: str | None = None
    library: str | None = None


class SavedSearchIn(BaseModel):
    label: str
    q: str
    field: str = "keyword"
    sort: str = "title"
    direction: str = "asc"
    year_from: int | None = None
    year_to: int | None = None

