"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ApiError, fetchApi } from "@/lib/api";
import { STAFF_NAV } from "@/lib/auth/nav";
import type { CurrentUser } from "@/lib/auth/types";

function resolvePostLoginPath(
  next: string | null,
  permissions: string[],
): string {
  if (!next) {
    return "/dashboard";
  }
  const item = STAFF_NAV.find((entry) => entry.href === next);
  if (!item || !permissions.includes(item.permission)) {
    return "/dashboard";
  }
  return next;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const me = await fetchApi<CurrentUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        headers: { "Content-Type": "application/json" },
      });
      const next = searchParams.get("next");
      const destination = resolvePostLoginPath(next, me.permissions);
      window.location.assign(destination);
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError) {
        setError(caught.detail?.message ?? caught.message);
        return;
      }
      setError("The sign-in service is unavailable.");
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Staff sign-in
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to manage your library department.
        </p>
      </div>

      <div className="space-y-4">
        <Button type="button" variant="outline" className="w-full" disabled aria-describedby="sso-unconfigured-desc">
          Continue with University SSO (OIDC)
        </Button>
        <p id="sso-unconfigured-desc" className="text-xs text-muted-foreground">
          University SSO is not configured.
        </p>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            or local account
          </span>
          <Separator className="flex-1" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username or email</Label>
          <Input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={submitting}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Sign in
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Argon2id password hashing, secure HttpOnly cookies, and rate limiting.
        Permissions are enforced by FastAPI.
      </p>
    </form>
  );
}