import os
import sys
from pathlib import Path

from dotenv import load_dotenv
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

_REPO_ROOT = Path(__file__).resolve().parents[4]


def _bootstrap_profile() -> tuple[str, str, str]:
    username = (os.environ.get("LIBRARYHUB_BOOTSTRAP_USERNAME") or "m.reyes").strip()
    email = (
        os.environ.get("LIBRARYHUB_BOOTSTRAP_EMAIL") or f"{username}@usant.edu.ph"
    ).strip()
    display_name = (os.environ.get("LIBRARYHUB_BOOTSTRAP_DISPLAY_NAME") or username).strip()
    return username, email, display_name


def seed_bootstrap(db: Session | None) -> None:
    password = os.environ.get("LIBRARYHUB_BOOTSTRAP_PASSWORD", "")
    if not password.strip():
        print(
            "LIBRARYHUB_BOOTSTRAP_PASSWORD is missing or blank. "
            "Set it in the repository root .env or pass -e when running docker compose exec.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    if db is None:
        return

    username, email, display_name = _bootstrap_profile()

    if db.query(AppUser).filter_by(username=username).one_or_none() is not None:
        return

    user = AppUser(
        username=username,
        email=email,
        display_name=display_name,
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
    load_dotenv(_REPO_ROOT / ".env")
    load_dotenv(_REPO_ROOT / "apps" / "api" / ".env")
    session = get_session_factory()()
    try:
        seed_bootstrap(session)
        session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    main()