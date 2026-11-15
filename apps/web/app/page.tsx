import type { Metadata } from "next";
import { AboutSection } from "@/components/marketing/about-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { QuickAccess } from "@/components/marketing/quick-access";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SupportingSections } from "@/components/marketing/supporting-sections";
import { TopBar } from "@/components/marketing/top-bar";

export const metadata: Metadata = {
  title: "USANT University Library | University of Saint Anthony, Iriga City",
  description:
    "Discover knowledge and access collections, services, and the USANT Library System (Koha OPAC) at the University of Saint Anthony.",
};

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col bg-cream text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:rounded-lg focus:bg-maroon-700 focus:px-4 focus:py-2 focus:text-cream"
      >
        Skip to main content
      </a>
      <TopBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        <HeroSection />
        <QuickAccess />
        <AboutSection />
        <SupportingSections />
      </main>
      <SiteFooter />
    </div>
  );
}