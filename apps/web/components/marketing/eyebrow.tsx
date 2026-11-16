import { cn } from "@/lib/utils";

export function Eyebrow({
  children,
  className,
  center = false,
}: {
  children: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 text-xs font-bold tracking-[0.28em] text-gold-600 uppercase",
        center && "justify-center",
        className,
      )}
    >
      <span className="h-0.5 w-8 shrink-0 bg-gold-400" aria-hidden />
      {children}
    </p>
  );
}
