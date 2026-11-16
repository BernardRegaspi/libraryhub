import { HugeiconsIcon } from "@hugeicons/react";
import { QuoteUpIcon } from "@hugeicons/core-free-icons";
import { Eyebrow } from "@/components/marketing/eyebrow";

const OBJECTIVES = [
  "To select, acquire, organize and provide library materials that will enrich and support the curriculum and personal needs of the users, taking into consideration their varied interests, abilities, and learning styles.",
  "To provide library materials that will stimulate growth in factual knowledge, literary appreciation, aesthetic values, and ethical standards.",
  "To teach formally the use of books and other sources of information.",
  "To provide background information which will enable students to make intelligent judgments on their daily lives.",
  "To coordinate with the faculty and supply their needs for instructional materials.",
  "To place principle above personal opinion and reason above prejudice in the selection of materials of the highest quality in order to assure a comprehensive library collection appropriate for users.",
  "To supply essential information to the library's clientele.",
];

export function MissionSection() {
  return (
    <section id="mission" className="scroll-mt-28 py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Eyebrow center>Mission and Objectives</Eyebrow>
        <HugeiconsIcon
          icon={QuoteUpIcon}
          className="mx-auto mt-6 text-gold-400"
          size={40}
        />
        <p className="font-display mt-6 text-2xl leading-snug text-ink/90 italic md:text-[2rem]">
          The University library is an integral part of the educational program
          of the University. Its basic objective is to aid the institution in
          carrying out its program in order to provide quality education.
        </p>
        <p className="mx-auto mt-5 max-w-3xl leading-relaxed text-ink/70">
          The measure of its excellence is the extent to which its resources
          and services support the institution&apos;s objective by acquiring and
          making available books, periodicals, and services needed in the
          institutional program.
        </p>
        <div
          className="mx-auto mt-8 h-[3px] w-24 rounded-sm bg-gradient-to-r from-gold-400 to-gold-300"
          aria-hidden
        />
      </div>

      <div className="mx-auto mt-14 max-w-5xl px-4 sm:px-6 lg:px-8">
        <h3 className="font-display text-center text-xl font-bold text-maroon-800">
          Adopted Objectives
        </h3>
        <ol className="mt-8 grid gap-x-12 gap-y-6 md:grid-cols-2">
          {OBJECTIVES.map((objective, index) => (
            <li
              key={objective}
              className={`relative border-t border-maroon-700/12 pt-5 pl-12 text-sm leading-relaxed text-ink/80 ${
                index === OBJECTIVES.length - 1 ? "md:col-span-2" : ""
              }`}
            >
              <span className="font-display absolute top-4 left-0 text-xl font-bold text-gold-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              {objective}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
