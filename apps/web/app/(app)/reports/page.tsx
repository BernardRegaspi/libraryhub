export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function ReportsPage() {
  const gate = await gatePage("reports.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Insights"
      title="Reports & exports"
      description="Every report shows its source, generation time, and data freshness. Large exports run as background jobs in production."
    />
  );
}