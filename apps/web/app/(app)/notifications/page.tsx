export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function NotificationsPage() {
  const gate = await gatePage("notifications.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Communication"
      title="Notifications"
      description="Durable in-app notifications stored in PostgreSQL. They survive reconnects and page reloads."
    />
  );
}