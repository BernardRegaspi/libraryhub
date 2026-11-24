export const instant = false;

import { Suspense } from "react";

import { InventoryDesk } from "@/components/inventory/inventory-desk";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function InventoryPage() {
  const gate = await gatePage("inventory.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  const { me } = gate;

  return (
    <Suspense fallback={null}>
      <InventoryDesk
        permissions={me.permissions}
        departmentId={me.active_department_id}
        userId={me.user.id}
      />
    </Suspense>
  );
}
