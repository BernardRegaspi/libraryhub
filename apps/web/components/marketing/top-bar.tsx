import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CallIcon,
  Location01Icon,
  Mail01Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { USANT_HOME_URL } from "@/lib/marketing/constants";

export function TopBar() {
  return (
    <div className="bg-maroon-950 text-cream/90 text-[13px]">
      <div className="site-container flex h-10 items-center justify-between gap-4">
        <p className="flex min-w-0 items-center gap-2 truncate font-semibold tracking-wide">
          <HugeiconsIcon
            icon={SecurityCheckIcon}
            className="shrink-0 text-gold-400"
            size={16}
            strokeWidth={1.75}
          />
          University of Saint Anthony
        </p>
        <div className="hidden items-center gap-6 md:flex">
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Location01Icon}
              className="text-gold-400"
              size={16}
              strokeWidth={1.75}
            />
            Dr. Ortega St., San Miguel, Iriga City 4431
          </span>
          <a
            href="tel:+63542051234"
            className="flex items-center gap-2 transition-colors hover:text-gold-300"
          >
            <HugeiconsIcon
              icon={CallIcon}
              className="text-gold-400"
              size={16}
              strokeWidth={1.75}
            />
            (054) 205-1234
          </a>
          <a
            href="mailto:info@usant.edu.ph"
            className="flex items-center gap-2 transition-colors hover:text-gold-300"
          >
            <HugeiconsIcon
              icon={Mail01Icon}
              className="text-gold-400"
              size={16}
              strokeWidth={1.75}
            />
            info@usant.edu.ph
          </a>
        </div>
        <Link
          href={USANT_HOME_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 transition-colors hover:text-gold-300 md:hidden"
        >
          usant.edu.ph
        </Link>
      </div>
    </div>
  );
}