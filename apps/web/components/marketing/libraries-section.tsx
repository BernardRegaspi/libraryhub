import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Building03Icon,
  GraduationScrollIcon,
  Mortarboard01Icon,
  StudentIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { KOHA_LIBRARIES_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

const LIBRARIES: {
  id: string;
  title: string;
  text: string;
  art: string;
  label: string;
  icon: IconSvgElement;
}[] = [
  {
    id: "lib-university",
    title: "University / College Library",
    text: "A central collection supporting the instructional, academic, and research requirements of university students and faculty.",
    art: "from-[#4C0D10] to-maroon-700",
    label: "Illustration of the university library stacks",
    icon: Building03Icon,
  },
  {
    id: "lib-graduate",
    title: "Graduate School Library",
    text: "Specialized collections supporting graduate students, faculty, and advanced academic research.",
    art: "from-maroon-950 to-maroon-800",
    label: "Illustration of graduate study carrels",
    icon: GraduationScrollIcon,
  },
  {
    id: "lib-jhs",
    title: "Junior High School Library",
    text: "Educational resources supporting the learning and reading needs of junior high school students.",
    art: "from-maroon-800 to-[#4C0D10]",
    label: "Illustration of the junior high school library",
    icon: StudentIcon,
  },
  {
    id: "lib-shs",
    title: "Senior High School Library",
    text: "Academic and reference materials supporting Grades 11 and 12 students.",
    art: "from-[#3A0A0C] to-maroon-700",
    label: "Illustration of the senior high school library",
    icon: Mortarboard01Icon,
  },
  {
    id: "lib-grade",
    title: "Grade School Library",
    text: "Age-appropriate educational resources that encourage reading and early learning.",
    art: "from-maroon-700 to-maroon-950",
    label: "Illustration of the grade school library",
    icon: BookOpen01Icon,
  },
  {
    id: "lib-av",
    title: "Audio-Visual Room",
    text: "Media resources, equipment, and services supporting teaching and learning activities.",
    art: "from-[#240607] to-[#4C0D10]",
    label: "Illustration of the audio-visual room",
    icon: Video01Icon,
  },
];

export function LibrariesSection() {
  return (
    <section id="libraries" className="scroll-mt-28 py-20 md:py-28">
      <div className="site-container">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>Our Libraries</Eyebrow>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-5xl">
              One library system, every level of learning
            </h2>
            <p className="mt-4 text-ink/70">
              From grade school to graduate studies, each USANT library section
              curates collections matched to its learners.
            </p>
          </div>
          <a
            href={KOHA_LIBRARIES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border-[1.5px] border-maroon-700/30 px-6 py-3 text-sm font-semibold text-maroon-700 transition-colors hover:border-maroon-700 hover:bg-maroon-50"
          >
            View Library Directory
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
          </a>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {LIBRARIES.map((library) => (
            <article
              key={library.id}
              id={library.id}
              className="group scroll-mt-28 overflow-hidden rounded-[1.4rem] border border-maroon-700/10 bg-white shadow-[0_10px_40px_-12px_rgba(34,26,24,0.16)] transition-[transform,box-shadow] duration-300 hover:-translate-y-2 hover:shadow-[0_30px_70px_-24px_rgba(125,21,25,0.45)]"
            >
              <div
                role="img"
                aria-label={library.label}
                className={`flex h-[210px] items-center justify-center bg-gradient-to-br ${library.art}`}
              >
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-300">
                  <HugeiconsIcon icon={library.icon} size={32} strokeWidth={1.5} />
                </span>
              </div>
              <div className="px-6 pt-6 pb-7">
                <h3 className="font-display text-xl font-bold text-ink">
                  {library.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/70">
                  {library.text}
                </p>
                <a
                  href={KOHA_LIBRARIES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-maroon-700 uppercase transition-[color,gap] hover:gap-3 hover:text-gold-600"
                >
                  Explore Library
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
