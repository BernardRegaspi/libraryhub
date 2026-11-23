export const KOHA_UNAVAILABLE = "This Koha operation is not available.";

export function ViewLoading({ label = "Loading…" }: { label?: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

export function ViewEmpty({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

export function KohaUnavailableBanner() {
  return (
    <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      {KOHA_UNAVAILABLE}
    </p>
  );
}