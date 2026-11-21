from app.api.routes.auth import router as auth_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.patrons import router as patrons_router

__all__ = [
    "auth_router",
    "catalog_router",
    "health_router",
    "inventory_router",
    "patrons_router",
]