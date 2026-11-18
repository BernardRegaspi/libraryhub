function titleLetter(title: string | null): string | null {
  if (title == null) {
    return null;
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const ch = trimmed.charAt(0).toUpperCase();
  if (ch >= "A" && ch <= "Z") {
    return ch;
  }
  return null;
}

export function titleGroups<T extends { title: string | null }>(
  hits: T[],
  sort: string,
): { letter: string | null; hits: T[] }[] {
  if (sort !== "title") {
    return [{ letter: null, hits }];
  }

  const groups: { letter: string | null; hits: T[] }[] = [];
  let currentLetter: string | null | undefined;
  let currentHits: T[] = [];

  for (const hit of hits) {
    const letter = titleLetter(hit.title);
    if (currentLetter === undefined || letter !== currentLetter) {
      if (currentHits.length > 0) {
        groups.push({ letter: currentLetter!, hits: currentHits });
      }
      currentLetter = letter;
      currentHits = [hit];
    } else {
      currentHits.push(hit);
    }
  }

  if (currentHits.length > 0) {
    groups.push({ letter: currentLetter!, hits: currentHits });
  }

  return groups;
}