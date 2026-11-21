from pydantic import BaseModel


class SessionListParams(BaseModel):
    q: str = ""
    status: str | None = None
    page: int = 1
    per_page: int = 20
    sort: str = "created_at"
    direction: str = "desc"