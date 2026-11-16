import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginBrand } from "@/components/auth/login-brand";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";

const heroTiles = [
  { value: "5", label: "Departments" },
  { value: "RBAC", label: "Role + dept scope" },
  { value: "Koha", label: "Source of truth" },
] as const;

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,46%)_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#571014_0%,#2e080a_60%,#1c0506_100%)] p-8 text-primary-foreground lg:flex lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffd25e 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
          aria-hidden
        />
        <div className="relative z-10">
          <LoginBrand />
        </div>

        <div className="relative z-10 my-10 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary-foreground/75">
            University Library Management System
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight lg:text-5xl">
            One workspace for{" "}
            <span className="font-display italic text-accent">five libraries.</span>
          </h1>
          <p className="max-w-md text-sm text-primary-foreground/80 lg:text-base">
            Department-aware dashboards, circulation, inventory, announcements and
            reports — powered by the Koha REST API. Koha stays the source of
            truth.
          </p>
          <div className="grid max-w-md grid-cols-3 gap-3 pt-4">
            {heroTiles.map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-[rgba(250,210,94,0.22)] bg-white/[0.07] px-2 py-3 text-center"
              >
                <div className="font-display text-2xl font-bold text-accent">
                  {tile.value}
                </div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-primary-foreground/70">
                  {tile.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-primary-foreground/60">
          ULMS workspace for the University of Saint Anthony.
        </p>
      </aside>

      <div className="flex flex-1 items-center justify-center bg-background p-6 lg:p-12">
        <div className="w-full max-w-md rounded-3xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-border">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}