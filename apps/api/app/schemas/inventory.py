from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    department_id: UUID | None = None
    start_on: date
    target_on: date | None = None
    locations: list[str] = Field(default_factory=list)
    item_type_id: int | None = None
    operator_ids: list[UUID] = Field(default_factory=list)


class SessionUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    start_on: date | None = None
    target_on: date | None = None
    locations: list[str] | None = None
    item_type_id: int | None = None
    operator_ids: list[UUID] | None = None


class ScanIn(BaseModel):
    barcode: str = Field(min_length=1)
    station_location: str | None = None
    damaged: bool = False


class DamageIn(BaseModel):
    damaged: bool
    remark: str = Field(min_length=1)


class ShelfSearchIn(BaseModel):
    expected_item_ids: list[UUID] = Field(min_length=1, max_length=200)
    remark: str = Field(min_length=1)


class ShelfSearchReverseIn(BaseModel):
    remark: str = Field(min_length=1)


class AdjustmentCreateIn(BaseModel):
    koha_item_id: int = Field(ge=1)
    field: str = Field(min_length=1)
    to_value: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    from_value: str | None = None
    expected_item_id: UUID | None = None
    scan_id: UUID | None = None


class AdjustmentUpdateIn(BaseModel):
    field: str = Field(min_length=1)
    to_value: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    from_value: str | None = None


class AdjustmentRejectIn(BaseModel):
    reason: str = ""