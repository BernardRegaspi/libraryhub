type PatronNameInput = {
  preferred_name?: string | null;
  firstname?: string | null;
  surname?: string | null;
  cardnumber?: string | null;
  patron_id: number;
};

type PatronStatusInput = {
  expired: number;
  restricted: number;
  patron_card_lost: number;
};

function nonBlank(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function displayName(patron: PatronNameInput): string {
  const preferred = nonBlank(patron.preferred_name);
  if (preferred) {
    return preferred;
  }
  const parts = [nonBlank(patron.firstname), nonBlank(patron.surname)].filter(
    (part): part is string => part !== null,
  );
  if (parts.length > 0) {
    return parts.join(" ");
  }
  const card = nonBlank(patron.cardnumber);
  if (card) {
    return card;
  }
  return `Patron ${patron.patron_id}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  const word = words[0] ?? "";
  if (word.length >= 2) {
    return word.slice(0, 2).toUpperCase();
  }
  return word.slice(0, 1).toUpperCase();
}

export function maskEmail(email: string | null | undefined): string {
  const value = nonBlank(email);
  if (!value) {
    return "—";
  }
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) {
    return value;
  }
  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split(".");
  if (labels.length < 2) {
    return `${local}@••••`;
  }
  return `${local}@••••.${labels.slice(1).join(".")}`;
}

export function formatPatronDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return value;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type StandingTone = "good" | "overdue" | "blocked";

export function standingBadge(patron: {
  expired: number | boolean;
  restricted: number | boolean;
  overdues_count: number | null;
}): { label: string; tone: StandingTone } {
  if (patron.expired || patron.restricted) {
    return { label: "Blocked", tone: "blocked" };
  }
  if (patron.overdues_count != null && patron.overdues_count > 0) {
    return { label: "Has overdue items", tone: "overdue" };
  }
  return { label: "Good standing", tone: "good" };
}

export function statusBadges(patron: PatronStatusInput): string[] {
  const badges: string[] = [];
  if (patron.expired) {
    badges.push("Expired");
  }
  if (patron.restricted) {
    badges.push("Restricted");
  }
  if (patron.patron_card_lost) {
    badges.push("Card lost");
  }
  if (badges.length === 0) {
    return ["Active"];
  }
  return badges;
}

export function isOverdueDate(
  dueDate: string | null,
  checkinDate: string | null,
  today: Date,
): boolean {
  if (!dueDate || checkinDate) {
    return false;
  }
  const todayLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  const due = dueDate.slice(0, 10);
  return due < todayLabel;
}