import type { ReactNode } from "react";

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}