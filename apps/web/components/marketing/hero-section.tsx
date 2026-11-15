import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  SearchingIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  KOHA_CATALOG_URL,
  KOHA_SEARCH_URL,
  LIBRARY_BANNER_URL,
} from "@/lib/marketing/constants";

export function HeroSection() {
  return (
    <section
      id="home"
      className="relative isolate overflow-hidden bg-maroon-950 text-cream"
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <Image
          src={LIBRARY_BANNER_URL}
          alt="Interior of the University of Saint Anthony Library with bookshelves and reading spaces"
          fill
          priority
          sizes="100vw"
          className="object-cover motion-reduce:scale-100 scale-100 motion-safe:animate-[kenburns_24s_ease-in-out_infinite_alternate]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-maroon-950/95 via-maroon-950/80 to-maroon-900/40" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-maroon-950/90 to-transparent" />
      </div>

      <div className="site-container pb-28 pt-20 sm:pb-36 md:pb-52 md:pt-28 lg:pb-56 xl:pb-44">
        <div className="max-w-3xl">
          <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.28em] text-gold-300 uppercase md:text-sm">
            <span className="h-px w-10 bg-gold-400" aria-hidden />
            University of Saint Anthony
          </p>
          <h1 className="font-display mt-5 text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Discover Knowledge.
            <br />
            <span className="text-gold-300 italic">Inspire Excellence.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-cream/85 md:text-lg">
            Welcome to the University of Saint Anthony Library. Your gateway to
            knowledge, research, innovation, and lifelong learning. Explore our
            academic resources and access the information you need to succeed.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button
              nativeButton={false}
              render={<a href="#about" />}
              className="h-11 rounded-full border-transparent bg-gold-400 px-7 text-sm font-bold text-maroon-950 shadow-[0_26px_60px_-22px_rgba(125,21,25,0.45)] hover:bg-gold-300"
            >
              Explore Our Library
              <HugeiconsIcon icon={ArrowDown01Icon} size={18} />
            </Button>
            <Button
              nativeButton={false}
              render={
                <a
                  href={KOHA_CATALOG_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              variant="outline"
              className="h-11 rounded-full border-cream/40 bg-transparent px-7 text-sm font-semibold text-cream hover:border-gold-300 hover:bg-transparent hover:text-gold-300"
            >
              Access Library Catalog
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
            </Button>
          </div>

          <form
            action={KOHA_SEARCH_URL}
            method="get"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 max-w-xl"
            role="search"
          >
            <label htmlFor="catalogQuery" className="sr-only">
              Search the USANT library catalog
            </label>
            <div className="flex items-stretch rounded-full bg-cream/95 p-1.5 shadow-[0_18px_50px_-18px_rgba(34,26,24,0.28)] ring-gold-400 focus-within:ring-2">
              <span className="flex items-center pr-3 pl-4 text-maroon-700">
                <HugeiconsIcon icon={SearchingIcon} size={18} strokeWidth={1.75} />
              </span>
              <input
                id="catalogQuery"
                name="q"
                type="search"
                placeholder="Search books, journals, theses in the catalog…"
                className="w-full min-w-0 bg-transparent py-2.5 pr-2 text-sm text-ink placeholder:text-ink/50 focus:outline-none"
              />
              <Button
                type="submit"
                className="h-auto shrink-0 rounded-full border-transparent bg-maroon-700 px-5 py-2.5 text-sm font-semibold text-cream hover:bg-maroon-800"
              >
                Search Catalog
              </Button>
            </div>
            <p className="mt-2 pl-5 text-xs text-cream/60">
              Searches the official USANT Library System (Koha OPAC).
            </p>
          </form>
        </div>
      </div>

      <a
        href="#quick"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-cream/70 transition-colors hover:text-gold-300 sm:bottom-10 md:bottom-14 xl:bottom-24"
        aria-label="Scroll to quick access"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={22}
          className="motion-safe:animate-bounce"
        />
      </a>
    </section>
  );
}