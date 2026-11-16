import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function AuditPage() {
  const gate = await gatePage("audit.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Administration"
      title="Audit log"
      description="Append-only record of security and sensitive business events."
    />
  );
}