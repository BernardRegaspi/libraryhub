from app.integrations.koha.inventory import (
    InventoryCapabilities,
    capabilities_payload,
    get_inventory_capabilities,
)
from app.services.inventory_errors import unsupported


def test_inventory_capabilities_start_unset():
    caps = get_inventory_capabilities()
    assert isinstance(caps, InventoryCapabilities)
    assert caps.item_list is None
    assert caps.locations is None
    assert caps.item_update is None
    assert caps.update_fields == ()
    payload = capabilities_payload(caps)
    assert payload == {
        "item_list": False,
        "locations": False,
        "item_update": False,
        "update_fields": [],
    }


def test_unsupported_inventory_message():
    exc = unsupported()
    assert exc.status_code == 501
    assert exc.code == "inventory_unsupported"
    assert exc.message == "This Koha operation is not available."