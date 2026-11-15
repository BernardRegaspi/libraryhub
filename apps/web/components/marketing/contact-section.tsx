import { HugeiconsIcon } from "@hugeicons/react";
import { CallIcon, Location01Icon, Mail01Icon } from "@hugeicons/core-free-icons";
import { USANT_HOME_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

export function ContactSection() {
  return (
    <section
      id="contact"
      className="scroll-mt-28 bg-parchment/70 py-20 md:py-28"
    >
      <div className="site-container grid items-stretch gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Eyebrow>Contact and Location</Eyebrow>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-5xl">
            Visit or reach the library
          </h2>
          <p className="mt-4 text-ink/70">
            The library welcomes students, faculty, staff, and visiting
            researchers. Reach us through the official university channels
            below.
          </p>
          <ul className="mt-9 space-y-4">
            <li className="flex items-start gap-4 rounded-[1.1rem] border border-maroon-700/10 bg-white px-5 py-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-maroon-50 text-maroon-700">
                <HugeiconsIcon icon={Location01Icon} size={18} />
              </span>
              <span>
                <span className="block font-semibold text-ink">
                  University of Saint Anthony Library
                </span>
                <span className="block text-sm text-ink/65">
                  Dr. Ortega St., San Miguel, Iriga City 4431
                </span>
              </span>
            </li>
            <li className="flex items-start gap-4 rounded-[1.1rem] border border-maroon-700/10 bg-white px-5 py-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-maroon-50 text-maroon-700">
                <HugeiconsIcon icon={CallIcon} size={18} />
              </span>
              <span>
                <span className="block font-semibold text-ink">Telephone</span>
                <a
                  href="tel:+63542051234"
                  className="block text-sm text-ink/65 transition-colors hover:text-maroon-700"
                >
                  (054) 205-1234
                </a>
              </span>
            </li>
            <li className="flex items-start gap-4 rounded-[1.1rem] border border-maroon-700/10 bg-white px-5 py-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-maroon-50 text-maroon-700">
                <HugeiconsIcon icon={Mail01Icon} size={18} />
              </span>
              <span>
                <span className="block font-semibold text-ink">Email</span>
                <a
                  href="mailto:info@usant.edu.ph"
                  className="block text-sm text-ink/65 transition-colors hover:text-maroon-700"
                >
                  info@usant.edu.ph
                </a>
              </span>
            </li>
          </ul>
          <div className="mt-9 flex flex-wrap gap-4">
            <a
              href="mailto:info@usant.edu.ph"
              className="inline-flex items-center gap-2 rounded-full bg-maroon-700 px-6 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-gold-400 hover:text-maroon-950"
            >
              Contact Us
            </a>
            <a
              href={USANT_HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-maroon-700/30 px-6 py-3.5 text-sm font-semibold text-maroon-700 transition-colors hover:border-maroon-700 hover:bg-maroon-50"
            >
              Official University Website
            </a>
          </div>
        </div>

        <div className="min-h-[360px] overflow-hidden rounded-3xl border border-maroon-900/10 shadow-[0_18px_50px_-18px_rgba(34,26,24,0.28)]">
          <iframe
            title="Map of the University of Saint Anthony, Dr. Ortega St., San Miguel, Iriga City"
            src="https://www.google.com/maps?q=University%20of%20Saint%20Anthony%2C%20Dr.%20Ortega%20St.%2C%20San%20Miguel%2C%20Iriga%20City&output=embed"
            className="h-full min-h-[360px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
