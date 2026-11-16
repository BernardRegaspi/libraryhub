import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { ApiError } from "@/lib/api";

import type { CurrentUser } from "./types";

function apiOrigin(): string {
  return process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}/api/v1/auth/me`, {
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("The sign-in service is unavailable.");
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    let detail: ApiError["detail"];
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body.detail !== undefined && typeof body.detail === "object") {
        detail = body.detail as ApiError["detail"];
      }
    } catch {
      detail = undefined;
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as CurrentUser;
});

export type GatePageResult =
  | { denied: true; roleName: string }
  | { denied: false; me: CurrentUser };

export async function gatePage(permission: string): Promise<GatePageResult> {
  const me = await getCurrentUser();
  if (!me) {
    redirect("/login");
  }

  if (!me.permissions.includes(permission)) {
    const roleName = me.assignments.map((assignment) => assignment.role.name).join(", ");
    return { denied: true, roleName };
  }

  return { denied: false, me };
}