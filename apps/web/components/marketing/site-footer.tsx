import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BookOpen01Icon,
  CallIcon,
  Facebook01Icon,
  Location01Icon,
  Mail01Icon,
  SearchingIcon,
} from "@hugeicons/core-free-icons";
import {
  KOHA_CATALOG_URL,
  LIBRARY_FACEBOOK_URL,
  USANT_FACEBOOK_URL,
  USANT_HOME_URL,
  USANT_LOGO_URL,
} from "@/lib/marketing/constants";

const linkClass = "text-cream/75 transition-colors hover:text-gold-300";

export function SiteFooter() {
  return (
    <footer className="bg-maroon-950 text-cream/85">
      <div className="site-container grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src={USANT_LOGO_URL}
              alt="Official seal of the University of Saint Anthony"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
            />
            <p className="leading-tight">
              <span className="font-display block text-lg font-bold text-cream">
                University Library
              </span>
              <span className="block text-xs tracking-[0.16em] text-gold-300 uppercase">
                University of Saint Anthony
              </span>
            </p>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-cream/70">
            The central learning hub of the University of Saint Anthony,
            supporting academic excellence through print and digital
            collections, research support, and welcoming study spaces.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <a
              href={USANT_FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="USANT official Facebook page"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream/20 text-cream transition-colors hover:border-gold-400 hover:text-gold-300"
            >
              <HugeiconsIcon icon={Facebook01Icon} size={16} />
            </a>
            <a
              href={LIBRARY_FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="USANT Library Facebook page"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream/20 text-cream transition-colors hover:border-gold-400 hover:text-gold-300"
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={16} />
            </a>
            <a
              href={KOHA_CATALOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="USANT Library System"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream/20 text-cream transition-colors hover:border-gold-400 hover:text-gold-300"
            >
              <HugeiconsIcon icon={SearchingIcon} size={16} />
            </a>
          </div>
        </div>

        <nav aria-label="Quick links">
          <h2 className="text-sm font-bold tracking-wide text-gold-300 uppercase">
            Quick Links
          </h2>
          <ul className="mt-5 space-y-3 text-sm">
            <li>
              <a className={linkClass} href="#home">
                Home
              </a>
            </li>
            <li>
              <a className={linkClass} href="#about">
                About the Library
              </a>
            </li>
            <li>
              <a className={linkClass} href="#services">
                Library Services
              </a>
            </li>
            <li>
              <a className={linkClass} href="#libraries">
                Our Libraries
              </a>
            </li>
            <li>
              <a className={linkClass} href="#policies">
                Library Policies
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Library resources">
          <h2 className="text-sm font-bold tracking-wide text-gold-300 uppercase">
            Library Resources
          </h2>
          <ul className="mt-5 space-y-3 text-sm">
            <li>
              <a
                className={linkClass}
                href={KOHA_CATALOG_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Online Library Catalog
              </a>
            </li>
            <li>
              <a className={linkClass} href="#resources">
                Digital Resources
              </a>
            </li>
            <li>
              <a className={linkClass} href="#contact">
                Research Assistance
              </a>
            </li>
            <li>
              <a className={linkClass} href="#announcements">
                Library Announcements
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold tracking-wide text-gold-300 uppercase">
            Contact Information
          </h2>
          <ul className="mt-5 space-y-4 text-sm">
            <li className="flex gap-3">
              <HugeiconsIcon
                icon={Location01Icon}
                className="mt-0.5 shrink-0 text-gold-400"
                size={16}
              />
              <span>
                Dr. Ortega St., San Miguel,
                <br />
                Iriga City 4431, Philippines
              </span>
            </li>
            <li className="flex gap-3">
              <HugeiconsIcon
                icon={CallIcon}
                className="mt-0.5 shrink-0 text-gold-400"
                size={16}
              />
              <a href="tel:+63542051234" className={linkClass}>
                (054) 205-1234
              </a>
            </li>
            <li className="flex gap-3">
              <HugeiconsIcon
                icon={Mail01Icon}
                className="mt-0.5 shrink-0 text-gold-400"
                size={16}
              />
              <a href="mailto:info@usant.edu.ph" className={linkClass}>
                info@usant.edu.ph
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-cream/10">
        <div className="site-container flex flex-col items-center justify-between gap-3 py-6 text-xs text-cream/60 md:flex-row">
          <p>© 2026 University of Saint Anthony. All Rights Reserved.</p>
          <p className="flex flex-wrap items-center justify-center gap-2">
            <a
              href={USANT_HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gold-300"
            >
              www.usant.edu.ph
            </a>
            <span aria-hidden>·</span>
            <a
              href={KOHA_CATALOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gold-300"
            >
              library.usant.edu.ph
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
