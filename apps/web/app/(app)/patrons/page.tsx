export const instant = false;

import { Suspense } from "react";

import { PatronDirectory } from "@/components/patrons/patron-directory";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function PatronsPage() {
  const gate = await gatePage("patrons.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  const canCreate = gate.me.permissions.includes("patrons.create");
  const canUpdate = gate.me.permissions.includes("patrons.update");
  const canSensitive = gate.me.permissions.includes("patrons.sensitive.view");

  return (
    <Suspense fallback={null}>
      <PatronDirectory
        canCreate={canCreate}
        canUpdate={canUpdate}
        canSensitive={canSensitive}
      />
    </Suspense>
  );
}