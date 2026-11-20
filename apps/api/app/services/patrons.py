from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.integrations.koha.exceptions import (
    KohaError,
    KohaNotFound,
    KohaRequestError,
    KohaTimeoutError,
)
from app.integrations.koha.patron_query import build_patron_query, patron_order_by
from app.models.identity import AuditLog
from app.schemas.patrons import PatronSearchParams, PatronWrite

_DIRECTORY_FIELDS = (
    "patron_id",
    "firstname",
    "surname",
    "preferred_name",
    "cardnumber",
    "category_id",
    "library_id",
    "expiry_date",
    "expired",
    "restricted",
    "patron_card_lost",
)

_COUNT_FIELDS = ("checkouts_count", "overdues_count")


class PatronError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: list[dict] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        super().__init__(message)


_SORTS = frozenset({"surname", "firstname", "cardnumber", "category_id", "expiry_date"})
_STATUSES = frozenset({"active", "expired", "restricted"})
_INVALID = PatronError(422, "invalid_search", "That search is not valid.")
_UNAVAILABLE = PatronError(
    503,
    "patrons_unavailable",
    "Patron records are unavailable. Try again.",
)
_TIMEOUT = PatronError(
    504,
    "patrons_timeout",
    "Patron records took too long to respond. Try again.",
)
_NOT_FOUND = PatronError(404, "not_found", "That patron was not found.")
_PERMISSION_DENIED = PatronError(
    403,
    "permission_denied",
    "You do not have access to patron records.",
)

_WRITE_ALLOWLIST = (
    "surname",
    "firstname",
    "preferred_name",
    "cardnumber",
    "userid",
    "email",
    "phone",
    "mobile",
    "library_id",
    "category_id",
    "expiry_date",
    "date_of_birth",
    "address",
    "address2",
    "city",
    "state",
    "postal_code",
    "country",
    "staff_notes",
)
_WRITE_ALLOWLIST_SET = frozenset(_WRITE_ALLOWLIST)
_SENSITIVE_WRITE_KEYS = frozenset(
    {
        "date_of_birth",
        "address",
        "address2",
        "city",
        "state",
        "postal_code",
        "country",
        "staff_notes",
    }
)
_LEN_255 = frozenset(
    {
        "surname",
        "firstname",
        "preferred_name",
        "cardnumber",
        "userid",
        "email",
        "library_id",
        "category_id",
        "address",
        "address2",
        "city",
        "state",
        "postal_code",
        "country",
    }
)
_LEN_64 = frozenset({"phone", "mobile"})
_DATE_FIELDS = frozenset({"expiry_date", "date_of_birth"})


def _lookup_name(key: Any, mapping: dict[str, str]) -> str | None:
    if key is None or key == "":
        return None
    return mapping.get(str(key))


def directory_item(
    row: dict,
    categories: dict[str, str],
    libraries: dict[str, str],
) -> dict:
    item = {field: row.get(field) for field in _DIRECTORY_FIELDS}
    item["category_name"] = _lookup_name(row.get("category_id"), categories)
    item["library_name"] = _lookup_name(row.get("library_id"), libraries)
    for field in _COUNT_FIELDS:
        item[field] = row[field] if field in row else None
    return item


def detail_item(
    row: dict,
    categories: dict[str, str],
    libraries: dict[str, str],
    *,
    sensitive: bool,
) -> dict:
    item = directory_item(row, categories, libraries)
    item["userid"] = row.get("userid")
    item["email"] = row.get("email")
    item["phone"] = row.get("phone")
    item["mobile"] = row.get("mobile")
    item["date_enrolled"] = row.get("date_enrolled")
    if sensitive:
        for field in (
            "date_of_birth",
            "address",
            "address2",
            "city",
            "state",
            "postal_code",
            "country",
            "staff_notes",
        ):
            item[field] = row.get(field)
    return item


def is_overdue(
    due_date: str | None,
    checkin_date: str | None,
    today: date,
) -> bool:
    if not due_date or checkin_date:
        return False
    try:
        due = date.fromisoformat(due_date[:10])
    except ValueError:
        return False
    return due < today


def _checkout_title(row: dict) -> Any:
    item = row.get("item")
    if isinstance(item, dict):
        biblio = item.get("biblio")
        if isinstance(biblio, dict) and "title" in biblio:
            return biblio.get("title")
    biblio = row.get("biblio")
    if isinstance(biblio, dict) and "title" in biblio:
        return biblio.get("title")
    return None


def checkout_item(row: dict, *, include_barcode: bool, today: date) -> dict:
    item: dict[str, Any] = {
        "checkout_id": row.get("checkout_id"),
        "item_id": row.get("item_id"),
        "title": _checkout_title(row),
        "checkout_date": row.get("checkout_date"),
        "due_date": row.get("due_date"),
        "renewals_count": row.get("renewals_count"),
        "overdue": is_overdue(row.get("due_date"), row.get("checkin_date"), today),
    }
    if include_barcode and "external_id" in row:
        item["external_id"] = row["external_id"]
    return item


def _hold_title(row: dict) -> Any:
    biblio = row.get("biblio")
    if isinstance(biblio, dict) and "title" in biblio:
        return biblio.get("title")
    return None


def hold_item(row: dict, libraries: dict[str, str]) -> dict:
    pickup_library_id = row.get("pickup_library_id")
    return {
        "hold_id": row.get("hold_id"),
        "status": row.get("status"),
        "hold_date": row.get("hold_date"),
        "waiting_date": row.get("waiting_date"),
        "expiration_date": row.get("expiration_date"),
        "pickup_library_id": pickup_library_id,
        "pickup_library_name": _lookup_name(pickup_library_id, libraries),
        "biblio_id": row.get("biblio_id"),
        "title": _hold_title(row),
    }


def patron_checkouts(
    client,
    patron_id: int,
    *,
    include_barcode: bool,
    today: date,
) -> dict:
    try:
        rows = client.list_checkouts(patron_id)
    except KohaError:
        return {"status": "unavailable"}
    items = [
        checkout_item(row, include_barcode=include_barcode, today=today) for row in rows
    ]
    return {"status": "ok", "items": items}


def patron_holds(client, patron_id: int) -> dict:
    try:
        rows = client.list_holds(patron_id)
    except KohaError:
        return {"status": "unavailable"}
    try:
        libraries = client.library_names()
    except KohaError:
        libraries = {}
    items = [hold_item(row, libraries) for row in rows]
    return {"status": "ok", "items": items}


def validate_search(params: PatronSearchParams) -> None:
    for ch in params.q:
        if ord(ch) < 32 or ord(ch) == 127:
            raise _INVALID
    q = params.q.strip()
    params.q = q
    if q and len(q) > 80:
        raise _INVALID
    if not (1 <= params.page <= 10000):
        raise _INVALID
    if not (1 <= params.per_page <= 50):
        raise _INVALID
    if params.sort not in _SORTS:
        raise _INVALID
    if params.direction not in ("asc", "desc"):
        raise _INVALID
    status = params.status
    if status is not None and status != "" and status not in _STATUSES:
        raise _INVALID
    if status == "":
        params.status = None


def _parse_total(headers) -> int | None:
    for key in ("X-Total-Count", "x-total-count"):
        raw = headers.get(key)
        if raw is None:
            continue
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if digits:
            return int(digits)
    return None


def _has_next(total: int | None, page: int, per_page: int, result_count: int) -> bool:
    if total is not None:
        return page * per_page < total
    return result_count == per_page


def _category_map(client) -> dict[str, str] | None:
    try:
        rows = client.list_patron_categories()
    except KohaError:
        return None
    mapping: dict[str, str] = {}
    for row in rows:
        cat_id = row.get("patron_category_id")
        name = row.get("name")
        if cat_id is not None and name is not None:
            mapping[str(cat_id)] = str(name)
    return mapping


def _library_map(client) -> dict[str, str] | None:
    try:
        return client.library_names()
    except KohaError:
        return None


def _load_label_maps(
    client,
    params: PatronSearchParams,
) -> tuple[dict[str, str], dict[str, str]]:
    categories = _category_map(client)
    libraries = _library_map(client)
    if params.category_id is not None:
        if categories is None:
            raise _UNAVAILABLE
        if params.category_id not in categories:
            raise _INVALID
    if params.library_id is not None:
        if libraries is None:
            raise _UNAVAILABLE
        if params.library_id not in libraries:
            raise _INVALID
    return categories or {}, libraries or {}


def _manila_today() -> str:
    return datetime.now(ZoneInfo("Asia/Manila")).date().isoformat()


def _patron_total(client, query: dict | None) -> int | None:
    koha_params: dict[str, str] = {
        "_page": "1",
        "_per_page": "1",
        "_order_by": "surname",
    }
    if query is not None:
        koha_params["q"] = json.dumps(query)
    _rows, headers = client.list_patrons(koha_params)
    return _parse_total(headers)


def _category_role(name: str) -> str | None:
    folded = name.casefold()
    if "student" in folded:
        return "student"
    if "faculty" in folded or "staff" in folded or "teacher" in folded:
        return "faculty_staff"
    return None


def _sum_category_role(
    client,
    params: PatronSearchParams,
    today: str,
    roles: dict[str, str],
    role: str,
) -> int | None:
    total = 0
    matched = False
    for category_id, category_role in roles.items():
        if category_role != role:
            continue
        matched = True
        query = build_patron_query(
            params.q,
            category_id=category_id,
            library_id=params.library_id,
            status=params.status,
            today=today,
        )
        try:
            count = _patron_total(client, query)
        except KohaError:
            return None
        if count is None:
            return None
        total += count
    if not matched:
        return 0
    return total


def patron_summary(client, params: PatronSearchParams) -> dict:
    validate_search(params)
    today = _manila_today()
    query = build_patron_query(
        params.q,
        category_id=params.category_id,
        library_id=params.library_id,
        status=params.status,
        today=today,
    )
    try:
        total = _patron_total(client, query)
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    students: int | None = None
    faculty_staff: int | None = None
    try:
        categories = client.list_patron_categories()
    except KohaError:
        categories = None
    if total is not None and categories is not None:
        roles = {
            str(row["patron_category_id"]): role
            for row in categories
            if row.get("patron_category_id") is not None
            and isinstance(row.get("name"), str)
            and (role := _category_role(row["name"])) is not None
        }
        if params.category_id:
            selected = roles.get(params.category_id)
            students = total if selected == "student" else 0
            faculty_staff = total if selected == "faculty_staff" else 0
        else:
            students = _sum_category_role(client, params, today, roles, "student")
            faculty_staff = _sum_category_role(
                client, params, today, roles, "faculty_staff"
            )
    return {
        "total": total,
        "students": students,
        "faculty_staff": faculty_staff,
        "outstanding_fines": None,
    }


def patron_balance(client, patron_id: int) -> dict:
    try:
        balance = client.get_patron_balance(patron_id)
    except KohaError:
        return {"status": "unavailable"}
    if isinstance(balance, str):
        try:
            balance = float(balance)
        except ValueError:
            return {"status": "unavailable"}
    if isinstance(balance, bool) or not isinstance(balance, (int, float)):
        return {"status": "unavailable"}
    return {"status": "ok", "balance": balance}


def search_patrons(client, params: PatronSearchParams) -> dict:
    validate_search(params)
    categories, libraries = _load_label_maps(client, params)
    query = build_patron_query(
        params.q,
        category_id=params.category_id,
        library_id=params.library_id,
        status=params.status,
        today=_manila_today(),
    )
    koha_params: dict[str, str] = {
        "_page": str(params.page),
        "_per_page": str(params.per_page),
        "_order_by": patron_order_by(params.sort, params.direction),
    }
    if query is not None:
        koha_params["q"] = json.dumps(query)
    try:
        rows, headers = client.list_patrons(koha_params)
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    total = _parse_total(headers)
    items = [directory_item(row, categories, libraries) for row in rows]
    return {
        "query": params.q,
        "page": params.page,
        "per_page": params.per_page,
        "total": total,
        "sort": params.sort,
        "direction": params.direction,
        "category_id": params.category_id,
        "library_id": params.library_id,
        "status": params.status,
        "has_next": _has_next(total, params.page, params.per_page, len(rows)),
        "items": items,
    }


def patron_options(client) -> dict:
    categories: list[dict] | None
    try:
        rows = client.list_patron_categories()
        categories = [
            {
                "patron_category_id": row["patron_category_id"],
                "name": row["name"],
            }
            for row in rows
            if row.get("patron_category_id") is not None and row.get("name") is not None
        ]
    except KohaError:
        categories = None
    libraries: list[dict] | None
    try:
        names = client.library_names()
        libraries = [{"id": lib_id, "name": name} for lib_id, name in names.items()]
    except KohaError:
        libraries = None
    return {"categories": categories, "libraries": libraries}


def get_patron_detail(
    db: Session,
    client,
    patron_id: int,
    *,
    user_id,
    sensitive: bool,
) -> dict:
    try:
        row = client.get_patron(patron_id)
    except KohaNotFound as exc:
        raise _NOT_FOUND from exc
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    categories = _category_map(client) or {}
    libraries = _library_map(client) or {}
    item = detail_item(row, categories, libraries, sensitive=sensitive)
    db.add(
        AuditLog(
            user_id=user_id,
            action="patrons.detail",
            module="patrons",
            entity_type="patron",
            entity_id=str(patron_id),
            details={"sensitive": sensitive},
        )
    )
    db.commit()
    return item


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _assert_sensitive_write(payload: PatronWrite, sensitive: bool, *, update: bool) -> None:
    if sensitive:
        return
    data = payload.model_dump(
        exclude_unset=update,
        exclude={"confirm_duplicate"},
    )
    for key in _SENSITIVE_WRITE_KEYS:
        if data.get(key) is not None:
            raise _PERMISSION_DENIED


def _validation_failure(fields: list[dict]) -> None:
    raise PatronError(
        422,
        "validation_error",
        "That patron record is not valid.",
        fields=fields,
    )


def _validate_write(
    payload: PatronWrite,
    *,
    is_create: bool,
    categories: dict[str, str],
    libraries: dict[str, str],
) -> None:
    data = payload.model_dump(exclude_unset=not is_create, exclude={"confirm_duplicate"})
    fields: list[dict] = []

    if is_create:
        for name in ("surname", "library_id", "category_id"):
            if _is_blank(data.get(name)):
                fields.append({"name": name, "message": "This field is required."})
    elif "surname" in data and _is_blank(data["surname"]):
        fields.append({"name": "surname", "message": "This field is required."})

    for name, value in data.items():
        if value is None or value == "":
            continue
        if name in _LEN_255 and len(value) > 255:
            fields.append({"name": name, "message": "This value is too long."})
        elif name in _LEN_64 and len(value) > 64:
            fields.append({"name": name, "message": "This value is too long."})
        elif name == "staff_notes" and len(value) > 1024:
            fields.append({"name": name, "message": "This value is too long."})
        elif name == "email":
            if " " in value or value.count("@") != 1:
                fields.append({"name": name, "message": "Enter a valid email address."})
        elif name in _DATE_FIELDS:
            try:
                date.fromisoformat(value)
            except ValueError:
                fields.append({"name": name, "message": "Use YYYY-MM-DD."})
        elif name == "library_id" and value not in libraries:
            fields.append({"name": name, "message": "This value is not valid."})
        elif name == "category_id" and value not in categories:
            fields.append({"name": name, "message": "This value is not valid."})

    if fields:
        _validation_failure(fields)


def _load_write_maps(client) -> tuple[dict[str, str], dict[str, str]]:
    categories = _category_map(client)
    libraries = _library_map(client)
    if categories is None or libraries is None:
        raise _UNAVAILABLE
    return categories, libraries


def _audit_create_fields(body: dict) -> list[str]:
    required = [key for key in ("surname", "library_id", "category_id") if key in body]
    rest = sorted(key for key in body if key not in {"surname", "library_id", "category_id"})
    return required + rest


def _create_body(payload: PatronWrite) -> dict:
    data = payload.model_dump(exclude={"confirm_duplicate"})
    body: dict = {}
    for key, value in data.items():
        if value is None or value == "":
            continue
        body[key] = value
    return body


def _merge_update(row: dict, payload: PatronWrite) -> dict:
    merged = dict(row)
    overlays = payload.model_dump(exclude_unset=True, exclude={"confirm_duplicate"})
    for key, value in overlays.items():
        merged[key] = None if value == "" else value
    return merged


def _changed_write_keys(before: dict, after: dict) -> list[str]:
    changed: list[str] = []
    for key in _WRITE_ALLOWLIST:
        if before.get(key) != after.get(key):
            changed.append(key)
    return changed


def _raise_koha_write_error(exc: KohaRequestError) -> None:
    if exc.status_code == 409:
        raise PatronError(
            409,
            "patron_duplicate",
            "Koha already has a patron with that identifier.",
        ) from exc
    field_errors = [
        {"name": name, "message": "Koha did not accept this field."}
        for name in exc.fields
        if name in _WRITE_ALLOWLIST_SET
    ]
    raise PatronError(
        422,
        "patron_rejected",
        "Koha did not accept the patron record.",
        fields=field_errors or None,
    ) from exc


def _detail_from_row(
    row: dict,
    client,
    *,
    sensitive: bool,
) -> dict:
    categories = _category_map(client) or {}
    libraries = _library_map(client) or {}
    return detail_item(row, categories, libraries, sensitive=sensitive)


def create_patron_record(
    db: Session,
    client,
    payload: PatronWrite,
    *,
    user_id,
    sensitive: bool,
) -> dict:
    _assert_sensitive_write(payload, sensitive, update=False)
    categories, libraries = _load_write_maps(client)
    _validate_write(payload, is_create=True, categories=categories, libraries=libraries)
    body = _create_body(payload)
    try:
        row = client.create_patron(body, confirm_duplicate=payload.confirm_duplicate)
    except KohaRequestError as exc:
        _raise_koha_write_error(exc)
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    item = _detail_from_row(row, client, sensitive=sensitive)
    patron_id = item.get("patron_id", row.get("patron_id"))
    db.add(
        AuditLog(
            user_id=user_id,
            action="patrons.create",
            module="patrons",
            entity_type="patron",
            entity_id=str(patron_id),
            details={"fields": _audit_create_fields(body)},
        )
    )
    db.commit()
    return item


def update_patron_record(
    db: Session,
    client,
    patron_id: int,
    payload: PatronWrite,
    *,
    user_id,
    sensitive: bool,
) -> dict:
    _assert_sensitive_write(payload, sensitive, update=True)
    try:
        row = client.get_patron(patron_id)
    except KohaNotFound as exc:
        raise _NOT_FOUND from exc
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    categories, libraries = _load_write_maps(client)
    _validate_write(payload, is_create=False, categories=categories, libraries=libraries)
    merged = _merge_update(row, payload)
    try:
        updated = client.update_patron(patron_id, merged)
    except KohaRequestError as exc:
        _raise_koha_write_error(exc)
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    changed = _changed_write_keys(row, merged)
    item = _detail_from_row(updated, client, sensitive=sensitive)
    db.add(
        AuditLog(
            user_id=user_id,
            action="patrons.update",
            module="patrons",
            entity_type="patron",
            entity_id=str(patron_id),
            details={"fields": changed},
        )
    )
    db.commit()
    return item