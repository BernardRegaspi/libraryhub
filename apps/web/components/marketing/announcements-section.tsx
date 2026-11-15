"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";
import { LIBRARY_FACEBOOK_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

const ANNOUNCEMENTS = [
  {
    tag: "New Acquisitions",
    date: "November 3, 2026",
    title: "New Book Acquisitions Display, 2nd Semester, SY 2026-2027",
    text: "Newly processed titles are now on display at the circulation desk and encoded in the USANT Library System for online searching.",
    href: LIBRARY_FACEBOOK_URL,
    external: true,
    art: "from-maroon-700 to-[#4C0D10]",
  },
  {
    tag: "Research Workshop",
    date: "October 21, 2026",
    title: "Hands-on Orientation: Navigating the USANT Library System",
    text: "A guided workshop on catalog searching, account login, and locating theses and periodicals for student researchers.",
    href: LIBRARY_FACEBOOK_URL,
    external: true,
    art: "from-maroon-800 to-maroon-950",
  },
  {
    tag: "Important Notice",
    date: "October 6, 2026",
    title: "Reminder: Borrowing Suspension Before Final Examinations",
    text: "Per library policy, borrowing of books is suspended one week before final examinations. Reading areas remain open during regular hours.",
    href: "#policies",
    external: false,
    art: "from-[#661114] to-[#2E080A]",
  },
  {
    tag: "Schedule Update",
    date: "September 15, 2026",
    title: "Library Hours During University-Wide Events",
    text: "Operating hours may be adjusted during holidays and special university activities. Watch this space for the updated schedule.",
    href: "#hours",
    external: false,
    art: "from-[#4C0D10] to-maroon-700",
  },
] as const;

export function AnnouncementsSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  function pageCount() {
    const track = trackRef.current;
    if (!track) return ANNOUNCEMENTS.length;
    const card = track.querySelector("article");
    if (!card) return ANNOUNCEMENTS.length;
    const gap = 20;
    const step = card.getBoundingClientRect().width + gap;
    const visible = Math.max(1, Math.round(track.clientWidth / step));
    return Math.max(1, ANNOUNCEMENTS.length - visible + 1);
  }

  function scrollToPage(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    const gap = 20;
    const step = card ? card.getBoundingClientRect().width + gap : 400;
    const max = pageCount() - 1;
    const next = Math.min(Math.max(index, 0), max);
    track.scrollTo({ left: next * step, behavior: "smooth" });
    setPage(next);
  }

  function syncPage() {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    const gap = 20;
    const step = card ? card.getBoundingClientRect().width + gap : 400;
    const max = pageCount() - 1;
    setPage(Math.min(max, Math.round(track.scrollLeft / step)));
  }

  const atStart = page <= 0;
  const atEnd = page >= pageCount() - 1;

  return (
    <section
      id="announcements"
      className="scroll-mt-28 bg-parchment/70 py-20 md:py-28"
    >
      <div className="site-container">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>Announcements and Updates</Eyebrow>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-5xl">
              Latest from the library
            </h2>
            <p className="mt-4 text-ink/70">
              New acquisitions, activities, research workshops, schedule
              changes, and important notices.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-maroon-700/25 text-maroon-700 transition-colors hover:border-maroon-700 hover:bg-maroon-700 hover:text-gold-400 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Previous announcements"
              disabled={atStart}
              onClick={() => scrollToPage(page - 1)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
            </button>
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-maroon-700/25 text-maroon-700 transition-colors hover:border-maroon-700 hover:bg-maroon-700 hover:text-gold-400 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Next announcements"
              disabled={atEnd}
              onClick={() => scrollToPage(page + 1)}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          onScroll={syncPage}
          className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ANNOUNCEMENTS.map((item) => (
            <article
              key={item.title}
              className="flex w-[85vw] max-w-[26rem] shrink-0 snap-start flex-col overflow-hidden rounded-[1.4rem] border border-maroon-700/10 bg-white shadow-[0_10px_40px_-12px_rgba(34,26,24,0.16)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_60px_-22px_rgba(125,21,25,0.35)] md:w-96 lg:w-[calc((100%-2.5rem)/3)]"
            >
              <div className={`relative h-[180px] bg-gradient-to-br ${item.art}`}>
                <span className="absolute top-4 left-4 rounded-full bg-maroon-950/85 px-3 py-1 text-[0.68rem] font-bold tracking-[0.1em] text-gold-300 uppercase">
                  {item.tag}
                </span>
              </div>
              <div className="flex flex-1 flex-col px-6 pt-5 pb-6">
                <p className="flex flex-wrap items-center text-xs font-semibold tracking-wider text-ink/55 uppercase">
                  <HugeiconsIcon
                    icon={Calendar03Icon}
                    className="mr-2"
                    size={14}
                  />
                  {item.date}
                  <span className="ml-2 rounded bg-maroon-100 px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-maroon-800">
                    Sample
                  </span>
                </p>
                <h3 className="font-display mt-3 text-lg leading-snug font-bold text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink/70">
                  {item.text}
                </p>
                <a
                  href={item.href}
                  {...(item.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-maroon-700 uppercase transition-colors hover:text-gold-600"
                >
                  Read More
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2" aria-label="Announcement pages">
            {Array.from({ length: ANNOUNCEMENTS.length }, (_, index) => (
              <button
                key={ANNOUNCEMENTS[index].title}
                type="button"
                aria-label={`Go to announcement ${index + 1}`}
                aria-current={index === page ? "true" : undefined}
                onClick={() => scrollToPage(index)}
                className={
                  index === page
                    ? "h-2.5 w-6 rounded-full bg-gold-400"
                    : "h-2.5 w-2.5 rounded-full bg-maroon-700/25"
                }
              />
            ))}
          </div>
          <p className="text-xs text-ink/50 italic">
            Sample entries shown for layout. Replace with official library
            announcements.
          </p>
        </div>
      </div>
    </section>
  );
}
