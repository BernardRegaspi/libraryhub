export const instant = false;

import { PatronDetailView } from "@/components/patrons/patron-detail";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

type PatronDetailPageProps = {
  params: Promise<{ patronId: string }>;
};

function PatronNotFound() {
  return (
    <div className="flex flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-sm text-foreground">That patron was not found.</p>
    </div>
  );
}

export default async function PatronDetailPage({ params }: PatronDetailPageProps) {
  const { patronId } = await params;
  if (!/^\d+$/.test(patronId)) {
    return <PatronNotFound />;
  }
  const parsedId = Number.parseInt(patronId, 10);
  if (parsedId <= 0) {
    return <PatronNotFound />;
  }

  const gate = await gatePage("patrons.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  const canUpdate = gate.me.permissions.includes("patrons.update");
  const canSensitive = gate.me.permissions.includes("patrons.sensitive.view");
  const canCirculate = gate.me.permissions.includes("circulation.view");

  return (
    <PatronDetailView
      patronId={patronId}
      canUpdate={canUpdate}
      canSensitive={canSensitive}
      canCirculate={canCirculate}
    />
  );
}