export const instant = false;

import { Suspense } from "react";

import { CirculationDesk } from "@/components/circulation/circulation-desk";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function CirculationPage() {
  const gate = await gatePage("circulation.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <Suspense fallback={null}>
      <CirculationDesk permissions={gate.me.permissions} />
    </Suspense>
  );
}