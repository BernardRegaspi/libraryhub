import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Bookmark01Icon,
  File01Icon,
  Mortarboard01Icon,
  News01Icon,
  SearchingIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { KOHA_CATALOG_URL, KOHA_SEARCH_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

const RESOURCES: { label: string; icon: IconSvgElement }[] = [
  { label: "Online Library Catalog", icon: SearchingIcon },
  { label: "Electronic Books", icon: BookOpen01Icon },
  { label: "Academic Journals", icon: News01Icon },
  { label: "Research Publications", icon: File01Icon },
  { label: "Institutional Research", icon: Mortarboard01Icon },
  { label: "Reference Materials", icon: Bookmark01Icon },
];

export function ResourcesSection() {
  return (
    <section
      id="resources"
      className="relative scroll-mt-28 overflow-hidden bg-maroon-900 py-20 text-cream md:py-28"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #faa61a 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />
      <div className="site-container relative grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <Eyebrow className="text-gold-300">Digital Resources and Research</Eyebrow>
          <h2 className="font-display mt-3 text-3xl leading-tight font-bold md:text-5xl">
            Explore a world of knowledge
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-cream/80">
            Access library resources and discover materials that support your
            academic journey and research activities, all searchable through the
            official USANT Library System.
          </p>
          <ul className="mt-9 grid gap-3 sm:grid-cols-2">
            {RESOURCES.map((resource) => (
              <li key={resource.label}>
                <a
                  href={KOHA_SEARCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-2xl border border-gold-400/25 bg-maroon-950/35 px-4 py-4 text-sm font-semibold text-cream transition-colors hover:-translate-y-0.5 hover:border-gold-400 hover:bg-gold-400 hover:text-maroon-950"
                >
                  <HugeiconsIcon
                    icon={resource.icon}
                    size={18}
                    className="text-gold-400 transition-colors group-hover:text-maroon-950"
                  />
                  {resource.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={KOHA_CATALOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-bold text-maroon-950 transition-colors hover:bg-gold-300"
          >
            Access Library System
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
          </a>
        </div>

        <div className="rounded-3xl border border-gold-400/25 bg-maroon-950/60 p-6 shadow-[0_26px_60px_-22px_rgba(125,21,25,0.45)] md:p-8">
          <svg
            viewBox="0 0 560 380"
            className="h-auto w-full"
            role="img"
            aria-label="Illustration of a laptop showing the USANT library catalog"
          >
            <rect x="120" y="60" width="320" height="200" rx="14" fill="#240607" />
            <rect x="134" y="74" width="292" height="172" rx="8" fill="#3A0A0C" />
            <rect x="152" y="94" width="120" height="12" rx="6" fill="#FAA61A" />
            <rect x="152" y="120" width="256" height="34" rx="8" fill="#4C0D10" />
            <circle cx="172" cy="137" r="8" fill="#FFD25E" />
            <rect x="190" y="133" width="120" height="8" rx="4" fill="#F6E6E6" opacity="0.7" />
            <g fill="#4C0D10">
              <rect x="152" y="168" width="80" height="60" rx="6" />
              <rect x="240" y="168" width="80" height="60" rx="6" />
              <rect x="328" y="168" width="80" height="60" rx="6" />
            </g>
            <g fill="#FAA61A">
              <rect x="162" y="178" width="10" height="30" />
              <rect x="176" y="184" width="8" height="24" />
              <rect x="190" y="176" width="10" height="32" />
              <rect x="250" y="178" width="10" height="30" />
              <rect x="264" y="184" width="8" height="24" />
              <rect x="278" y="176" width="10" height="32" />
              <rect x="338" y="178" width="10" height="30" />
              <rect x="352" y="184" width="8" height="24" />
              <rect x="366" y="176" width="10" height="32" />
            </g>
            <rect x="80" y="260" width="400" height="14" rx="7" fill="#FFD25E" />
            <path d="M60 274 h440 l24 26 H36 z" fill="#240607" />
          </svg>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-maroon-900/70 py-3">
              <p className="font-display text-xl font-bold text-gold-300">5</p>
              <p className="text-[11px] tracking-wider text-cream/60 uppercase">
                Library Sections
              </p>
            </div>
            <div className="rounded-xl bg-maroon-900/70 py-3">
              <p className="font-display text-xl font-bold text-gold-300">24/7</p>
              <p className="text-[11px] tracking-wider text-cream/60 uppercase">
                Online Catalog
              </p>
            </div>
            <div className="rounded-xl bg-maroon-900/70 py-3">
              <p className="font-display text-xl font-bold text-gold-300">Koha</p>
              <p className="text-[11px] tracking-wider text-cream/60 uppercase">
                Library System
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
