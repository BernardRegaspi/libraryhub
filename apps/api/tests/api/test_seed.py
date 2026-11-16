import pytest

from app.models.identity import AppUser, AuthIdentity, Role, UserCredential, UserRoleAssignment
from app.scripts.seed import seed_bootstrap
from app.services.passwords import verify_password


def test_seed_requires_the_bootstrap_password(monkeypatch):
    monkeypatch.delenv("LIBRARYHUB_BOOTSTRAP_PASSWORD", raising=False)
    with pytest.raises(SystemExit) as raised:
        seed_bootstrap(None)
    assert raised.value.code == 1


def test_seed_creates_maria_once(db, monkeypatch):
    monkeypatch.setenv("LIBRARYHUB_BOOTSTRAP_PASSWORD", "bootstrap-secret")
    existing = db.query(AppUser).filter_by(username="m.reyes").one_or_none()
    if existing is not None:
        db.delete(existing)
        db.commit()
    seed_bootstrap(db)
    seed_bootstrap(db)
    users = db.query(AppUser).filter_by(username="m.reyes").all()
    assert len(users) == 1
    user = users[0]
    assert user.email == "m.reyes@usant.edu.ph"
    assert user.display_name == "Maria Reyes"
    assert user.status == "active"
    identity = db.query(AuthIdentity).filter_by(user_id=user.id).one()
    assert identity.provider == "local"
    assert identity.koha_borrowernumber is None
    assignment = db.query(UserRoleAssignment).filter_by(user_id=user.id).one()
    assert assignment.department_id is None
    assert db.query(Role).filter_by(id=assignment.role_id).one().name == "Super Administrator"
    assert verify_password(
        "bootstrap-secret",
        db.query(UserCredential).filter_by(user_id=user.id).one().password_hash,
    )