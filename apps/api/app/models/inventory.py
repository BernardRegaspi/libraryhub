import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

_SCHEMA = "libraryhub"


class InventorySession(Base):
    __tablename__ = "inventory_sessions"
    __table_args__ = (
        CheckConstraint(
            "status in ('draft', 'in_progress', 'cancelled')",
            name="ck_inventory_sessions_status",
        ),
        CheckConstraint(
            "expected_count >= 0",
            name="ck_inventory_sessions_expected_count",
        ),
        CheckConstraint(
            "char_length(name) between 1 and 120",
            name="ck_inventory_sessions_name",
        ),
        CheckConstraint(
            "location is null or char_length(location) between 1 and 80",
            name="ck_inventory_sessions_location",
        ),
        Index("ix_inventory_sessions_department_created", "department_id", "created_at"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    reference: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.library_departments.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    home_library_id: Mapped[str] = mapped_column(String(64), nullable=False)
    home_library_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expected_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id"),
        nullable=False,
    )
    started_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id"),
        nullable=True,
    )
    cancelled_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id"),
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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


class InventoryScan(Base):
    __tablename__ = "inventory_scans"
    __table_args__ = (
        CheckConstraint(
            "outcome in ('verified', 'misplaced', 'unexpected', 'not_found', "
            "'duplicate', 'withdrawn', 'damaged', 'other_exception')",
            name="ck_inventory_scans_outcome",
        ),
        CheckConstraint(
            "(is_primary = true and primary_scan_id is null) "
            "or (is_primary = false and primary_scan_id is not null)",
            name="ck_inventory_scans_primary",
        ),
        Index(
            "uq_inventory_scans_session_client_scan_id",
            "session_id",
            "client_scan_id",
            unique=True,
        ),
        Index(
            "uq_inventory_scans_session_koha_item_primary",
            "session_id",
            "koha_item_id",
            unique=True,
            postgresql_where=text("is_primary AND koha_item_id IS NOT NULL"),
        ),
        Index(
            "uq_inventory_scans_session_barcode_primary",
            "session_id",
            "barcode",
            unique=True,
            postgresql_where=text("is_primary AND koha_item_id IS NULL"),
        ),
        Index("ix_inventory_scans_session_barcode", "session_id", "barcode"),
        Index("ix_inventory_scans_session_scanned_at", "session_id", "scanned_at"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    client_scan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    barcode: Mapped[str] = mapped_column(String(32), nullable=False)
    koha_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    koha_biblio_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False)
    primary_scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_scans.id"),
        nullable=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    call_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    item_type_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    item_type_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    home_library_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    home_library_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    holding_library_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    holding_library_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(80), nullable=True)
    koha_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    koha_status_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scanned_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id"),
        nullable=False,
    )
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )