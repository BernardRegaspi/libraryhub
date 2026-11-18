from sqlalchemy import text

from app.models.catalog import SavedSearch
from app.models.identity import Permission


def test_catalog_permission_grants(db):
    barcode = db.query(Permission).filter_by(code="catalog.barcode.view").one()
    assert barcode.module == "catalog"
    rows = db.execute(text("""
        SELECT r.name, p.code
        FROM libraryhub.roles r
        JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
        JOIN libraryhub.permissions p ON p.id = rp.permission_id
        WHERE p.code IN ('catalog.view', 'catalog.barcode.view')
    """)).all()
    by_role: dict[str, set[str]] = {}
    for name, code in rows:
        by_role.setdefault(name, set()).add(code)
    assert "catalog.view" in by_role["Student"]
    assert "catalog.barcode.view" not in by_role["Student"]
    for name in ("Super Administrator", "Library Administrator", "Department Head", "Librarian"):
        assert "catalog.barcode.view" in by_role[name]
    assert "Auditor" not in by_role or "catalog.barcode.view" not in by_role["Auditor"]
    assert SavedSearch.__tablename__ == "saved_searches"