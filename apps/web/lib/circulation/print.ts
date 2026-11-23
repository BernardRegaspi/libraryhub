import type { PrintInput } from "./types.ts";

export function buildPrintPayload(input: PrintInput): string {
  const parts: string[] = [
    `Type: ${input.type}`,
    `Confirmed: ${input.confirmedAt}`,
    `Patron: ${input.patronName}`,
    `Card: ${input.cardnumber}`,
  ];

  for (const line of input.lines) {
    if (line.outcome !== "confirmed") {
      continue;
    }
    parts.push(line.title);
    if (line.dueDate) {
      parts.push(`Due: ${line.dueDate}`);
    }
    if (line.checkoutId !== undefined) {
      parts.push(`Checkout ID: ${line.checkoutId}`);
    }
  }

  return parts.join("\n");
}