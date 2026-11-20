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