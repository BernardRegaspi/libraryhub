import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  Clock01Icon,
  Contact01Icon,
  HandshakeIcon,
  LaptopIcon,
  Legal01Icon,
  SearchingIcon,
} from "@hugeicons/core-free-icons";
import { QUICK_ACCESS_TILES } from "@/lib/marketing/constants";

const ICONS = {
  search: SearchingIcon,
  laptop: LaptopIcon,
  handshake: HandshakeIcon,
  legal: Legal01Icon,
  clock: Clock01Icon,
  contact: Contact01Icon,
} as const;

function QuickAccessTile(tile: (typeof QUICK_ACCESS_TILES)[number]) {
  const { title, description, href, external, icon } = tile;
  const Icon = ICONS[icon];
  const className =
    "group flex gap-4 rounded-2xl border border-maroon-700/10 bg-white p-5 shadow-[0_18px_50px_-18px_rgba(34,26,24,0.28)] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-gold-400/65 hover:shadow-[0_26px_60px_-22px_rgba(125,21,25,0.45)]";

  const inner = (
    <>
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-maroon-50 text-maroon-700 transition-colors group-hover:bg-maroon-700 group-hover:text-gold-400">
        <HugeiconsIcon icon={Icon} size={22} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 font-bold text-ink">
          {title}
          {external ? (
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              size={12}
              className="opacity-60"
            />
          ) : null}
        </span>
        <span className="mt-1 text-sm leading-relaxed text-ink/65">
          {description}
        </span>
      </span>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

export function QuickAccess() {
  return (
    <section
      id="quick"
      aria-label="Quick access"
      className="scroll-mt-28 bg-cream pt-8 pb-6 md:pt-12"
    >
      <div className="site-container">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-5">
          {QUICK_ACCESS_TILES.map((tile) => (
            <QuickAccessTile key={tile.title} {...tile} />
          ))}
        </div>
      </div>
    </section>
  );
}