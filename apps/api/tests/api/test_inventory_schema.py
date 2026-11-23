from sqlalchemy import inspect, text

from app.models.identity import Permission

MANAGE_ROLES = (
    "Librarian",
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
APPROVE_ROLES = (
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
EXCLUDED = ("Student", "Auditor", "Librarian")


def test_inventory_permissions(db):
    codes = {"inventory.manage", "inventory.adjustments.approve"}
    rows = db.query(Permission).filter(Permission.code.in_(codes)).all()
    assert {row.code for row in rows} == codes
    assert {row.module for row in rows} == {"inventory"}
    granted = db.execute(
        text("""
            SELECT r.name, p.code
            FROM libraryhub.roles r
            JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
            JOIN libraryhub.permissions p ON p.id = rp.permission_id
            WHERE p.code IN ('inventory.manage', 'inventory.adjustments.approve')
        """),
    ).all()
    by_role: dict[str, set[str]] = {}
    for name, code in granted:
        by_role.setdefault(name, set()).add(code)
    for name in MANAGE_ROLES:
        assert "inventory.manage" in by_role[name]
    for name in APPROVE_ROLES:
        assert "inventory.adjustments.approve" in by_role[name]
    assert "inventory.adjustments.approve" not in by_role.get("Librarian", set())
    for name in ("Student", "Auditor"):
        assert name not in by_role


def test_inventory_tables_exist(db):
    inspector = inspect(db.get_bind())
    names = set(inspector.get_table_names(schema="libraryhub"))
    assert {
        "inventory_sessions",
        "inventory_session_locations",
        "inventory_session_operators",
        "inventory_expected_items",
        "inventory_scans",
        "inventory_shelf_searches",
        "inventory_adjustments",
    } <= names
    scan_indexes = {idx["name"] for idx in inspector.get_indexes("inventory_scans", schema="libraryhub")}
    assert "uq_inventory_scans_counting_item" in scan_indexes