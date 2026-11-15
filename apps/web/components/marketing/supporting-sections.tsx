import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KOHA_CATALOG_URL, USANT_LIBRARY_URL } from "@/lib/marketing/constants";

const LIBRARY_BRANCHES = [
  { id: "lib-university", name: "University / College Library" },
  { id: "lib-graduate", name: "Graduate School Library" },
  { id: "lib-jhs", name: "Junior High School Library" },
  { id: "lib-shs", name: "Senior High School Library" },
  { id: "lib-grade", name: "Grade School Library" },
  { id: "lib-av", name: "Audio-Visual Room" },
] as const;

const SERVICES = [
  {
    title: "Circulation & borrowing",
    description:
      "Borrow print materials, renew loans, and manage account transactions at the circulation desk.",
  },
  {
    title: "Reference & research help",
    description:
      "Get guidance on finding credible sources, using databases, and citing scholarly work.",
  },
  {
    title: "Study & learning spaces",
    description:
      "Use reading areas and branch libraries across campus for individual and group study.",
  },
] as const;

function SectionShell({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-maroon-700/10 py-16 md:py-20">
      <div className="site-container">
        <p className="text-xs font-bold tracking-[0.28em] text-gold-600 uppercase">
          {eyebrow}
        </p>
        <h2 className="font-display mt-2 max-w-2xl text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function SupportingSections() {
  return (
    <>
      <SectionShell
        id="services"
        eyebrow="Library services"
        title="Support for every stage of learning"
      >
        <ul className="grid gap-5 md:grid-cols-3">
          {SERVICES.map((service) => (
            <li
              key={service.title}
              className="rounded-2xl border border-maroon-700/10 bg-white p-6 shadow-[0_10px_40px_-12px_rgba(34,26,24,0.16)]"
            >
              <h3 className="font-semibold text-ink">{service.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">
                {service.description}
              </p>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell
        id="lib-university"
        eyebrow="Our libraries"
        title="Branch libraries across USANT"
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LIBRARY_BRANCHES.map((branch) => (
            <li
              key={branch.id}
              id={branch.id}
              className="scroll-mt-28 rounded-xl border border-maroon-700/10 bg-maroon-50/60 px-4 py-3 text-sm font-medium text-ink"
            >
              {branch.name}
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell
        id="resources"
        eyebrow="Resources"
        title="Print, digital, and catalog access"
      >
        <p className="max-w-3xl leading-relaxed text-ink/75">
          Search the Koha OPAC for physical holdings, explore licensed databases,
          and consult curated guides through the library portal.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            nativeButton={false}
            render={
              <a
                href={KOHA_CATALOG_URL}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            className="h-10 rounded-full border-transparent bg-maroon-700 px-6 text-sm font-semibold text-cream"
          >
            Open Library Catalog
          </Button>
          <Button
            nativeButton={false}
            render={
              <Link
                href={USANT_LIBRARY_URL}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            variant="outline"
            className="h-10 rounded-full border-maroon-700/20 px-6 text-sm font-semibold"
          >
            USANT Library portal
          </Button>
        </div>
      </SectionShell>

      <SectionShell
        id="policies"
        eyebrow="Policies"
        title="Borrowing rules and library conduct"
      >
        <p className="max-w-3xl leading-relaxed text-ink/75">
          Loan periods, fines, ID requirements, and visitor policies are posted at
          the circulation desk and on the official USANT Library website.
        </p>
      </SectionShell>

      <SectionShell
        id="hours"
        eyebrow="Schedule"
        title="Operating hours"
      >
        <p className="max-w-3xl leading-relaxed text-ink/75">
          Hours vary by branch and academic calendar. Visit the library or check
          the USANT site for the current semester schedule before you plan a visit.
        </p>
      </SectionShell>

      <SectionShell
        id="announcements"
        eyebrow="Announcements"
        title="News from the library"
      >
        <p className="max-w-3xl leading-relaxed text-ink/75">
          Orientation dates, new acquisitions, and service notices are published on
          the university library page. Staff ULMS dashboards will surface internal
          announcements as they are wired in.
        </p>
      </SectionShell>

      <SectionShell
        id="contact"
        eyebrow="Contact"
        title="Reach the University Library"
      >
        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-sm font-semibold text-maroon-700">Address</dt>
            <dd className="mt-1 text-ink/80">
              Dr. Ortega St., San Miguel, Iriga City 4431
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-maroon-700">Phone</dt>
            <dd className="mt-1">
              <a
                href="tel:+63542051234"
                className="text-ink/80 hover:text-maroon-700"
              >
                (054) 205-1234
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-maroon-700">Email</dt>
            <dd className="mt-1">
              <a
                href="mailto:info@usant.edu.ph"
                className="text-ink/80 hover:text-maroon-700"
              >
                info@usant.edu.ph
              </a>
            </dd>
          </div>
        </dl>
      </SectionShell>
    </>
  );
}