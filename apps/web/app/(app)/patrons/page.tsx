import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function PatronsPage() {
  const gate = await gatePage("patrons.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Library"
      title="Patron lookup"
      description="Search permitted patron fields from Koha. Sensitive fields are masked. Ambiguous matches are shown for manual review and are never auto-merged."
    />
  );
}