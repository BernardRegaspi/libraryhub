from uuid import UUID

from pydantic import BaseModel


class SessionCreateIn(BaseModel):
    name: str
    home_library_id: str
    location: str | None = None


class ScanIn(BaseModel):
    client_scan_id: UUID
    barcode: str


class SessionListParams(BaseModel):
    q: str = ""
    status: str | None = None
    page: int = 1
    per_page: int = 20
    sort: str = "created_at"
    direction: str = "desc"


class ScanListParams(BaseModel):
    q: str = ""
    outcome: str | None = None
    exceptions: bool = False
    page: int = 1
    per_page: int = 20
    sort: str = "scanned_at"
    direction: str = "desc"