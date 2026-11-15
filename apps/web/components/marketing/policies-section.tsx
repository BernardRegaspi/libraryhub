"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, QuoteUpIcon } from "@hugeicons/core-free-icons";
import { USANT_LIBRARY_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

type Policy =
  | { id: string; title: string; kind: "list"; items: string[] }
  | { id: string; title: string; kind: "note"; body: string };

const POLICIES: Policy[] = [
  {
    id: "general",
    title: "General Library Rules",
    kind: "list",
    items: [
      "Students should be in proper uniform with I.D. when entering the library.",
      "Silence shall be maintained in the library. Failure to observe this rule shall be subject to serious disciplinary action.",
      "Stealing or willfully destroying, cutting, tearing, or in any way damaging books, pamphlets, periodicals, or any part thereof shall be subject to serious disciplinary action.",
    ],
  },
  {
    id: "identification",
    title: "Student Identification Requirements",
    kind: "list",
    items: [
      "Students should be in proper uniform with I.D. when entering the library.",
      "Students shall present their library card for Grade School, Junior High School, and Senior High Students with a picture.",
    ],
  },
  {
    id: "reference",
    title: "Use of Reference Materials",
    kind: "list",
    items: [
      "General references such as dictionaries, encyclopedias, almanacs, atlases, and instructional materials shall be read only inside the library.",
      "General reference collection, theses, dissertations, and periodicals are to be used inside the library only.",
      "Faculty members shall be the ones to borrow reference books for their use.",
    ],
  },
  {
    id: "thesis",
    title: "Thesis and Dissertation Policies",
    kind: "list",
    items: [
      "Thesis and dissertations should be read inside the library.",
      "These materials form part of the Graduate School Library's major research collection and are non-circulating.",
    ],
  },
  {
    id: "devices",
    title: "Laptop and Electronic Device Guidelines",
    kind: "note",
    body: "The official USANT Library publication does not list a separate device policy; the general rules on silence, proper conduct, and care of library materials apply to the use of laptops and electronic devices inside the library.",
  },
  {
    id: "borrowing",
    title: "Borrowing and Circulation Policies",
    kind: "list",
    items: [
      "Faculty and staff can borrow two (2) books (one Filipiniana and one circulation) for a period of one (1) week only. Students can borrow two (2) books (one Filipiniana and one circulation) for three (3) days.",
      "A week before the final examination, borrowing of books is suspended.",
      "Circulation books may be borrowed and subject to renewal depending upon the number of copies available at the time they are borrowed.",
      "Two (2) books can be loaned out for a day from the circulation, excluding holidays and Sunday. Filipiniana collection can be loaned for a day, one (1) at a time, excluding holidays and Sunday.",
      "Reserve books for overnight use may be borrowed at 4:00 P.M. and returned at 9:00 A.M. the following day. Failure to return them on time will result in a fine of Php 1.00 per hour.",
      "Fiction and circulation books may be borrowed for a period of three (3) days. Failure to return them on time will result in a fine of Php 9.00 per day.",
      "Borrowers are allowed to photocopy the selected topic or chapter of the borrowed book.",
      "Lost books must be replaced with the same author, title, and edition, binding and copyright date. If that is not possible, full payment of the same plus fine from the time the book is lost shall be made at the cashier's office.",
    ],
  },
  {
    id: "preservation",
    title: "Preservation and Conservation",
    kind: "list",
    items: [
      "The borrower shall be responsible for the loaned book. In case of loss or damage, they shall be required either to pay or replace it with the same title upon arrangement with the librarian.",
      "Stealing or willfully destroying, cutting, tearing, or in any way damaging the books, pamphlets, periodicals, or any part thereof shall be subject to serious disciplinary action.",
    ],
  },
  {
    id: "visitors",
    title: "Outside Researchers Policy",
    kind: "note",
    body: "The official USANT Library publication does not currently publish a separate outside-researchers policy. Researchers from other institutions are encouraged to coordinate directly with the library office for access arrangements.",
  },
];

export function PoliciesSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section id="policies" className="scroll-mt-28 py-20 md:py-28">
      <div className="site-container grid items-start gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:gap-20">
        <div className="lg:sticky lg:top-28">
          <Eyebrow>Rules and Regulations</Eyebrow>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-5xl">
            Library policies, clearly organized
          </h2>
          <p className="mt-4 leading-relaxed text-ink/70">
            The following policies are published by the official USANT Library.
            Expand a topic to read the current rules.
          </p>
          <div className="mt-8 rounded-2xl border border-maroon-900/10 bg-parchment p-6">
            <p className="text-sm leading-relaxed text-ink/70">
              <HugeiconsIcon
                icon={QuoteUpIcon}
                className="mr-2 inline text-gold-400"
                size={16}
              />
              Silence shall be maintained in the library. Failure to observe
              this rule shall be subject to serious disciplinary action.
            </p>
            <p className="mt-3 text-xs font-semibold tracking-widest text-maroon-700 uppercase">
              USANT Library Rules, Art. 09
            </p>
          </div>
          <a
            href={USANT_LIBRARY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-maroon-700 px-6 py-3.5 text-sm font-semibold text-cream shadow-[0_26px_60px_-22px_rgba(125,21,25,0.45)] transition-colors hover:bg-gold-400 hover:text-maroon-950"
          >
            View Complete Library Policies
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
          </a>
        </div>

        <div className="divide-y divide-maroon-900/10 border-y border-maroon-900/10">
          {POLICIES.map((policy) => {
            const open = openId === policy.id;
            const panelId = `${policy.id}-panel`;
            return (
              <div key={policy.id}>
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 py-5 pr-1 text-left text-base font-semibold text-ink transition-colors hover:text-maroon-700 aria-expanded:text-maroon-700"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenId(open ? null : policy.id)}
                  >
                    {policy.title}
                    <span
                      className={`text-lg leading-none text-gold-600 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                </h3>
                {open ? (
                  <div id={panelId} role="region" className="pr-1 pb-5">
                    {policy.kind === "list" ? (
                      <ul className="space-y-2.5">
                        {policy.items.map((item) => (
                          <li
                            key={item}
                            className="relative pl-6 text-sm leading-relaxed text-ink/75 before:absolute before:top-2 before:left-0 before:h-2 before:w-2 before:rounded-full before:bg-gold-400"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed text-ink/70">
                          {policy.body}
                        </p>
                        <p className="mt-3 text-sm text-ink/70">
                          <span className="mr-2 inline-block rounded-md bg-gold-100 px-2 py-0.5 text-[0.68rem] font-bold tracking-wider text-gold-700 uppercase">
                            Not separately published
                          </span>
                          {policy.id === "devices" ? (
                            <>
                              For current device guidelines, please inquire at
                              the library office or{" "}
                              <a
                                href="#contact"
                                className="font-semibold text-maroon-700 underline decoration-gold-400 decoration-2 underline-offset-4"
                              >
                                contact the library
                              </a>
                              .
                            </>
                          ) : (
                            <>
                              Coordinate with the library via{" "}
                              <a
                                href="#contact"
                                className="font-semibold text-maroon-700 underline decoration-gold-400 decoration-2 underline-offset-4"
                              >
                                the contact details below
                              </a>
                              .
                            </>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
