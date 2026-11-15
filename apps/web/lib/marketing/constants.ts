export const KOHA_CATALOG_URL = "https://library.usant.edu.ph/";
export const KOHA_SEARCH_URL =
  "https://library.usant.edu.ph/cgi-bin/koha/opac-search.pl";
export const USANT_HOME_URL = "https://www.usant.edu.ph/";
export const USANT_LIBRARY_URL = "https://www.usant.edu.ph/library";
export const USANT_LOGO_URL =
  "https://www.usant.edu.ph/images/usant_logo_new.png";
export const LIBRARY_BANNER_URL =
  "https://www.usant.edu.ph/images/banner/library-banner.jpg";

export type NavLinkItem = {
  label: string;
  href: string;
  external?: boolean;
};

export type NavEntry =
  | { type: "link"; label: string; href: string; external?: boolean }
  | { type: "dropdown"; label: string; items: NavLinkItem[] };

export const PRIMARY_NAV: NavEntry[] = [
  { type: "link", label: "Home", href: "#home" },
  { type: "link", label: "About the Library", href: "#about" },
  { type: "link", label: "Library Services", href: "#services" },
  {
    type: "dropdown",
    label: "Our Libraries",
    items: [
      { label: "University / College Library", href: "#lib-university" },
      { label: "Graduate School Library", href: "#lib-graduate" },
      { label: "Junior High School Library", href: "#lib-jhs" },
      { label: "Senior High School Library", href: "#lib-shs" },
      { label: "Grade School Library", href: "#lib-grade" },
      { label: "Audio-Visual Room", href: "#lib-av" },
    ],
  },
  {
    type: "dropdown",
    label: "Resources",
    items: [
      {
        label: "Online Library Catalog",
        href: KOHA_CATALOG_URL,
        external: true,
      },
      { label: "Digital Resources", href: "#resources" },
      { label: "Library Policies", href: "#policies" },
      { label: "Library Schedule", href: "#hours" },
    ],
  },
  { type: "link", label: "Announcements", href: "#announcements" },
  { type: "link", label: "Contact Us", href: "#contact" },
];

export const QUICK_ACCESS_TILES = [
  {
    title: "Online Library Catalog",
    description: "Search and discover available library materials.",
    href: KOHA_CATALOG_URL,
    external: true,
    icon: "search" as const,
  },
  {
    title: "Digital Resources",
    description:
      "Discover available electronic learning and research resources.",
    href: "#resources",
    external: false,
    icon: "laptop" as const,
  },
  {
    title: "Library Services",
    description: "Explore the services available to students and faculty.",
    href: "#services",
    external: false,
    icon: "handshake" as const,
  },
  {
    title: "Library Policies",
    description: "Learn about library rules and borrowing guidelines.",
    href: "#policies",
    external: false,
    icon: "legal" as const,
  },
  {
    title: "Library Schedule",
    description: "Check library operating hours.",
    href: "#hours",
    external: false,
    icon: "clock" as const,
  },
  {
    title: "Research Assistance",
    description:
      "Find support for academic research and information needs.",
    href: "#contact",
    external: false,
    icon: "contact" as const,
  },
] as const;

export const LIBRARY_GOALS = [
  "Provide library materials and services responsive to the needs of the USANT community.",
  "Ensure maximum accessibility to library resources.",
  "Maintain comfortable, convenient, safe, accessible, and well-maintained facilities.",
  "Develop effective and committed library personnel.",
  "Improve access to collections and services through automated library systems.",
] as const;