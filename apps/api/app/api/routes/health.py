from fastapi import APIRouter

from app.database.session import check_database_connectivity

router = APIRouter(tags=["health"])


@router.get("/health")
def health_liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
def health_readiness() -> dict[str, str]:
    if not check_database_connectivity():
        return {"status": "degraded", "database": "unavailable"}
    return {"status": "ok", "database": "connected"}