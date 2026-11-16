export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function CirculationPage() {
  const gate = await gatePage("circulation.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Library"
      title="Circulation desk"
      description="Every action is executed by Koha. Success is shown only after Koha confirms the transaction."
    />
  );
}