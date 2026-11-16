import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function IntegrationsPage() {
  const gate = await gatePage("integrations.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Administration"
      title="Koha integration"
      description="Capability registry, health, and feature flags. Unsupported actions stay disabled."
    />
  );
}