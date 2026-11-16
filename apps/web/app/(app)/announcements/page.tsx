import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function AnnouncementsPage() {
  const gate = await gatePage("announcements.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Communication"
      title="Announcements"
      description="Publish department-targeted notices. Each announcement also creates durable in-app notifications."
    />
  );
}