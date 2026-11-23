"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { parseCirculationTab } from "@/lib/circulation/search-params";
import type { CirculationTab, DeskItem, DeskPatron } from "@/lib/circulation/types";

import { CheckinPanel } from "./checkin-panel";
import { CheckoutPanel } from "./checkout-panel";
import { HistoryPanel } from "./history-panel";
import { LoansPanel } from "./loans-panel";
import { RenewPanel } from "./renew-panel";

const MUTE_KEY = "circulation-mute";

const TABS: CirculationTab[] = ["checkout", "checkin", "renew", "loans", "history"];

const TAB_LABELS: Record<CirculationTab, string> = {
  checkout: "Checkout",
  checkin: "Check-in",
  renew: "Renew",
  loans: "Current loans",
  history: "History",
};

type CirculationDeskProps = {
  permissions: string[];
};

export function CirculationDesk({ permissions }: CirculationDeskProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = parseCirculationTab(searchParams);
  const [checkoutPatron, setCheckoutPatron] = useState<DeskPatron | null>(null);
  const [checkoutItems, setCheckoutItems] = useState<DeskItem[]>([]);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    try {
      setMuted(sessionStorage.getItem(MUTE_KEY) === "true");
    } catch {
      setMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      sessionStorage.setItem(MUTE_KEY, next ? "true" : "false");
      return next;
    });
  }, []);

  const setTab = useCallback(
    (next: CirculationTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
  <>
    <ModuleFrame
      eyebrow="Library"
      title="Circulation desk"
      description="Koha confirms every checkout, check-in, and renewal."
      hideModuleSentence
    />
    <div className="space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-2" aria-label="Circulation tabs">
          {TABS.map((name) => (
            <Button
              key={name}
              type="button"
              variant={name === tab ? "default" : "outline"}
              onClick={() => setTab(name)}
            >
              {TAB_LABELS[name]}
            </Button>
          ))}
        </nav>
        <Button type="button" variant="outline" onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
        </Button>
      </div>
      {tab === "checkout" ? (
        <CheckoutPanel
          permissions={permissions}
          patron={checkoutPatron}
          items={checkoutItems}
          onPatronChange={setCheckoutPatron}
          onItemsChange={setCheckoutItems}
        />
      ) : null}
      {tab === "checkin" ? <CheckinPanel permissions={permissions} /> : null}
      {tab === "renew" ? <RenewPanel permissions={permissions} /> : null}
      {tab === "loans" ? <LoansPanel permissions={permissions} /> : null}
      {tab === "history" ? <HistoryPanel permissions={permissions} /> : null}
    </div>
  </>
  );
}