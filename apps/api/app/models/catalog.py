import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

_SCHEMA = "libraryhub"


class SavedSearch(Base):
    __tablename__ = "saved_searches"
    __table_args__ = (
        CheckConstraint(
            "kind in ('recent', 'saved')",
            name="ck_saved_searches_kind",
        ),
        CheckConstraint(
            "sort_direction in ('asc', 'desc')",
            name="ck_saved_searches_sort_direction",
        ),
        CheckConstraint(
            "(kind = 'saved' and label is not null and char_length(label) between 1 and 80) "
            "or (kind = 'recent' and label is null)",
            name="ck_saved_searches_label",
        ),
        Index("ix_saved_searches_user_kind_updated", "user_id", "kind", "updated_at"),
        Index(
            "uq_saved_searches_identity",
            "user_id",
            "kind",
            "query_text",
            "search_field",
            "filters",
            "sort_field",
            "sort_direction",
            unique=True,
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    query_text: Mapped[str] = mapped_column(String(200), nullable=False)
    search_field: Mapped[str] = mapped_column(String(64), nullable=False)
    filters: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    sort_field: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_direction: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )