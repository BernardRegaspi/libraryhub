from app.models.identity import LibraryDepartment, Role


def test_reference_departments_and_roles(db):
    codes = {row.code for row in db.query(LibraryDepartment).all()}
    assert codes == {"COLLEGE", "JHS", "SHS", "GRADE", "GRADUATE"}
    branches = {row.code: row.koha_branchcode for row in db.query(LibraryDepartment).all()}
    assert branches == {
        "COLLEGE": "UCL",
        "GRADE": "GradeL",
        "GRADUATE": "GL",
        "JHS": "JL",
        "SHS": "SL",
    }
    assert all(row.is_active for row in db.query(LibraryDepartment))
    names = {row.name for row in db.query(Role).all()}
    assert names == {
        "Super Administrator",
        "Library Administrator",
        "Department Head",
        "Librarian",
        "Student",
        "Auditor",
    }