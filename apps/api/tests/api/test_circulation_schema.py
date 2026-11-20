import uuid

from sqlalchemy import inspect, text

from app.models.circulation import CirculationRequest
from app.models.identity import Permission

WRITE_CODES = ("circulation.checkout", "circulation.checkin", "circulation.renew")
WRITE_ROLES = (
    "Librarian",
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
OTHER_ROLES = ("Student", "Auditor")


def test_circulation_write_permissions_and_table(db):
    rows = db.query(Permission).filter(Permission.code.in_(WRITE_CODES)).all()
    assert {row.code for row in rows} == set(WRITE_CODES)
    assert {row.module for row in rows} == {"circulation"}
    granted = db.execute(
        text("""
            SELECT r.name, p.code
            FROM libraryhub.roles r
            JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
            JOIN libraryhub.permissions p ON p.id = rp.permission_id
            WHERE p.code IN (
                'circulation.checkout',
                'circulation.checkin',
                'circulation.renew'
            )
        """),
    ).all()
    by_role: dict[str, set[str]] = {}
    for name, code in granted:
        by_role.setdefault(name, set()).add(code)
    for name in WRITE_ROLES:
        assert by_role[name] == set(WRITE_CODES)
    for name in OTHER_ROLES:
        assert name not in by_role

    inspector = inspect(db.get_bind())
    columns = {col["name"] for col in inspector.get_columns("circulation_requests", schema="libraryhub")}
    assert columns == {
        "id",
        "user_id",
        "action",
        "status",
        "patron_id",
        "created_at",
        "updated_at",
        "result",
    }

    row = CirculationRequest(
        id=uuid.uuid4(),
        user_id=None,
        action="checkout",
        status="in_progress",
        patron_id=42,
        result={"items": []},
    )
    db.add(row)
    db.flush()
    assert db.get(CirculationRequest, row.id) is not None