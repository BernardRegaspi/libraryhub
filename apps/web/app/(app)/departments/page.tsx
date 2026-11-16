export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function DepartmentsPage() {
  const gate = await gatePage("departments.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Administration"
      title="Departments & Koha branch mapping"
      description="Each department is configurable. Branch-dependent writes stay blocked until the mapping is verified."
    />
  );
}