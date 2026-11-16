import type { ReactNode } from "react";

type AppShellProps = {
  title: string;
  children: ReactNode;
};

export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b px-6 py-4">
        <p className="text-sm font-medium text-muted-foreground">libraryhub</p>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}