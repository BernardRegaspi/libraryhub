import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { StaffShell } from "@/components/layout/staff-shell";
import { getCurrentUser } from "@/lib/auth/session";

export const instant = false;

export default async function StaffAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/dashboard";

  let me;
  try {
    me = await getCurrentUser();
  } catch {
    return (
      <div className="ulms flex min-h-screen items-center justify-center px-6">
        <p className="text-center text-sm text-foreground">
          The sign-in service is unavailable.
        </p>
      </div>
    );
  }

  if (!me) {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <div className="ulms min-h-screen">
      <StaffShell me={me}>{children}</StaffShell>
    </div>
  );
}