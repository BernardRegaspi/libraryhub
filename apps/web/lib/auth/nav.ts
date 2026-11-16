import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  BarcodeIcon,
  BookOpen01Icon,
  Bookmark01Icon,
  Building03Icon,
  Chart01Icon,
  ClipboardIcon,
  DashboardSpeed01Icon,
  IdentityCardIcon,
  Megaphone01Icon,
  Mortarboard01Icon,
  Notification01Icon,
  Plug01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

export type StaffNavItem = {
  group: string;
  label: string;
  href: string;
  permission: string;
  icon: IconSvgElement;
};

export const STAFF_NAV: StaffNavItem[] = [
  {
    group: "Overview",
    label: "Dashboard",
    href: "/dashboard",
    permission: "dashboard.view",
    icon: DashboardSpeed01Icon,
  },
  {
    group: "Library",
    label: "Catalog",
    href: "/catalog",
    permission: "catalog.view",
    icon: BookOpen01Icon,
  },
  {
    group: "Library",
    label: "Patrons",
    href: "/patrons",
    permission: "patrons.view",
    icon: IdentityCardIcon,
  },
  {
    group: "Library",
    label: "Circulation",
    href: "/circulation",
    permission: "circulation.view",
    icon: ArrowReloadHorizontalIcon,
  },
  {
    group: "Library",
    label: "Holds",
    href: "/holds",
    permission: "holds.view",
    icon: Bookmark01Icon,
  },
  {
    group: "Library",
    label: "Inventory",
    href: "/inventory",
    permission: "inventory.view",
    icon: BarcodeIcon,
  },
  {
    group: "Communication",
    label: "Notifications",
    href: "/notifications",
    permission: "notifications.view",
    icon: Notification01Icon,
  },
  {
    group: "Communication",
    label: "Announcements",
    href: "/announcements",
    permission: "announcements.view",
    icon: Megaphone01Icon,
  },
  {
    group: "Insights",
    label: "Reports",
    href: "/reports",
    permission: "reports.view",
    icon: Chart01Icon,
  },
  {
    group: "Administration",
    label: "Departments",
    href: "/departments",
    permission: "departments.view",
    icon: Building03Icon,
  },
  {
    group: "Administration",
    label: "Staff & Roles",
    href: "/staff",
    permission: "staff.view",
    icon: UserGroupIcon,
  },
  {
    group: "Administration",
    label: "Audit Log",
    href: "/audit",
    permission: "audit.view",
    icon: ClipboardIcon,
  },
  {
    group: "Administration",
    label: "Koha Integration",
    href: "/integrations",
    permission: "integrations.view",
    icon: Plug01Icon,
  },
  {
    group: "Pilot",
    label: "Student Portal",
    href: "/student",
    permission: "student.view",
    icon: Mortarboard01Icon,
  },
];

export const STAFF_PATHS = STAFF_NAV.map((item) => item.href);