export type PageItem = number | "ellipsis";

export function pageItems(current: number, count: number): PageItem[] {
  if (count <= 7) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, "ellipsis", count];
  }
  if (current >= count - 3) {
    return [1, "ellipsis", count - 3, count - 2, count - 1, count];
  }
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", count];
}