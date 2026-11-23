from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime
from typing import Any

from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import AppUser, LibraryDepartment
from app.models.inventory import (
    InventoryAdjustment,
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
    InventoryShelfSearch,
)
from app.services.inventory_rules import expected_condition

_EXCEPTION_CONDITIONS = frozenset({"not_found", "misplaced", "unexpected", "damaged", "withdrawn"})

ITEM_COLUMNS = (
    "session_name",
    "department",
    "home_library",
    "barcode",
    "koha_item_id",
    "title",
    "author",
    "call_number",
    "item_type",
    "snapshot_location",
    "live_or_station_location",
    "condition",
    "koha_status",
    "scanned_at",
    "operator_name",
    "remark",
)

WORK_ORDER_COLUMNS = (
    "proposal_id",
    "field",
    "from_value",
    "to_value",
    "reason",
    "status",
) + ITEM_COLUMNS


def export_rows(
    db: Session,
    *,
    session_id: uuid.UUID,
    kind: str,
    item_query: dict[str, Any],
    include_barcode: bool,
) -> list[dict[str, Any]]:
    session = db.get(InventorySession, session_id)
    if session is None:
        return []

    if kind == "work_order":
        return _work_order_rows(db, session, include_barcode)
    if kind == "findings":
        return _findings_rows(db, session, include_barcode)
    if kind == "unverified":
        query = dict(item_query)
        query["condition"] = "unverified"
        return _filtered_item_rows(db, session, query, include_barcode)
    if kind == "filter":
        return _filtered_item_rows(db, session, item_query, include_barcode)
    return []


def render_export(rows: list[dict[str, Any]], format: str) -> tuple[bytes, str]:
    columns = _columns_for_rows(rows)
    if format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({col: _cell(row.get(col)) for col in columns})
        return buf.getvalue().encode("utf-8"), "text/csv"
    if format == "xlsx":
        wb = Workbook()
        sheet = wb.active
        if sheet is None:
            sheet = wb.create_sheet("Inventory")
        else:
            sheet.title = "Inventory"
        sheet.append(list(columns))
        for row in rows:
            sheet.append([_cell(row.get(col)) for col in columns])
        out = io.BytesIO()
        wb.save(out)
        return (
            out.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    raise ValueError(f"Unsupported export format: {format}")


def _columns_for_rows(rows: list[dict[str, Any]]) -> tuple[str, ...]:
    if rows and "proposal_id" in rows[0]:
        return WORK_ORDER_COLUMNS
    return ITEM_COLUMNS


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _work_order_rows(
    db: Session,
    session: InventorySession,
    include_barcode: bool,
) -> list[dict[str, Any]]:
    adjustments = db.scalars(
        select(InventoryAdjustment).where(
            InventoryAdjustment.session_id == session.id,
            InventoryAdjustment.status.in_(("approved", "failed")),
        ),
    ).all()
    context = _SessionContext.load(db, session)
    rows: list[dict[str, Any]] = []
    for adj in adjustments:
        item_row = _item_row_for_adjustment(db, session, context, adj, include_barcode)
        rows.append(
            {
                "proposal_id": str(adj.id),
                "field": adj.field,
                "from_value": adj.from_value or "",
                "to_value": adj.to_value,
                "reason": adj.reason,
                "status": adj.status,
                **item_row,
            },
        )
    return rows


def _findings_rows(
    db: Session,
    session: InventorySession,
    include_barcode: bool,
) -> list[dict[str, Any]]:
    query = {"condition": "all"}
    all_rows = _filtered_item_rows(db, session, query, include_barcode)
    return [row for row in all_rows if row.get("condition") in _EXCEPTION_CONDITIONS]


def _filtered_item_rows(
    db: Session,
    session: InventorySession,
    item_query: dict[str, Any],
    include_barcode: bool,
) -> list[dict[str, Any]]:
    condition = str(item_query.get("condition") or "all")
    q = str(item_query.get("q") or "").strip()
    location = str(item_query.get("location") or "").strip()
    sort = str(item_query.get("sort") or "scanned_at")
    direction = str(item_query.get("direction") or "desc")

    context = _SessionContext.load(db, session)
    rows = _all_item_rows(db, session, context, include_barcode)
    if location:
        rows = [row for row in rows if row.get("snapshot_location") == location]
    if condition != "all":
        rows = [row for row in rows if _matches_condition(row, condition)]
    if q:
        needle = q.casefold()
        rows = [
            row
            for row in rows
            if any(
                needle in str(row.get(key) or "").casefold()
                for key in ("title", "author", "call_number", "barcode")
            )
        ]
    reverse = direction == "desc"
    if sort in ITEM_COLUMNS:
        rows.sort(key=lambda row: _sort_key(row.get(sort)), reverse=reverse)
    return rows


def _matches_condition(row: dict[str, Any], condition: str) -> bool:
    row_condition = str(row.get("condition") or "")
    if condition == "damaged":
        return row_condition == "damaged" or (
            row.get("observed_damaged") is True and row_condition in ("unexpected", "withdrawn")
        )
    return row_condition == condition


def _sort_key(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


class _SessionContext:
    def __init__(
        self,
        *,
        department_name: str,
        scan_by_expected: dict[uuid.UUID, InventoryScan],
        scan_by_koha: dict[int, InventoryScan],
        active_searches: dict[uuid.UUID, InventoryShelfSearch],
        operators: dict[uuid.UUID, str],
    ) -> None:
        self.department_name = department_name
        self.scan_by_expected = scan_by_expected
        self.scan_by_koha = scan_by_koha
        self.active_searches = active_searches
        self.operators = operators

    @classmethod
    def load(cls, db: Session, session: InventorySession) -> _SessionContext:
        dept = db.get(LibraryDepartment, session.department_id)
        department_name = dept.name if dept is not None else ""
        scans = db.scalars(
            select(InventoryScan).where(
                InventoryScan.session_id == session.id,
                InventoryScan.counts.is_(True),
            ),
        ).all()
        scan_by_expected: dict[uuid.UUID, InventoryScan] = {}
        scan_by_koha: dict[int, InventoryScan] = {}
        operator_ids: set[uuid.UUID] = set()
        for scan in scans:
            if scan.expected_item_id is not None:
                scan_by_expected[scan.expected_item_id] = scan
            if scan.koha_item_id is not None:
                scan_by_koha[scan.koha_item_id] = scan
            if scan.operator_id is not None:
                operator_ids.add(scan.operator_id)
        searches = db.scalars(
            select(InventoryShelfSearch).where(
                InventoryShelfSearch.session_id == session.id,
                InventoryShelfSearch.reversed_at.is_(None),
            ),
        ).all()
        active_searches = {row.expected_item_id: row for row in searches}
        operators: dict[uuid.UUID, str] = {}
        if operator_ids:
            users = db.scalars(select(AppUser).where(AppUser.id.in_(operator_ids))).all()
            operators = {user.id: user.display_name for user in users}
        return cls(
            department_name=department_name,
            scan_by_expected=scan_by_expected,
            scan_by_koha=scan_by_koha,
            active_searches=active_searches,
            operators=operators,
        )


def _all_item_rows(
    db: Session,
    session: InventorySession,
    context: _SessionContext,
    include_barcode: bool,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    expected_items = db.scalars(
        select(InventoryExpectedItem).where(InventoryExpectedItem.session_id == session.id),
    ).all()
    for item in expected_items:
        rows.append(_expected_item_row(session, context, item, include_barcode))

    extra_scans = db.scalars(
        select(InventoryScan).where(
            InventoryScan.session_id == session.id,
            InventoryScan.counts.is_(True),
            InventoryScan.expected_item_id.is_(None),
        ),
    ).all()
    for scan in extra_scans:
        rows.append(_scan_item_row(session, context, scan, include_barcode))
    return rows


def _expected_item_row(
    session: InventorySession,
    context: _SessionContext,
    item: InventoryExpectedItem,
    include_barcode: bool,
) -> dict[str, Any]:
    scan = context.scan_by_expected.get(item.id) or context.scan_by_koha.get(item.koha_item_id)
    search = context.active_searches.get(item.id)
    outcome = scan.outcome if scan is not None else None
    condition = expected_condition(
        scan_outcome=outcome,
        active_shelf_search=search is not None,
    )
    remark = search.remark if search is not None else ""
    operator_name = ""
    scanned_at: datetime | str | None = None
    live_or_station = ""
    koha_status = item.koha_status
    if scan is not None:
        if scan.operator_id is not None:
            operator_name = context.operators.get(scan.operator_id, "")
        scanned_at = scan.created_at
        live_or_station = scan.station_location or scan.live_location or ""
        if scan.live_status:
            koha_status = scan.live_status
    return {
        "session_name": session.name,
        "department": context.department_name,
        "home_library": session.home_library_id,
        "barcode": item.barcode if include_barcode else "",
        "koha_item_id": item.koha_item_id,
        "title": item.title or "",
        "author": item.author or "",
        "call_number": item.call_number or "",
        "item_type": item.item_type_label or "",
        "snapshot_location": item.location or "",
        "live_or_station_location": live_or_station,
        "condition": condition,
        "koha_status": koha_status,
        "scanned_at": scanned_at or "",
        "operator_name": operator_name,
        "remark": remark,
        "observed_damaged": scan.observed_damaged if scan is not None else False,
    }


def _scan_item_row(
    session: InventorySession,
    context: _SessionContext,
    scan: InventoryScan,
    include_barcode: bool,
) -> dict[str, Any]:
    operator_name = ""
    if scan.operator_id is not None:
        operator_name = context.operators.get(scan.operator_id, "")
    live_or_station = scan.station_location or scan.live_location or ""
    return {
        "session_name": session.name,
        "department": context.department_name,
        "home_library": session.home_library_id,
        "barcode": scan.barcode_submitted if include_barcode else "",
        "koha_item_id": scan.koha_item_id or "",
        "title": scan.title or "",
        "author": scan.author or "",
        "call_number": scan.call_number or "",
        "item_type": scan.item_type_label or "",
        "snapshot_location": "",
        "live_or_station_location": live_or_station,
        "condition": scan.outcome,
        "koha_status": scan.live_status or "",
        "scanned_at": scan.created_at,
        "operator_name": operator_name,
        "remark": "",
        "observed_damaged": scan.observed_damaged,
    }


def _item_row_for_adjustment(
    db: Session,
    session: InventorySession,
    context: _SessionContext,
    adj: InventoryAdjustment,
    include_barcode: bool,
) -> dict[str, Any]:
    if adj.expected_item_id is not None:
        item = db.get(InventoryExpectedItem, adj.expected_item_id)
        if item is not None:
            row = _expected_item_row(session, context, item, include_barcode)
            row.pop("observed_damaged", None)
            return row
    if adj.scan_id is not None:
        scan = db.get(InventoryScan, adj.scan_id)
        if scan is not None:
            row = _scan_item_row(session, context, scan, include_barcode)
            row.pop("observed_damaged", None)
            return row
    item = db.scalar(
        select(InventoryExpectedItem).where(
            InventoryExpectedItem.session_id == session.id,
            InventoryExpectedItem.koha_item_id == adj.koha_item_id,
        ),
    )
    if item is not None:
        row = _expected_item_row(session, context, item, include_barcode)
        row.pop("observed_damaged", None)
        return row
    base = {col: "" for col in ITEM_COLUMNS if col not in ("session_name", "department", "home_library")}
    base.update(
        {
            "session_name": session.name,
            "department": context.department_name,
            "home_library": session.home_library_id,
            "koha_item_id": adj.koha_item_id,
        },
    )
    if not include_barcode:
        base["barcode"] = ""
    return base