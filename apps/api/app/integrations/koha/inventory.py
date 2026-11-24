from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReadCapability:
    method: str
    path: str


@dataclass(frozen=True)
class ItemListCapability:
    method: str
    path: str
    library_param: str


@dataclass(frozen=True)
class InventoryCapabilities:
    item_list: ItemListCapability | None = None
    locations: ReadCapability | None = None
    item_update: ReadCapability | None = None
    update_fields: tuple[str, ...] = ()


def get_inventory_capabilities() -> InventoryCapabilities:
    # This Koha host rejects a bare home_library_id query and accepts
    # q={"home_library_id": "<library>"}. start_session sends that q.
    return InventoryCapabilities(
        item_list=ItemListCapability("GET", "/items", "home_library_id"),
    )


def capabilities_payload(caps: InventoryCapabilities) -> dict:
    return {
        "item_list": caps.item_list is not None,
        "locations": caps.locations is not None,
        "item_update": caps.item_update is not None,
        "update_fields": list(caps.update_fields),
    }