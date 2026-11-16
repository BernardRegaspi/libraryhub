import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function HoldsPage() {
  const gate = await gatePage("holds.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Library"
      title="Holds & reservations"
      description="Koha is authoritative for hold queues. ULMS never keeps a second queue."
    />
  );
}