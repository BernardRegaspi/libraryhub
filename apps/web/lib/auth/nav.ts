export type StaffNavItem = {
  group: string;
  label: string;
  href: string;
  permission: string;
  icon: null;
};

export const STAFF_NAV: StaffNavItem[] = [
  {
    group: "Overview",
    label: "Dashboard",
    href: "/dashboard",
    permission: "dashboard.view",
    icon: null,
  },
  {
    group: "Library",
    label: "Catalog",
    href: "/catalog",
    permission: "catalog.view",
    icon: null,
  },
  {
    group: "Library",
    label: "Patrons",
    href: "/patrons",
    permission: "patrons.view",
    icon: null,
  },
  {
    group: "Library",
    label: "Circulation",
    href: "/circulation",
    permission: "circulation.view",
    icon: null,
  },
  {
    group: "Library",
    label: "Holds",
    href: "/holds",
    permission: "holds.view",
    icon: null,
  },
  {
    group: "Library",
    label: "Inventory",
    href: "/inventory",
    permission: "inventory.view",
    icon: null,
  },
  {
    group: "Communication",
    label: "Notifications",
    href: "/notifications",
    permission: "notifications.view",
    icon: null,
  },
  {
    group: "Communication",
    label: "Announcements",
    href: "/announcements",
    permission: "announcements.view",
    icon: null,
  },
  {
    group: "Insights",
    label: "Reports",
    href: "/reports",
    permission: "reports.view",
    icon: null,
  },
  {
    group: "Administration",
    label: "Departments",
    href: "/departments",
    permission: "departments.view",
    icon: null,
  },
  {
    group: "Administration",
    label: "Staff & Roles",
    href: "/staff",
    permission: "staff.view",
    icon: null,
  },
  {
    group: "Administration",
    label: "Audit Log",
    href: "/audit",
    permission: "audit.view",
    icon: null,
  },
  {
    group: "Administration",
    label: "Koha Integration",
    href: "/integrations",
    permission: "integrations.view",
    icon: null,
  },
  {
    group: "Pilot",
    label: "Student Portal",
    href: "/student",
    permission: "student.view",
    icon: null,
  },
];

export const STAFF_PATHS = STAFF_NAV.map((item) => item.href);