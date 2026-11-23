type OutcomeLine = { outcome?: string };

function collectOutcomes(result: unknown): string[] {
  if (!result || typeof result !== "object") {
    return [];
  }
  const record = result as Record<string, unknown>;
  const outcomes: string[] = [];
  if (Array.isArray(record.items)) {
    for (const line of record.items) {
      if (line && typeof line === "object" && typeof (line as OutcomeLine).outcome === "string") {
        outcomes.push((line as OutcomeLine).outcome!);
      }
    }
  }
  if (typeof record.outcome === "string") {
    outcomes.push(record.outcome);
  }
  return outcomes;
}

export function playTone(result: unknown, muted: boolean): void {
  if (muted || typeof window === "undefined") {
    return;
  }
  const outcomes = collectOutcomes(result);
  if (outcomes.length === 0) {
    return;
  }
  const hasConfirmed = outcomes.includes("confirmed");
  const hasNegative = outcomes.some(
    (code) =>
      code === "refused" ||
      code === "unknown" ||
      code === "confirmation_required",
  );
  if (!hasConfirmed && !hasNegative) {
    return;
  }
  const success = hasConfirmed && !hasNegative;
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = success ? 880 : 280;
    gain.gain.value = 0.08;
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
    void ctx.close();
  } catch {
    /* audio optional */
  }
}