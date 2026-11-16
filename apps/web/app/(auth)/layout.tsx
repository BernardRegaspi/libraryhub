import type { ReactNode } from "react";

export const instant = false;

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <div className="ulms flex min-h-svh flex-1 flex-col">{children}</div>;
}