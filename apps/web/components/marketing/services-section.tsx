import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Chair01Icon,
  Image01Icon,
  LaptopIcon,
  TestTubeIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { KOHA_CATALOG_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

const SERVICES: {
  number: string;
  title: string;
  text: string;
  href: string;
  external?: boolean;
  icon: IconSvgElement;
}[] = [
  {
    number: "01",
    title: "Circulation Services",
    text: "Borrowing, returning, and managing library materials.",
    href: "#policies",
    icon: ArrowReloadHorizontalIcon,
  },
  {
    number: "02",
    title: "Reference Services",
    text: "Assistance in finding information and academic resources.",
    href: "#contact",
    icon: BookOpen01Icon,
  },
  {
    number: "03",
    title: "Research Assistance",
    text: "Support for students and faculty conducting academic research.",
    href: "#contact",
    icon: TestTubeIcon,
  },
  {
    number: "04",
    title: "Reading and Study Areas",
    text: "Spaces for individual learning and collaborative activities.",
    href: "#libraries",
    icon: Chair01Icon,
  },
  {
    number: "05",
    title: "Audio-Visual Services",
    text: "Access to educational media and audio-visual resources.",
    href: "#lib-av",
    icon: Image01Icon,
  },
  {
    number: "06",
    title: "Digital Library Access",
    text: "Access to the existing online library system and available digital materials.",
    href: KOHA_CATALOG_URL,
    external: true,
    icon: LaptopIcon,
  },
];

export function ServicesSection() {
  return (
    <section
      id="services"
      className="scroll-mt-28 bg-parchment/70 py-20 md:py-28"
    >
      <div className="site-container">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow center className="justify-center">
            Library Services
          </Eyebrow>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-5xl">
            Services that support your academic journey
          </h2>
          <p className="mt-4 text-ink/70">
            From circulation to research support, the library team assists
            students, faculty, and staff in finding and using the resources they
            need.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <article
              key={service.number}
              className="group relative overflow-hidden rounded-[1.25rem] border border-maroon-700/10 bg-white p-7 transition-[transform,box-shadow] duration-300 before:absolute before:inset-x-0 before:top-0 before:h-1 before:origin-left before:scale-x-0 before:bg-gradient-to-r before:from-gold-400 before:to-gold-300 before:transition-transform before:duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_60px_-22px_rgba(125,21,25,0.35)] hover:before:scale-x-100"
            >
              <span className="font-display absolute top-4 right-5 text-4xl font-extrabold text-maroon-700/12">
                {service.number}
              </span>
              <span className="inline-flex h-[3.2rem] w-[3.2rem] items-center justify-center rounded-2xl bg-maroon-700 text-gold-400 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-6">
                <HugeiconsIcon icon={service.icon} size={22} strokeWidth={1.75} />
              </span>
              <h3 className="font-display mt-4 text-xl font-bold text-ink">
                {service.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">
                {service.text}
              </p>
              <a
                href={service.href}
                {...(service.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="mt-4 inline-flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-maroon-700 uppercase transition-colors hover:text-gold-600"
              >
                Learn More
                <HugeiconsIcon
                  icon={service.external ? ArrowUpRight01Icon : ArrowRight01Icon}
                  size={14}
                  className="transition-transform group-hover:translate-x-1"
                />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
