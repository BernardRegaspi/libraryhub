import type { ReactNode } from "react";

export const instant = false;

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <div className="ulms min-h-full">{children}</div>;
}