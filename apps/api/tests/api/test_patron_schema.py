from sqlalchemy import text

from app.models.identity import Permission


CODES = ("patrons.sensitive.view", "patrons.create", "patrons.update")
ADMINS = ("Super Administrator", "Library Administrator")
OTHERS = ("Department Head", "Librarian", "Student", "Auditor")


def test_patron_write_permissions_belong_to_admins(db):
    rows = db.query(Permission).filter(Permission.code.in_(CODES)).all()
    assert {row.code for row in rows} == set(CODES)
    assert {row.module for row in rows} == {"patrons"}
    granted = db.execute(text("""
        SELECT r.name, p.code
        FROM libraryhub.roles r
        JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
        JOIN libraryhub.permissions p ON p.id = rp.permission_id
        WHERE p.code IN ('patrons.sensitive.view', 'patrons.create', 'patrons.update')
    """)).all()
    by_role: dict[str, set[str]] = {}
    for name, code in granted:
        by_role.setdefault(name, set()).add(code)
    for name in ADMINS:
        assert by_role[name] == set(CODES)
    for name in OTHERS:
        assert name not in by_role