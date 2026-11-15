"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  Clock01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { KOHA_CATALOG_URL } from "@/lib/marketing/constants";
import { Eyebrow } from "@/components/marketing/eyebrow";

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const HOURS = [
  {
    name: "Grade School Library",
    daysLabel: "Monday-Friday",
    days: [1, 2, 3, 4, 5],
    open: "07:30",
    close: "17:00",
    display: "7:30 AM - 5:00 PM",
  },
  {
    name: "Junior High School Library",
    daysLabel: "Monday-Friday",
    days: [1, 2, 3, 4, 5],
    open: "07:30",
    close: "17:00",
    display: "7:30 AM - 5:00 PM",
  },
  {
    name: "Senior High School Library",
    daysLabel: "Monday-Friday",
    days: [1, 2, 3, 4, 5],
    open: "07:30",
    close: "17:00",
    display: "7:30 AM - 5:00 PM",
  },
  {
    name: "College Library",
    daysLabel: "Monday-Saturday",
    days: [1, 2, 3, 4, 5, 6],
    open: "07:30",
    close: "17:00",
    display: "7:30 AM - 5:00 PM",
  },
  {
    name: "Graduate School Library",
    daysLabel: "Monday-Saturday",
    days: [1, 2, 3, 4, 5, 6],
    open: "08:00",
    close: "17:00",
    display: "8:00 AM - 5:00 PM",
  },
] as const;

type ManilaNow = { day: number; minutes: number };

function manilaNow(): ManilaNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number.parseInt(pick("hour"), 10);
  const minute = Number.parseInt(pick("minute"), 10);
  return {
    day: DAY_INDEX[pick("weekday")] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function formatTime(mins: number) {
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute < 10 ? "0" : ""}${minute} ${suffix}`;
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function statusFor(
  row: { days: readonly number[]; open: string; close: string },
  now: ManilaNow,
): { open: boolean; label: string } {
  const open = toMinutes(row.open);
  const close = toMinutes(row.close);
  if (row.days.includes(now.day) && now.minutes >= open && now.minutes < close) {
    return { open: true, label: `Open now, until ${formatTime(close)}` };
  }
  if (row.days.includes(now.day) && now.minutes < open) {
    return { open: false, label: `Closed, opens today ${formatTime(open)}` };
  }
  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDay = (now.day + offset) % 7;
    if (row.days.includes(nextDay)) {
      const when = offset === 1 ? "tomorrow" : DAY_NAMES[nextDay];
      return { open: false, label: `Closed, opens ${when} ${formatTime(open)}` };
    }
  }
  return { open: false, label: `Closed, opens ${formatTime(open)}` };
}

export function HoursSection() {
  const [now, setNow] = useState<ManilaNow | null>(null);

  useEffect(() => {
    const tick = () => setNow(manilaNow());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      id="hours"
      className="relative scroll-mt-28 overflow-hidden bg-maroon-950 py-20 text-cream md:py-28"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #faa61a 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />
      <div className="site-container relative grid items-start gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <div>
          <Eyebrow className="text-gold-300">Library Operating Hours</Eyebrow>
          <h2 className="font-display mt-3 text-3xl leading-tight font-bold md:text-4xl">
            When to visit us
          </h2>
          <p className="mt-4 leading-relaxed text-cream/75">
            Plan your visit across the five library sections of the University
            of Saint Anthony. Live status is computed from official schedules
            (Philippine Standard Time).
          </p>
          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-gold-400/30 bg-maroon-900/60 p-5">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="mt-0.5 shrink-0 text-gold-400"
              size={22}
            />
            <p className="text-sm leading-relaxed text-cream/80">
              Schedules may change during holidays and special university
              activities. Borrowing of books is suspended one week before final
              examinations.
            </p>
          </div>
          <a
            href={KOHA_CATALOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-bold text-maroon-950 shadow-[0_26px_60px_-22px_rgba(250,166,26,0.5)] transition-colors hover:bg-gold-300"
          >
            Verify in Library System
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
          </a>
        </div>

        <ul className="space-y-3">
          {HOURS.map((row) => {
            const status = now ? statusFor(row, now) : null;
            return (
              <li
                key={row.name}
                className="flex items-center gap-4 rounded-[1.1rem] border border-gold-400/18 bg-maroon-900/55 px-5 py-4 transition-all duration-300 ease-out hover:translate-x-1 hover:border-gold-400/50"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-maroon-950">
                  <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{row.name}</span>
                  <span className="block text-sm text-cream/65">{row.daysLabel}</span>
                </span>
                <span className="text-right">
                  <span className="font-display block text-lg text-gold-300">
                    {row.display}
                  </span>
                  <span
                    className={
                      status?.open
                        ? "mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/16 px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide text-emerald-300 uppercase before:h-1.5 before:w-1.5 before:rounded-full before:bg-current"
                        : "mt-1 inline-flex items-center gap-1.5 rounded-full bg-red-400/14 px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide text-red-300 uppercase before:h-1.5 before:w-1.5 before:rounded-full before:bg-current"
                    }
                  >
                    {status?.label ?? "Checking hours"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
