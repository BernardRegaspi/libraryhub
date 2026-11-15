import Link from "next/link";
import {
  KOHA_CATALOG_URL,
  USANT_HOME_URL,
  USANT_LIBRARY_URL,
} from "@/lib/marketing/constants";

export function SiteFooter() {
  return (
    <footer className="bg-maroon-950 text-cream">
      <div className="site-container grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-bold text-cream">
            USANT University Library
          </p>
          <p className="mt-3 text-sm leading-relaxed text-cream/70">
            The public information portal for the University of Saint Anthony
            Library — collections, services, hours, and access to the USANT
            Library System.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-cream">Explore</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a href="#about" className="text-cream/72 hover:text-gold-300">
                About the Library
              </a>
            </li>
            <li>
              <a href="#services" className="text-cream/72 hover:text-gold-300">
                Library Services
              </a>
            </li>
            <li>
              <a
                href={KOHA_CATALOG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cream/72 hover:text-gold-300"
              >
                Online Catalog
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-cream">University</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link
                href={USANT_HOME_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cream/72 hover:text-gold-300"
              >
                USANT Main Site
              </Link>
            </li>
            <li>
              <Link
                href={USANT_LIBRARY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cream/72 hover:text-gold-300"
              >
                Official Library Page
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-cream">Campus</p>
          <p className="mt-4 text-sm leading-relaxed text-cream/72">
            Dr. Ortega St., San Miguel
            <br />
            Iriga City 4431, Philippines
          </p>
        </div>
      </div>
      <div className="border-t border-cream/10">
        <div className="site-container flex flex-col items-center justify-between gap-3 py-6 text-xs text-cream/60 md:flex-row">
          <p>© 2026 University of Saint Anthony. All Rights Reserved.</p>
          <p className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href={USANT_HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gold-300"
            >
              www.usant.edu.ph
            </Link>
            <span aria-hidden>·</span>
            <Link
              href={KOHA_CATALOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gold-300"
            >
              library.usant.edu.ph
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}