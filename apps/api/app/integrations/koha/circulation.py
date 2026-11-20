from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WriteCapability:
    method: str
    path: str


@dataclass(frozen=True)
class CirculationCapabilities:
    checkout: WriteCapability | None = None
    checkin: WriteCapability | None = None
    renew: WriteCapability | None = None
    loans_scope: str = "patron"
    history: WriteCapability | None = None
    renewal_preview: WriteCapability | None = None
    checkin_confirmation: bool = False
    single_loan: WriteCapability | None = None


def get_circulation_capabilities() -> CirculationCapabilities:
    return CirculationCapabilities()


def capabilities_payload(caps: CirculationCapabilities) -> dict:
    return {
        "checkout": caps.checkout is not None,
        "checkin": caps.checkin is not None,
        "renew": caps.renew is not None,
        "history": caps.history is not None,
        "renewal_preview": caps.renewal_preview is not None,
        "checkin_confirmation": caps.checkin_confirmation,
        "loans": {
            "scope": caps.loans_scope,
            "filters": ["q", "patron_id", "overdue", "page", "per_page", "sort", "direction"],
        },
        "single_loan": caps.single_loan is not None,
    }