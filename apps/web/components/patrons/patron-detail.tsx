"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  EyeIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi } from "@/lib/api";
import {
  displayName,
  formatPatronDate,
  formatPeso,
  initials,
  maskEmail,
  standingBadge,
  statusBadges,
} from "@/lib/patrons/display";
import { PatronFormDialog } from "@/components/patrons/patron-form-dialog";
import type {
  PatronAccountResponse,
  PatronCheckoutItem,
  PatronCheckoutsResponse,
  PatronDetail,
  PatronHoldItem,
  PatronHoldsResponse,
} from "@/lib/patrons/types";

export type PatronDetailViewProps = {
  patronId: string;
  canUpdate: boolean;
  canSensitive: boolean;
  canCirculate: boolean;
};

function FilterBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function fieldValue(value: string | null | undefined): string {
  if (value == null || value.trim() === "") {
    return "—";
  }
  return value;
}

function loanTitleCell(item: PatronCheckoutItem): React.ReactNode {
  if (item.title) {
    return item.title;
  }
  const id = item.item_id;
  if (id != null) {
    return (
      <span>
        Title unavailable <span className="text-muted-foreground">{id}</span>
      </span>
    );
  }
  return "Title unavailable";
}

function holdTitleCell(item: PatronHoldItem): React.ReactNode {
  if (item.title) {
    return item.title;
  }
  const id = item.biblio_id;
  if (id != null) {
    return (
      <span>
        Title unavailable <span className="text-muted-foreground">{id}</span>
      </span>
    );
  }
  return "Title unavailable";
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-4 text-base font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function PatronDetailSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 px-4 pb-8 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function hasSensitiveKey(
  patron: PatronDetail,
  key: keyof PatronDetail,
): boolean {
  return Object.prototype.hasOwnProperty.call(patron, key);
}

function CurrentLoans({
  checkoutsQuery,
  checkouts,
}: {
  checkoutsQuery: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
  checkouts: PatronCheckoutsResponse | undefined;
}) {
  if (checkoutsQuery.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (checkoutsQuery.isError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">
          {checkoutsQuery.error instanceof Error
            ? checkoutsQuery.error.message
            : "Patron records are unavailable. Try again."}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void checkoutsQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (checkouts?.status === "unavailable") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">Unavailable</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void checkoutsQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (checkouts?.status === "ok" && checkouts.items.length === 0) {
    return <p className="text-sm text-muted-foreground">No current loans.</p>;
  }
  if (checkouts?.status !== "ok") {
    return null;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-sm">
        <thead>
          <tr className="bg-parchment text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            <th className="px-3 py-2 font-semibold">Item</th>
            <th className="px-3 py-2 text-right font-semibold">Due</th>
          </tr>
        </thead>
        <tbody>
          {checkouts.items.map((item, index) => (
            <tr
              key={item.checkout_id ?? `${item.item_id}-${index}`}
              className="border-b border-border last:border-0"
            >
              <td className="px-3 py-3 text-foreground">
                <span className="block font-medium">{loanTitleCell(item)}</span>
                {"external_id" in item && item.external_id ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.external_id}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-right text-foreground">
                {formatPatronDate(item.due_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STANDING_CLASS = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  overdue: "border-amber-200 bg-amber-50 text-amber-800",
  blocked: "border-red-200 bg-red-50 text-red-800",
} as const;

export function PatronDetailView({
  patronId,
  canUpdate,
  canSensitive,
  canCirculate,
}: PatronDetailViewProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [accessLogged, setAccessLogged] = useState(false);
  const patronQuery = useQuery({
    queryKey: ["patrons", patronId],
    queryFn: () => fetchApi<PatronDetail>(`/patrons/${patronId}`),
  });

  const checkoutsQuery = useQuery({
    queryKey: ["patrons", patronId, "checkouts"],
    queryFn: () =>
      fetchApi<PatronCheckoutsResponse>(`/patrons/${patronId}/checkouts`),
    enabled: patronQuery.isSuccess,
  });

  const holdsQuery = useQuery({
    queryKey: ["patrons", patronId, "holds"],
    queryFn: () => fetchApi<PatronHoldsResponse>(`/patrons/${patronId}/holds`),
    enabled: patronQuery.isSuccess,
  });

  const accountQuery = useQuery({
    queryKey: ["patrons", patronId, "account"],
    queryFn: () =>
      fetchApi<PatronAccountResponse>(`/patrons/${patronId}/account`),
    enabled: patronQuery.isSuccess,
  });

  if (patronQuery.isPending) {
    return <PatronDetailSkeleton />;
  }

  if (patronQuery.isError) {
    const error = patronQuery.error;
    const message =
      error instanceof ApiError
        ? (error.detail?.message ?? error.message)
        : error instanceof Error
          ? error.message
          : "Patron records are unavailable. Try again.";
    return (
      <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Button
          variant="link"
          className="h-auto w-fit p-0 text-sm"
          nativeButton={false}
          render={<Link href="/patrons" />}
        >
          Back to patrons
        </Button>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-foreground">{message}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void patronQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const patron = patronQuery.data;
  const name = displayName(patron);
  const badgeList = statusBadges(patron);

  const checkouts = checkoutsQuery.data;
  const holds = holdsQuery.data;
  const overdueCount =
    patron.overdues_count ??
    (checkouts?.status === "ok"
      ? checkouts.items.filter((item) => item.overdue).length
      : null);
  const standing = standingBadge({
    expired: patron.expired,
    restricted: patron.restricted,
    overdues_count: overdueCount,
  });
  const account = accountQuery.data;
  const balanceText = accountQuery.isPending
    ? "…"
    : account?.status === "ok" && typeof account.balance === "number"
      ? formatPeso(account.balance)
      : "Unavailable";
  const balanceDue =
    account?.status === "ok" &&
    typeof account.balance === "number" &&
    account.balance > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="link"
          className="h-auto w-fit p-0 text-sm"
          nativeButton={false}
          render={<Link href="/patrons" />}
        >
          Back to patrons
        </Button>
        {canUpdate ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(34,26,24,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-maroon-700 font-display text-xl font-bold text-gold-300"
              aria-hidden
            >
              {initials(name)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {name}
              </h1>
              <p className="text-xs text-muted-foreground">
                {patron.category_name ?? patron.category_id ?? "Category unavailable"}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STANDING_CLASS[standing.tone]}`}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {standing.label}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Card number
            </dt>
            <dd className="mt-1 font-mono text-xs text-foreground">
              {fieldValue(patron.cardnumber)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Home library
            </dt>
            <dd className="mt-1 text-foreground">
              {patron.library_name ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Email (masked)
            </dt>
            <dd className="mt-1 text-foreground">{maskEmail(patron.email)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Outstanding fines
            </dt>
            <dd
              className={`mt-1 ${balanceDue ? "font-semibold text-red-700" : "text-foreground"}`}
            >
              {balanceText}
            </dd>
          </div>
        </dl>

        <h2 className="mt-6 mb-2 text-sm font-semibold text-foreground">
          Current loans
        </h2>
        <CurrentLoans checkoutsQuery={checkoutsQuery} checkouts={checkouts} />

        <div className="mt-5 flex flex-wrap gap-2">
          {canCirculate ? (
            <Button
              className="h-9 rounded-lg px-3.5 text-sm"
              nativeButton={false}
              render={<Link href="/circulation" />}
            >
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={2} />
              Go to circulation
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg px-3.5 text-sm"
            onClick={() => {
              void patronQuery.refetch().then((result) => {
                if (!result.isError) {
                  setAccessLogged(true);
                }
              });
            }}
          >
            <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />
            Log access
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {accessLogged
            ? "Access to this record has been logged."
            : "Viewing patron records is recorded in the audit log."}
        </p>
      </div>

      <SectionCard title="Personal information">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Display name">{name}</DetailField>
          <DetailField label="Card number">
            {fieldValue(patron.cardnumber)}
          </DetailField>
          <DetailField label="Userid">{fieldValue(patron.userid)}</DetailField>
          <DetailField label="Email (masked)">
            {maskEmail(patron.email)}
          </DetailField>
          <DetailField label="Phone">{fieldValue(patron.phone)}</DetailField>
          <DetailField label="Mobile">{fieldValue(patron.mobile)}</DetailField>
          {canSensitive && hasSensitiveKey(patron, "date_of_birth") ? (
            <DetailField label="Date of birth">
              {fieldValue(patron.date_of_birth)}
            </DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "address") ? (
            <DetailField label="Address">
              {fieldValue(patron.address)}
            </DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "address2") ? (
            <DetailField label="Address 2">
              {fieldValue(patron.address2)}
            </DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "city") ? (
            <DetailField label="City">{fieldValue(patron.city)}</DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "state") ? (
            <DetailField label="State">{fieldValue(patron.state)}</DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "postal_code") ? (
            <DetailField label="Postal code">
              {fieldValue(patron.postal_code)}
            </DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "country") ? (
            <DetailField label="Country">
              {fieldValue(patron.country)}
            </DetailField>
          ) : null}
          {canSensitive && hasSensitiveKey(patron, "staff_notes") ? (
            <DetailField label="Staff notes">
              <span className="whitespace-pre-wrap">
                {fieldValue(patron.staff_notes)}
              </span>
            </DetailField>
          ) : null}
        </dl>
      </SectionCard>

      <SectionCard title="Library account">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Category">
            {patron.category_name ?? fieldValue(patron.category_id)}
          </DetailField>
          <DetailField label="Library">
            {patron.library_name ?? fieldValue(patron.library_id)}
          </DetailField>
          <DetailField label="Enrolment date">
            {fieldValue(patron.date_enrolled)}
          </DetailField>
          <DetailField label="Expiry date">
            {fieldValue(patron.expiry_date)}
          </DetailField>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </dt>
            <dd className="flex flex-wrap gap-1">
              {badgeList.map((badge) => (
                <FilterBadge key={badge}>{badge}</FilterBadge>
              ))}
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Holds">
        {holdsQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : holdsQuery.isError ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">
              {holdsQuery.error instanceof Error
                ? holdsQuery.error.message
                : "Patron records are unavailable. Try again."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void holdsQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : holds?.status === "unavailable" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">Unavailable</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void holdsQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : holds?.status === "ok" && holds.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current holds.</p>
        ) : holds?.status === "ok" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Title</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Held</th>
                  <th className="px-2 py-2 font-semibold">Waiting</th>
                  <th className="px-2 py-2 font-semibold">Expires</th>
                  <th className="px-2 py-2 font-semibold">Pickup library</th>
                </tr>
              </thead>
              <tbody>
                {holds.items.map((item, index) => (
                  <tr
                    key={item.hold_id ?? `${item.biblio_id}-${index}`}
                    className="border-b border-border"
                  >
                    <td className="px-2 py-2 text-foreground">
                      {holdTitleCell(item)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {fieldValue(item.status)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {fieldValue(item.hold_date)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {fieldValue(item.waiting_date)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {fieldValue(item.expiration_date)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {item.pickup_library_name ??
                        fieldValue(item.pickup_library_id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      {canUpdate ? (
        <PatronFormDialog
          mode="edit"
          patronId={patron.patron_id}
          initial={patron}
          canSensitive={canSensitive}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
    </div>
  );
}