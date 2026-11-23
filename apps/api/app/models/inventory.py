import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
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
            "status in ('draft', 'in_progress', 'completed', 'cancelled')",
            name="ck_inventory_sessions_status",
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.library_departments.id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    home_library_id: Mapped[str] = mapped_column(String(64), nullable=False)
    item_type_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_on: Mapped[date] = mapped_column(Date, nullable=False)
    target_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snapshot_taken_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    expected_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
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


class InventorySessionLocation(Base):
    __tablename__ = "inventory_session_locations"
    __table_args__ = ({"schema": _SCHEMA},)

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    location: Mapped[str] = mapped_column(String(255), primary_key=True)


class InventorySessionOperator(Base):
    __tablename__ = "inventory_session_operators"
    __table_args__ = ({"schema": _SCHEMA},)

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="CASCADE"),
        primary_key=True,
    )


class InventoryExpectedItem(Base):
    __tablename__ = "inventory_expected_items"
    __table_args__ = (
        CheckConstraint(
            "koha_status in ('available', 'damaged', 'not_for_loan')",
            name="ck_inventory_expected_items_koha_status",
        ),
        UniqueConstraint(
            "session_id",
            "koha_item_id",
            name="uq_inventory_expected_items_session_koha_item",
        ),
        UniqueConstraint(
            "session_id",
            "barcode",
            name="uq_inventory_expected_items_session_barcode",
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    koha_item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    barcode: Mapped[str] = mapped_column(String(64), nullable=False)
    biblio_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    author: Mapped[str | None] = mapped_column(Text, nullable=True)
    call_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_type_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    item_type_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    home_library_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    holding_library_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    koha_status: Mapped[str] = mapped_column(String(32), nullable=False)


class InventoryScan(Base):
    __tablename__ = "inventory_scans"
    __table_args__ = (
        CheckConstraint(
            "outcome in ("
            "'found', 'misplaced', 'unexpected', 'damaged', 'withdrawn', "
            "'invalid', 'duplicate', 'koha_error'"
            ")",
            name="ck_inventory_scans_outcome",
        ),
        CheckConstraint(
            "match_basis is null or match_basis in ('found', 'misplaced')",
            name="ck_inventory_scans_match_basis",
        ),
        Index(
            "uq_inventory_scans_counting_item",
            "session_id",
            "koha_item_id",
            unique=True,
            postgresql_where=text("counts AND koha_item_id IS NOT NULL"),
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    expected_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_expected_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    koha_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    barcode_submitted: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    match_basis: Mapped[str | None] = mapped_column(String(32), nullable=True)
    observed_damaged: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    counts: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    original_scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_scans.id", ondelete="SET NULL"),
        nullable=True,
    )
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    station_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    live_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    live_home_library_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    live_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    author: Mapped[str | None] = mapped_column(Text, nullable=True)
    call_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_type_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class InventoryShelfSearch(Base):
    __tablename__ = "inventory_shelf_searches"
    __table_args__ = (
        Index(
            "uq_inventory_shelf_active",
            "expected_item_id",
            unique=True,
            postgresql_where=text("reversed_at IS NULL"),
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    expected_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_expected_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    remark: Mapped[str] = mapped_column(Text, nullable=False)
    marked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reverse_remark: Mapped[str | None] = mapped_column(Text, nullable=True)


class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"
    __table_args__ = (
        CheckConstraint(
            "status in ('draft', 'approved', 'rejected', 'submitted', 'failed')",
            name="ck_inventory_adjustments_status",
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    koha_item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_expected_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.inventory_scans.id", ondelete="SET NULL"),
        nullable=True,
    )
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    from_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_value: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    drafted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    koha_http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    koha_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
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