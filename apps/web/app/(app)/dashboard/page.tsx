export const instant = false;

import Link from "next/link";
import type { ReactNode } from "react";

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { gatePage } from "@/lib/auth/session";
import type { CurrentUser } from "@/lib/auth/types";

function manilaHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hourPart = parts.find((part) => part.type === "hour");
  return Number(hourPart?.value ?? "0");
}

function dashboardTitle(displayName: string, now: Date): string {
  const hour = manilaHour(now);
  let salutation: string;
  if (hour < 12) {
    salutation = "Good morning";
  } else if (hour < 18) {
    salutation = "Good afternoon";
  } else {
    salutation = "Good evening";
  }
  const firstWord = displayName.trim().split(/\s+/)[0] ?? displayName;
  return `${salutation}, ${firstWord}`;
}

function overviewDepartmentName(me: CurrentUser): string {
  if (me.active_department_id === null) {
    return "All departments";
  }
  const active = me.departments.find(
    (department) => department.id === me.active_department_id,
  );
  return active?.name ?? "All departments";
}

function dashboardDescription(me: CurrentUser, now: Date): string {
  const name = overviewDepartmentName(me);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  return `Operational overview for ${name} · ${dateLabel}`;
}

function dashboardActions(me: CurrentUser): ReactNode {
  const actions: ReactNode[] = [];

  if (me.permissions.includes("catalog.view")) {
    actions.push(
      <Button
        key="catalog"
        variant="outline"
        nativeButton={false}
        render={<Link href="/catalog" />}
      >
        Search catalog
      </Button>,
    );
  }

  if (me.permissions.includes("circulation.view")) {
    actions.push(
      <Button
        key="circulation"
        variant="outline"
        nativeButton={false}
        render={<Link href="/circulation" />}
      >
        Circulation desk
      </Button>,
    );
  }

  if (actions.length === 0) {
    return undefined;
  }

  return <>{actions}</>;
}

export default async function DashboardPage() {
  const gate = await gatePage("dashboard.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  const { me } = gate;
  const now = new Date();

  return (
    <ModuleFrame
      eyebrow="Overview"
      title={dashboardTitle(me.user.display_name, now)}
      description={dashboardDescription(me, now)}
      actions={dashboardActions(me)}
    />
  );
}