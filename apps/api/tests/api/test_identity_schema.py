from app.models.identity import LibraryDepartment, Role


def test_reference_departments_and_roles(db):
    codes = {row.code for row in db.query(LibraryDepartment).all()}
    assert codes == {"COLLEGE", "JHS", "SHS", "GRADE", "GRADUATE"}
    assert all(row.koha_branchcode is None and row.is_active for row in db.query(LibraryDepartment))
    names = {row.name for row in db.query(Role).all()}
    assert names == {
        "Super Administrator",
        "Library Administrator",
        "Department Head",
        "Librarian",
        "Student",
        "Auditor",
    }