"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  Menu03Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  KOHA_CATALOG_URL,
  PRIMARY_NAV,
  USANT_LOGO_URL,
  type NavEntry,
  type NavLinkItem,
} from "@/lib/marketing/constants";

function DesktopNavLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "relative inline-flex items-center whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium text-ink transition-colors hover:text-maroon-700 xl:px-3 xl:text-[15px] after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-gold-400 after:transition-transform hover:after:scale-x-100";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

function NavDropdown({ entry }: { entry: Extract<NavEntry, { type: "dropdown" }> }) {
  return (
    <li className="group relative">
      <button
        type="button"
        className="relative inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium text-ink transition-colors hover:text-maroon-700 xl:px-3 xl:text-[15px]"
        aria-haspopup="true"
      >
        {entry.label}
        <span className="text-[10px] transition-transform group-hover:rotate-180">
          ▾
        </span>
      </button>
      <ul
        role="menu"
        className="invisible absolute top-full left-0 z-60 mt-2 min-w-64 translate-y-2 rounded-2xl border border-maroon-700/10 bg-white p-2 opacity-0 shadow-[0_24px_60px_-20px_rgba(34,26,24,0.3)] transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
      >
        {entry.items.map((item) => (
          <li key={item.label} role="none">
            <DropdownLink item={item} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function DropdownLink({ item }: { item: NavLinkItem }) {
  const className =
    "block rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-maroon-50 hover:text-maroon-700";
  if (item.external) {
    return (
      <a
        role="menuitem"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {item.label}
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          className="ml-1 inline opacity-60"
          size={12}
        />
      </a>
    );
  }
  return (
    <a role="menuitem" href={item.href} className={className}>
      {item.label}
    </a>
  );
}

function MobileNavEntry({
  entry,
  onNavigate,
}: {
  entry: NavEntry;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (entry.type === "link") {
    const link = (
      <a
        href={entry.href}
        onClick={onNavigate}
        className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-maroon-100 hover:text-maroon-700"
      >
        {entry.label}
      </a>
    );
    if (entry.external) {
      return (
        <a
          href={entry.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-maroon-100 hover:text-maroon-700"
        >
          {entry.label}
        </a>
      );
    }
    return link;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium text-ink transition-colors hover:bg-maroon-100 hover:text-maroon-700"
        aria-expanded={open}
      >
        {entry.label}
        <span className={cn("text-xs transition-transform", open && "rotate-180")}>
          ▾
        </span>
      </button>
      {open ? (
        <ul className="ml-3 space-y-1 border-l-2 border-gold-400/60 py-1 pl-4">
          {entry.items.map((item) => (
            <li key={item.label}>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onNavigate}
                  className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-maroon-50 hover:text-maroon-700"
                >
                  {item.label}
                </a>
              ) : (
                <a
                  href={item.href}
                  onClick={onNavigate}
                  className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-maroon-50 hover:text-maroon-700"
                >
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-maroon-950/10 bg-cream/95 backdrop-blur transition-shadow duration-300",
        scrolled && "shadow-[0_12px_32px_-14px_rgba(46,8,10,0.28)]",
      )}
    >
      <nav aria-label="Primary" className="site-container">
        <div className="flex h-[76px] min-w-0 items-center justify-between gap-2 sm:gap-3 xl:gap-4">
          <Link
            href="#home"
            className="group flex max-w-[52%] min-w-0 shrink items-center gap-2 sm:gap-3 xl:max-w-none"
            aria-label="USANT University Library — home"
          >
            <Image
              src={USANT_LOGO_URL}
              alt="Official seal of the University of Saint Anthony"
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105"
              priority
            />
            <span className="min-w-0 leading-tight">
              <span className="block text-[11px] font-semibold tracking-[0.18em] text-maroon-700 uppercase">
                University of Saint Anthony
              </span>
              <span className="font-display block text-xl font-bold tracking-tight text-ink md:text-2xl">
                University Library
              </span>
            </span>
          </Link>

          <ul className="hidden min-w-0 shrink items-center gap-0.5 xl:flex xl:gap-1">
            {PRIMARY_NAV.map((entry) =>
              entry.type === "link" ? (
                <li key={entry.label}>
                  <DesktopNavLink href={entry.href} external={entry.external}>
                    {entry.label}
                  </DesktopNavLink>
                </li>
              ) : (
                <NavDropdown key={entry.label} entry={entry} />
              ),
            )}
          </ul>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              nativeButton={false}
              render={
                <a
                  href={KOHA_CATALOG_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              className="hidden h-10 rounded-full border-transparent bg-maroon-700 px-3.5 text-xs font-semibold whitespace-nowrap text-cream shadow-[0_26px_60px_-22px_rgba(125,21,25,0.45)] hover:bg-gold-400 hover:text-maroon-950 sm:inline-flex xl:px-5 xl:text-sm"
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={18} strokeWidth={1.75} />
              <span className="xl:hidden">Access Library</span>
              <span className="hidden xl:inline">Access Library System</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="rounded-xl border-maroon-950/15 text-maroon-800 hover:bg-maroon-50 xl:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <HugeiconsIcon
                icon={menuOpen ? Cancel01Icon : Menu03Icon}
                size={22}
                strokeWidth={1.75}
              />
            </Button>
          </div>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={cn(
          "border-t border-maroon-950/10 bg-cream shadow-[0_10px_40px_-12px_rgba(34,26,24,0.16)] xl:hidden",
          !menuOpen && "hidden",
        )}
      >
        <ul className="site-container max-h-[70vh] space-y-1 overflow-y-auto py-4">
          {PRIMARY_NAV.map((entry) => (
            <li key={entry.type === "link" ? entry.label : entry.label}>
              <MobileNavEntry
                entry={entry}
                onNavigate={() => setMenuOpen(false)}
              />
            </li>
          ))}
          <li className="pt-2">
            <Button
              nativeButton={false}
              render={
                <a
                  href={KOHA_CATALOG_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              className="flex h-11 w-full rounded-full border-transparent bg-maroon-700 text-sm font-semibold text-cream"
              onClick={() => setMenuOpen(false)}
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={18} />
              Access Library System
            </Button>
          </li>
        </ul>
      </div>
    </header>
  );
}