export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function StudentPage() {
  const gate = await gatePage("student.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Student self-service"
      title="Student portal"
      description="You can see only your own account. The account is linked to Koha by a verified student identifier."
    />
  );
}