from app.integrations.koha.circulation import (
    CirculationCapabilities,
    capabilities_payload,
    get_circulation_capabilities,
)
from app.services.circulation_errors import CirculationError, unsupported_write


def test_default_capabilities_are_unset_except_patron_loans():
    caps = get_circulation_capabilities()
    assert isinstance(caps, CirculationCapabilities)
    assert caps.loans_scope == "patron"
    assert caps.checkout is None
    assert caps.checkin is None
    assert caps.renew is None
    assert caps.history is None
    assert caps.renewal_preview is None
    assert caps.checkin_confirmation is False
    assert caps.single_loan is None
    payload = capabilities_payload(caps)
    assert payload["checkout"] is False
    assert payload["checkin"] is False
    assert payload["renew"] is False
    assert payload["history"] is False
    assert payload["loans"]["scope"] == "patron"
    assert payload["renewal_preview"] is False
    assert payload["checkin_confirmation"] is False


def test_unsupported_write_error_message():
    exc = unsupported_write()
    assert exc.status_code == 501
    assert exc.code == "circulation_unsupported"
    assert exc.message == "This Koha operation is not available."
    assert isinstance(exc, CirculationError)