from __future__ import annotations


class InventoryError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def unsupported() -> InventoryError:
    return InventoryError(
        501,
        "inventory_unsupported",
        "This Koha operation is not available.",
    )


def department_required() -> InventoryError:
    return InventoryError(409, "department_required", "Choose a department first.")


def branch_unmapped() -> InventoryError:
    return InventoryError(
        422,
        "branch_unmapped",
        "This department has no Koha library.",
    )


def invalid_scan() -> InventoryError:
    return InventoryError(422, "invalid_scan", "That scan is not valid.")


def invalid_state() -> InventoryError:
    return InventoryError(
        409,
        "invalid_state",
        "That action is not available for this session.",
    )


def not_unverified() -> InventoryError:
    return InventoryError(
        409,
        "not_unverified",
        "Only an unverified item can be marked not found.",
    )


def not_approver() -> InventoryError:
    return InventoryError(
        403,
        "not_approver",
        "The person who drafted this proposal cannot approve it.",
    )


def not_submittable() -> InventoryError:
    return InventoryError(
        409,
        "not_submittable",
        "That proposal cannot be submitted.",
    )


def field_not_allowed() -> InventoryError:
    return InventoryError(
        422,
        "field_not_allowed",
        "That item field cannot be changed from inventory.",
    )


def ambiguous_barcode() -> InventoryError:
    return InventoryError(
        409,
        "ambiguous_barcode",
        "Two items in this snapshot share a barcode.",
    )


def inventory_unavailable() -> InventoryError:
    return InventoryError(
        503,
        "inventory_unavailable",
        "Inventory is unavailable. Try again.",
    )