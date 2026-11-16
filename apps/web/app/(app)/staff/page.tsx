export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function StaffPage() {
  const gate = await gatePage("staff.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Administration"
      title="Staff & roles"
      description="Role-based access with department scope. Permissions are enforced on every API endpoint."
    />
  );
}