import os

from sqlalchemy.orm import Session

from app.database.session import get_session_factory
from app.models.identity import (
    AppUser,
    AuthIdentity,
    Role,
    UserCredential,
    UserRoleAssignment,
)
from app.services.passwords import hash_password

_BOOTSTRAP_USERNAME = "m.reyes"


def seed_bootstrap(db: Session | None) -> None:
    password = os.environ.get("LIBRARYHUB_BOOTSTRAP_PASSWORD", "")
    if not password.strip():
        raise SystemExit(1)

    if db is None:
        return

    if db.query(AppUser).filter_by(username=_BOOTSTRAP_USERNAME).one_or_none() is not None:
        return

    user = AppUser(
        username=_BOOTSTRAP_USERNAME,
        email="m.reyes@usant.edu.ph",
        display_name="Maria Reyes",
        status="active",
    )
    db.add(user)
    db.flush()

    db.add(UserCredential(user_id=user.id, password_hash=hash_password(password)))
    db.add(
        AuthIdentity(
            user_id=user.id,
            provider="local",
            provider_subject=str(user.id),
            koha_borrowernumber=None,
        )
    )
    role = db.query(Role).filter_by(name="Super Administrator").one()
    db.add(
        UserRoleAssignment(
            user_id=user.id,
            role_id=role.id,
            department_id=None,
            assigned_by=None,
        )
    )


def main() -> None:
    session = get_session_factory()()
    try:
        seed_bootstrap(session)
        session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    main()