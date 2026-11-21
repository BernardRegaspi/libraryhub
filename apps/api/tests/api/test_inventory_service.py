import csv
import io
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from test_auth import add_user

from app.integrations.koha.exceptions import (
    KohaNotFound,
    KohaResponseError,
    KohaTimeoutError,
)
from app.models.identity import AuditLog, LibraryDepartment, UserRoleAssignment
from app.models.inventory import InventoryReviewDecision, InventoryScan, InventorySession
from app.schemas.inventory import ScanListParams, SessionListParams
from app.services.inventory import (
    InventoryError,
    cancel_session,
    create_session,
    export_exceptions,
    finish_session,
    get_session,
    list_scans,
    list_session_audit,
    list_sessions,
    record_scan,
    resume_session,
    save_decision,
    start_session,
)

PASSWORD = "local-secret"


def _stamp(db, model, ids: list[str], attr: str) -> None:
    base = datetime(2026, 11, 21, 8, 0, tzinfo=timezone.utc)
    for index, raw_id in enumerate(ids):
        row = db.get(model, UUID(raw_id))
        setattr(row, attr, base + timedelta(seconds=index))
    db.commit()


class _FakeKoha:
    def __init__(
        self,
        *,
        library_names: dict[str, str] | None = None,
        item_type_labels: dict[str, str] | None = None,
        expected_count: int = 4,
        count_error: Exception | None = None,
        library_names_error: Exception | None = None,
        item_type_labels_error: Exception | None = None,
        items_by_barcode: dict[str, list[dict]] | None = None,
        find_error: Exception | None = None,
    ) -> None:
        self._library_names = library_names if library_names is not None else {"CPL": "College Library"}
        self._item_type_labels = item_type_labels if item_type_labels is not None else {"BK": "Book"}
        self._expected_count = expected_count
        self._count_error = count_error
        self._library_names_error = library_names_error
        self._item_type_labels_error = item_type_labels_error
        self._items_by_barcode = items_by_barcode if items_by_barcode is not None else {}
        self._find_error = find_error
        self.find_calls: list[str] = []

    def library_names(self) -> dict[str, str]:
        if self._library_names_error is not None:
            raise self._library_names_error
        return self._library_names

    def item_type_labels(self) -> dict[str, str]:
        if self._item_type_labels_error is not None:
            raise self._item_type_labels_error
        return self._item_type_labels

    def count_items(self, *, home_library_id: str, location: str | None) -> int:
        if self._count_error is not None:
            raise self._count_error
        return self._expected_count

    def find_items_by_barcode(self, barcode: str) -> list[dict]:
        self.find_calls.append(barcode)
        if self._find_error is not None:
            raise self._find_error
        return list(self._items_by_barcode.get(barcode, []))


def _user_and_department(db):
    user = add_user(
        db,
        username="inv-librarian",
        email="inv-librarian@usant.edu.ph",
        display_name="Inv Librarian",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department_id = db.query(UserRoleAssignment).filter_by(user_id=user.id).one().department_id
    return user, department_id


def test_create_session_saves_draft_and_returns_counters(db):
    user, department_id = _user_and_department(db)
    client = _FakeKoha()

    result = create_session(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        name="  Shelf check  ",
        home_library_id="CPL",
        location="   ",
    )

    assert set(result) == {
        "id",
        "reference",
        "name",
        "status",
        "home_library_id",
        "home_library_name",
        "location",
        "expected_count",
        "started_at",
        "cancelled_at",
        "created_at",
        "counters",
    }
    assert result["name"] == "Shelf check"
    assert result["status"] == "draft"
    assert result["home_library_id"] == "CPL"
    assert result["home_library_name"] == "College Library"
    assert result["location"] is None
    assert result["expected_count"] == 4
    assert result["started_at"] is None
    assert result["cancelled_at"] is None
    assert re.fullmatch(r"INV-20[0-9]{2}-\d+", result["reference"])
    assert isinstance(result["created_at"], str)
    assert result["counters"]["expected_count"] == 4
    assert result["counters"]["remaining"] == 4

    row = db.query(InventorySession).filter_by(id=UUID(result["id"])).one()
    assert row.status == "draft"
    assert row.expected_count == 4
    assert row.location is None
    assert re.fullmatch(r"INV-20[0-9]{2}-\d+", row.reference)

    audit = db.query(AuditLog).filter_by(action="inventory.session.create").one()
    assert audit.user_id == user.id
    assert audit.module == "inventory"
    assert audit.entity_type == "inventory_session"
    assert audit.entity_id == result["id"]
    assert audit.details == {
        "reference": result["reference"],
        "home_library_id": "CPL",
        "location": None,
        "expected_count": 4,
    }


def test_create_session_count_timeout_leaves_no_row(db):
    user, department_id = _user_and_department(db)
    before = db.query(InventorySession).count()
    client = _FakeKoha(count_error=KohaTimeoutError())

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            name="Timeout shelf",
            home_library_id="CPL",
            location=None,
        )

    assert exc.value.code == "inventory_timeout"
    assert db.query(InventorySession).count() == before


def test_create_session_count_response_error_leaves_no_row(db):
    user, department_id = _user_and_department(db)
    before = db.query(InventorySession).count()
    client = _FakeKoha(count_error=KohaResponseError())

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            name="Bad count shelf",
            home_library_id="CPL",
            location=None,
        )

    assert exc.value.code == "inventory_count_unavailable"
    assert db.query(InventorySession).count() == before


def test_create_session_requires_department(db):
    user, _ = _user_and_department(db)
    client = _FakeKoha()

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=None,
            name="No department",
            home_library_id="CPL",
            location=None,
        )

    assert exc.value.code == "department_required"
    assert exc.value.message == "Choose a department before creating a session."
    assert db.query(InventorySession).count() == 0
    assert db.query(AuditLog).filter_by(action="inventory.session.create").count() == 0


def test_create_session_unknown_library_writes_no_row(db):
    user, department_id = _user_and_department(db)
    client = _FakeKoha()

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            name="Bad library",
            home_library_id="UNKNOWN",
            location=None,
        )

    assert exc.value.code == "validation_error"
    assert db.query(InventorySession).count() == 0


def _create_draft(db, user, department_id, name, *, home_library_id="CPL"):
    return create_session(
        db,
        _FakeKoha(),
        user_id=user.id,
        department_id=department_id,
        name=name,
        home_library_id=home_library_id,
        location=None,
    )


def _other_department_id(db):
    return db.query(LibraryDepartment).filter_by(code="JHS").one().id


def test_list_sessions_scoped_sorted_and_filtered(db):
    user, department_id = _user_and_department(db)
    other_department_id = _other_department_id(db)

    first = _create_draft(db, user, department_id, "Alpha shelf")
    second = _create_draft(db, user, department_id, "Beta shelf")
    _create_draft(db, user, other_department_id, "Other dept shelf")
    _stamp(db, InventorySession, [first["id"], second["id"]], "created_at")

    listed = list_sessions(
        db,
        department_id=department_id,
        params=SessionListParams(),
    )
    assert listed["total"] == 2
    assert len(listed["items"]) == 2
    assert [item["id"] for item in listed["items"]] == [second["id"], first["id"]]

    by_name = list_sessions(
        db,
        department_id=department_id,
        params=SessionListParams(q="alpha"),
    )
    assert len(by_name["items"]) == 1
    assert by_name["items"][0]["name"] == "Alpha shelf"

    percent_name = _create_draft(db, user, department_id, "50% done")
    _create_draft(db, user, department_id, "50X done")
    percent_search = list_sessions(
        db,
        department_id=department_id,
        params=SessionListParams(q="50%"),
    )
    assert {row["name"] for row in percent_search["items"]} == {"50% done"}

    drafts_only = list_sessions(
        db,
        department_id=department_id,
        params=SessionListParams(status="draft"),
    )
    assert all(item["status"] == "draft" for item in drafts_only["items"])


def test_list_sessions_invalid_page_and_department(db):
    user, department_id = _user_and_department(db)

    with pytest.raises(InventoryError) as exc:
        list_sessions(
            db,
            department_id=department_id,
            params=SessionListParams(page=0),
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_search"
    assert exc.value.message == "That search is not valid."

    with pytest.raises(InventoryError) as exc:
        list_sessions(db, department_id=None, params=SessionListParams())
    assert exc.value.status_code == 409
    assert exc.value.code == "department_required"
    assert exc.value.message == "Choose a department."


def test_get_session_department_mismatch(db):
    user, department_id = _user_and_department(db)
    other_department_id = _other_department_id(db)
    session = _create_draft(db, user, other_department_id, "Hidden shelf")

    with pytest.raises(InventoryError) as exc:
        get_session(db, department_id=department_id, session_id=UUID(session["id"]))

    assert exc.value.status_code == 404
    assert exc.value.code == "not_found"
    assert exc.value.message == "That inventory session was not found."


def test_start_session_and_cancel_session(db):
    user, department_id = _user_and_department(db)
    session = _create_draft(db, user, department_id, "Start me")
    session_id = UUID(session["id"])

    started = start_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert started["status"] == "in_progress"
    assert started["started_at"] is not None

    row = db.query(InventorySession).filter_by(id=session_id).one()
    assert row.status == "in_progress"
    assert row.started_by == user.id
    assert row.started_at is not None

    start_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.session.start", entity_id=str(session_id))
        .one()
    )
    assert start_audit.user_id == user.id

    with pytest.raises(InventoryError) as exc:
        start_session(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "session_not_draft"
    assert exc.value.message == "Only a draft session can be started."

    cancelled = cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert cancelled["status"] == "cancelled"
    assert cancelled["cancelled_at"] is not None

    row = db.query(InventorySession).filter_by(id=session_id).one()
    assert row.status == "cancelled"
    assert row.cancelled_by == user.id
    assert row.cancelled_at is not None

    cancel_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.session.cancel", entity_id=str(session_id))
        .one()
    )
    assert cancel_audit.user_id == user.id

    with pytest.raises(InventoryError) as exc:
        cancel_session(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "session_cancelled"
    assert exc.value.message == "This session is already cancelled."


def test_cancel_session_from_draft(db):
    user, department_id = _user_and_department(db)
    session = _create_draft(db, user, department_id, "Cancel draft")
    session_id = UUID(session["id"])

    cancelled = cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert cancelled["status"] == "cancelled"


_AVAILABLE_ITEM = {
    "item_id": 101,
    "biblio_id": 55,
    "external_id": "ITEM-101",
    "withdrawn": 0,
    "lost_status": 0,
    "damaged_status": 0,
    "not_for_loan_status": 0,
    "effective_not_for_loan_status": 0,
    "checked_out_date": None,
    "home_library_id": "CPL",
    "holding_library_id": "CPL",
    "location": "GEN",
    "item_type_id": "BK",
    "callnumber": "QA 76.73",
    "biblio": {"title": "Intro Python", "author": "Guido van Rossum"},
}


def _started_session(db, user, department_id, *, location="GEN"):
    session = create_session(
        db,
        _FakeKoha(),
        user_id=user.id,
        department_id=department_id,
        name="Scan session",
        home_library_id="CPL",
        location=location,
    )
    started = start_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=UUID(session["id"]),
    )
    return started, UUID(session["id"])


def test_record_scan_rejects_invalid_barcodes(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    client = _FakeKoha()

    for barcode in ("", "x" * 33):
        before = db.query(InventoryScan).count()
        with pytest.raises(InventoryError) as exc:
            record_scan(
                db,
                client,
                user_id=user.id,
                department_id=department_id,
                session_id=session_id,
                client_scan_id=uuid4(),
                barcode=barcode,
            )
        assert exc.value.code == "validation_error"
        assert db.query(InventoryScan).count() == before


def test_record_scan_empty_koha_list_not_found(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    client = _FakeKoha()

    result = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="MISSING-1",
    )

    scan = result["scan"]
    assert scan["outcome"] == "not_found"
    assert scan["is_primary"] is True
    assert scan["message"] == "No Koha item has this barcode."

    row = db.query(InventoryScan).one()
    assert row.outcome == "not_found"
    assert row.is_primary is True

    audit = db.query(AuditLog).filter_by(action="inventory.scan").one()
    assert audit.user_id == user.id
    assert audit.details == {
        "reference": db.query(InventorySession).filter_by(id=session_id).one().reference,
        "barcode": "MISSING-1",
        "outcome": "not_found",
    }

    loaded = get_session(db, department_id=department_id, session_id=session_id)
    assert loaded["counters"]["not_found"] == 1
    assert loaded["counters"]["needs_a_look"] == 1


def test_record_scan_verified_on_shelf(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    item = {**_AVAILABLE_ITEM, "external_id": "VER-1"}
    client = _FakeKoha(items_by_barcode={"VER-1": [item]})

    result = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="VER-1",
    )

    assert result["scan"]["outcome"] == "verified"
    assert result["scan"]["message"] == "On this shelf."
    assert result["scan"]["title"] == "Intro Python"
    assert result["counters"]["verified"] == 1


def test_record_scan_duplicate_barcode_skips_second_koha_lookup(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    item = {**_AVAILABLE_ITEM, "external_id": "DUP-BC"}
    client = _FakeKoha(items_by_barcode={"DUP-BC": [item]})

    first = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="DUP-BC",
    )
    assert first["counters"]["verified"] == 1

    second = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="DUP-BC",
    )

    assert len(client.find_calls) == 1
    assert second["scan"]["outcome"] == "duplicate"
    assert second["scan"]["title"] == first["scan"]["title"]
    assert second["counters"]["verified"] == 1
    assert second["counters"]["duplicates"] == 1


def test_record_scan_idempotent_client_scan_id(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    client = _FakeKoha()
    client_scan_id = uuid4()

    first = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=client_scan_id,
        barcode="ONCE-1",
    )
    second = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=client_scan_id,
        barcode="ONCE-1",
    )

    assert second["scan"]["id"] == first["scan"]["id"]
    assert db.query(InventoryScan).count() == 1
    assert db.query(AuditLog).filter_by(action="inventory.scan").count() == 1


def test_record_scan_koha_timeout_writes_nothing(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(find_error=KohaTimeoutError())

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="TIMEOUT-1",
        )

    assert exc.value.status_code == 504
    assert exc.value.code == "inventory_timeout"
    assert exc.value.message == (
        "Koha took too long to look up this barcode. The scan was not saved."
    )
    assert db.query(InventoryScan).count() == 0


@pytest.mark.parametrize(
    "items",
    [
        [{"item_id": 1}, {"item_id": 2}],
        [{"external_id": "BAD"}],
    ],
)
def test_record_scan_ambiguous_koha_response(db, items):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(items_by_barcode={"AMB-1": items})

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="AMB-1",
        )

    assert exc.value.code == "inventory_ambiguous"
    assert db.query(InventoryScan).count() == 0


def test_record_scan_requires_started_session(db):
    user, department_id = _user_and_department(db)
    draft = _create_draft(db, user, department_id, "Still draft")
    session_id = UUID(draft["id"])
    client = _FakeKoha()

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="NA",
        )
    assert exc.value.code == "session_not_started"

    start_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="NA",
        )
    assert exc.value.code == "session_cancelled"
    assert exc.value.message == "This session is cancelled."


def test_record_scan_same_item_second_barcode_is_duplicate(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    shared_item = {**_AVAILABLE_ITEM, "item_id": 777}
    client = _FakeKoha(
        items_by_barcode={
            "BAR-A": [{**shared_item, "external_id": "BAR-A"}],
            "BAR-B": [{**shared_item, "external_id": "BAR-B"}],
        }
    )

    record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="BAR-A",
    )
    second = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="BAR-B",
    )

    assert second["scan"]["outcome"] == "duplicate"
    primaries = db.query(InventoryScan).filter_by(session_id=session_id, is_primary=True).all()
    assert len(primaries) == 1
    assert db.query(InventoryScan).filter_by(session_id=session_id, outcome="duplicate").count() == 1


def test_record_scan_withdrawn_wrong_home_is_unexpected(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id, location=None)
    item = {
        **_AVAILABLE_ITEM,
        "external_id": "WD-1",
        "home_library_id": "UCL",
        "withdrawn": 1,
    }
    client = _FakeKoha(
        library_names={"CPL": "College Library", "UCL": "University Library"},
        items_by_barcode={"WD-1": [item]},
    )

    result = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="WD-1",
    )

    assert result["scan"]["outcome"] == "unexpected"
    assert result["counters"]["verified"] == 0


def test_record_scan_koha_not_found_does_not_save(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(find_error=KohaNotFound())

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="NF-1",
        )

    assert exc.value.code == "inventory_unavailable"
    assert db.query(InventoryScan).count() == 0


def test_list_scans_filters_and_sorts(db):
    user, department_id = _user_and_department(db)
    _, session_id = _started_session(db, user, department_id)
    item_a = {**_AVAILABLE_ITEM, "item_id": 1, "external_id": "abc-1"}
    item_b = {**_AVAILABLE_ITEM, "item_id": 2, "external_id": "XYZ-2"}
    client = _FakeKoha(items_by_barcode={"abc-1": [item_a], "XYZ-2": [item_b]})

    first_scan = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="abc-1",
    )
    second_scan = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="XYZ-2",
    )
    _stamp(
        db,
        InventoryScan,
        [first_scan["scan"]["id"], second_scan["scan"]["id"]],
        "scanned_at",
    )

    listed = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(),
    )
    assert listed["total"] == 2
    assert listed["items"][0]["barcode"] == "XYZ-2"
    assert listed["items"][1]["barcode"] == "abc-1"

    by_query = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(q="abc"),
    )
    assert len(by_query["items"]) == 1
    assert by_query["items"][0]["barcode"] == "abc-1"

    verified_only = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(outcome="verified"),
    )
    assert len(verified_only["items"]) == 2
    assert all(row["outcome"] == "verified" for row in verified_only["items"])


def test_list_scans_invalid_search_and_department(db):
    user, department_id = _user_and_department(db)
    other_department_id = _other_department_id(db)
    _, session_id = _started_session(db, user, other_department_id)

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(sort="barcode"),
        )
    assert exc.value.code == "invalid_search"

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(page=0),
        )
    assert exc.value.code == "invalid_search"

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(),
        )
    assert exc.value.code == "not_found"


def test_list_scans_matches_title_and_exceptions(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(
        items_by_barcode={
            "ITEM-101": [_AVAILABLE_ITEM],
            "GONE": [],
        }
    )
    record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="ITEM-101",
    )
    record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )

    by_title = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(q="Intro Python"),
    )
    assert [item["barcode"] for item in by_title["items"]] == ["ITEM-101"]

    exceptions = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(exceptions=True),
    )
    assert [item["outcome"] for item in exceptions["items"]] == ["not_found"]

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(q="x" * 81),
        )
    assert exc.value.code == "invalid_search"

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(outcome="not_found", exceptions=True),
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_search"
    assert exc.value.message == "That search is not valid."


def test_list_sessions_accepts_in_review(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    listed = list_sessions(
        db,
        department_id=department_id,
        params=SessionListParams(status="in_review"),
    )
    assert [item["id"] for item in listed["items"]] == [str(session_id)]


def test_finish_and_resume_session(db):
    user, department_id = _user_and_department(db)
    started, session_id = _started_session(db, user, department_id)

    finished = finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert finished["status"] == "in_review"
    finish_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.session.finish", entity_id=str(session_id))
        .one()
    )
    assert finish_audit.module == "inventory"
    assert finish_audit.details["reference"] == started["reference"]

    again = None
    again_id = None
    for status_name in ("draft", "cancelled", "in_review"):
        if status_name == "draft":
            other = _create_draft(db, user, department_id, "Still a draft")
            target = UUID(other["id"])
        elif status_name == "cancelled":
            cancel_session(
                db,
                user_id=user.id,
                department_id=department_id,
                session_id=session_id,
            )
            target = session_id
        else:
            again, again_id = _started_session(db, user, department_id)
            finish_session(
                db,
                user_id=user.id,
                department_id=department_id,
                session_id=again_id,
            )
            target = again_id
        with pytest.raises(InventoryError) as exc:
            finish_session(
                db,
                user_id=user.id,
                department_id=department_id,
                session_id=target,
            )
        assert exc.value.status_code == 409
        assert exc.value.code == "session_not_scanning"
        assert exc.value.message == "Only a scanning session can be finished."
        assert db.get(InventorySession, target).status == status_name

    resumed = resume_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=again_id,
    )
    assert resumed["status"] == "in_progress"
    resume_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.session.resume", entity_id=str(again_id))
        .one()
    )
    assert resume_audit.details["reference"] == again["reference"]

    with pytest.raises(InventoryError) as exc:
        resume_session(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=again_id,
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "session_not_in_review"
    assert exc.value.message == "Only a session in review can return to scanning."


def test_scan_rejected_during_review_and_accepted_after_resume(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    before = db.query(InventoryScan).filter_by(session_id=session_id).count()

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            _FakeKoha(),
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="NOSUCHBC21",
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "session_in_review"
    assert exc.value.message == "Return to scanning before recording a barcode."
    assert db.query(InventoryScan).filter_by(session_id=session_id).count() == before

    resume_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    saved = record_scan(
        db,
        _FakeKoha(items_by_barcode={"NOSUCHBC21": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="NOSUCHBC21",
    )
    assert saved["scan"]["outcome"] == "not_found"


def test_list_scans_includes_saved_decision(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    missing = record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    scan_id = UUID(missing["scan"]["id"])
    save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision=None,
    )
    listed = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(),
    )
    item = next(i for i in listed["items"] if i["id"] == str(scan_id))
    assert item["decision"] is not None
    assert item["decision"]["action"] == "Search the shelf again"
    assert item["decision"]["decision"] is None


def test_save_decision_only_for_an_exception_during_review(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(items_by_barcode={"ITEM-101": [_AVAILABLE_ITEM], "GONE": []})
    verified = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="ITEM-101",
    )
    missing = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    duplicate = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    scan_id = UUID(missing["scan"]["id"])

    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=UUID(verified["scan"]["id"]),
            action="Search the shelf again",
            decision=None,
        )
    assert exc.value.status_code == 404
    assert exc.value.message == "That inventory scan was not found."

    _started2, session_id2 = _started_session(db, user, department_id)
    other_missing = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id2,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=UUID(other_missing["scan"]["id"]),
            action="Search the shelf again",
            decision=None,
        )
    assert exc.value.code == "not_found"

    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=UUID(duplicate["scan"]["id"]),
            action="Search the shelf again",
            decision=None,
        )
    assert exc.value.code == "not_found"

    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=scan_id,
            action="Leave it on the shelf",
            decision=None,
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "validation_error"
    assert exc.value.message == "That inventory session is not valid."
    assert exc.value.fields == [{"name": "action", "message": "This value is not valid."}]

    chosen = save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision=None,
    )
    assert chosen["decision"] is None
    assert chosen["decided_by"] is None
    assert chosen["decided_at"] is None

    approved = save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision="approved",
    )
    assert approved["decided_by"] == "Inv Librarian"
    assert approved["decided_at"] is not None

    cleared = save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Leave the Koha status unchanged",
        decision=None,
    )
    assert cleared["decision"] is None
    row = db.query(InventoryReviewDecision).filter_by(scan_id=scan_id).one()
    assert row.decided_by is None
    assert row.decided_at is None

    decide_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.review.decide", entity_id=str(scan_id))
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert decide_audit.details["decision"] is None
    assert decide_audit.details["barcode"] == "GONE"

    resume_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=scan_id,
            action="Search the shelf again",
            decision="no_action",
        )
    assert exc.value.code == "session_not_in_review"
    assert exc.value.message == "Finish the session before reviewing exceptions."
    assert db.query(InventoryReviewDecision).filter_by(scan_id=scan_id).one().action == (
        "Leave the Koha status unchanged"
    )


def test_cancel_from_review_keeps_the_decision(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    missing = record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    scan_id = UUID(missing["scan"]["id"])
    save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision="no_action",
    )
    cancelled = cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert cancelled["status"] == "cancelled"
    assert db.query(InventoryScan).filter_by(session_id=session_id).count() == 1
    assert db.query(InventoryReviewDecision).filter_by(scan_id=scan_id).one().decision == "no_action"


def test_export_exceptions_csv(db):
    user, department_id = _user_and_department(db)
    started, session_id = _started_session(db, user, department_id)
    missing = record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=UUID(missing["scan"]["id"]),
        action="Search the shelf again",
        decision="approved",
    )

    filename, body = export_exceptions(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert filename == f"{started['reference']}-exceptions.csv"
    rows = list(csv.DictReader(io.StringIO(body)))
    assert list(rows[0]) == [
        "barcode",
        "title",
        "call_number",
        "outcome",
        "message",
        "action",
        "decision",
        "decided_by",
        "decided_at",
    ]
    assert rows[0]["barcode"] == "GONE"
    assert rows[0]["decision"] == "approved"
    assert rows[0]["decided_by"] == "Inv Librarian"
    assert db.get(InventorySession, session_id).status == "in_review"
    assert (
        db.query(AuditLog)
        .filter_by(action="inventory.review.export", entity_id=str(session_id))
        .count()
        == 1
    )

    cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    export_exceptions(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert (
        db.query(AuditLog)
        .filter_by(action="inventory.review.export", entity_id=str(session_id))
        .count()
        == 2
    )

    _, in_progress_id = _started_session(db, user, department_id)
    with pytest.raises(InventoryError) as exc:
        export_exceptions(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=in_progress_id,
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "export_not_ready"
    assert exc.value.message == "Export is available after scanning is finished."

    _, verified_only_id = _started_session(db, user, department_id)
    record_scan(
        db,
        _FakeKoha(items_by_barcode={"ITEM-101": [_AVAILABLE_ITEM]}),
        user_id=user.id,
        department_id=department_id,
        session_id=verified_only_id,
        client_scan_id=uuid4(),
        barcode="ITEM-101",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=verified_only_id,
    )
    _, verified_body = export_exceptions(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=verified_only_id,
    )
    assert verified_body.strip() == (
        "barcode,title,call_number,outcome,message,action,decision,decided_by,decided_at"
    )

    draft = _create_draft(db, user, department_id, "Not ready")
    with pytest.raises(InventoryError) as exc:
        export_exceptions(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=UUID(draft["id"]),
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "export_not_ready"
    assert exc.value.message == "Export is available after scanning is finished."


def test_list_session_audit(db):
    user, department_id = _user_and_department(db)
    started, session_id = _started_session(db, user, department_id)
    record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )

    listed = list_session_audit(
        db,
        department_id=department_id,
        session_id=session_id,
    )
    assert listed["items"][0]["action"] == "inventory.session.finish"
    assert listed["items"][0]["actor_name"] == "Inv Librarian"
    assert listed["items"][0]["created_at"]
    scan_rows = [item for item in listed["items"] if item["action"] == "inventory.scan"]
    assert scan_rows[0]["details"]["barcode"] == "GONE"
    assert scan_rows[0]["details"]["reference"] == started["reference"]
    assert "entity_id" not in scan_rows[0]

    hidden = _create_draft(db, user, _other_department_id(db), "Other department")
    with pytest.raises(InventoryError) as exc:
        list_session_audit(
            db,
            department_id=department_id,
            session_id=UUID(hidden["id"]),
        )
    assert exc.value.status_code == 404
    assert exc.value.message == "That inventory session was not found."