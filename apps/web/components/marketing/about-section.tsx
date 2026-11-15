import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  LIBRARY_BANNER_URL,
  LIBRARY_GOALS,
  USANT_LIBRARY_URL,
} from "@/lib/marketing/constants";

export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-28 py-20 md:py-28">
      <div className="site-container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="relative">
          <div
            className="absolute -top-5 -left-5 h-28 w-28 rounded-tl-3xl border-t-4 border-l-4 border-gold-400"
            aria-hidden
          />
          <div
            className="absolute -right-5 -bottom-5 h-28 w-28 rounded-br-3xl border-r-4 border-b-4 border-maroon-700"
            aria-hidden
          />
          <Image
            src={LIBRARY_BANNER_URL}
            alt="Students and collections inside the USANT University Library"
            width={900}
            height={750}
            className="relative aspect-[4/3] max-h-[560px] w-full rounded-3xl object-cover shadow-[0_18px_50px_-18px_rgba(34,26,24,0.28)] lg:aspect-[3/4]"
          />
          <div className="absolute -bottom-8 left-6 rounded-2xl bg-maroon-700 px-6 py-4 text-cream shadow-[0_26px_60px_-22px_rgba(125,21,25,0.45)] md:left-10">
            <p className="font-display text-3xl font-bold text-gold-300">1947</p>
            <p className="text-xs tracking-wide text-cream/80 uppercase">
              Serving Anthonians since
            </p>
          </div>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.28em] text-gold-600 uppercase">
            <span className="h-0.5 w-8 bg-gold-400" aria-hidden />
            About the USANT Library
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
            A central learning hub for the Anthonian community
          </h2>
          <p className="mt-5 leading-relaxed text-ink/75">
            The USANT Library is a central learning hub that supports academic
            excellence through print and digital collections, research support,
            and welcoming study spaces. It helps the university community access
            knowledge, information, and services both on campus and online.
          </p>

          <ol className="mt-8 space-y-4">
            {LIBRARY_GOALS.map((goal, index) => (
              <li key={goal} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maroon-700 text-sm font-bold text-gold-300">
                  {index + 1}
                </span>
                <p className="pt-1 text-ink/80">{goal}</p>
              </li>
            ))}
          </ol>

          <div className="mt-9 flex flex-wrap gap-4">
            <Button
              nativeButton={false}
              render={
                <Link
                  href={USANT_LIBRARY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              className="h-10 rounded-full border-transparent bg-maroon-700 px-6 text-sm font-semibold text-cream hover:bg-maroon-800"
            >
              Learn More
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
            </Button>
            <Button
              nativeButton={false}
              render={<a href="#contact" />}
              variant="outline"
              className="h-10 rounded-full border-maroon-700/20 bg-transparent px-6 text-sm font-semibold text-ink hover:bg-maroon-50"
            >
              Mission &amp; Objectives
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}