"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi } from "@/lib/api";
import { displayName, initials, statusBadges } from "@/lib/patrons/display";
import type {
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

export function PatronDetailView({
  patronId,
  canUpdate,
  canSensitive,
}: PatronDetailViewProps) {
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

  const loanCount =
    checkouts?.status === "ok" ? checkouts.items.length : null;
  const overdueCount =
    checkouts?.status === "ok"
      ? checkouts.items.filter((item) => item.overdue).length
      : null;
  const holdCount = holds?.status === "ok" ? holds.items.length : null;

  const loanSummary = checkoutsQuery.isPending
    ? "—"
    : checkouts?.status === "unavailable"
      ? "Unavailable"
      : String(loanCount ?? 0);
  const overdueSummary = checkoutsQuery.isPending
    ? "—"
    : checkouts?.status === "unavailable"
      ? "Unavailable"
      : String(overdueCount ?? 0);
  const holdSummary = holdsQuery.isPending
    ? "—"
    : holds?.status === "unavailable"
      ? "Unavailable"
      : String(holdCount ?? 0);

  const showBarcodeColumn =
    checkouts?.status === "ok" &&
    checkouts.items.some((item) => "external_id" in item && item.external_id != null);

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
          <Button type="button" variant="outline">
            Edit
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground"
            aria-hidden
          >
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {patron.category_name ? (
                <FilterBadge>{patron.category_name}</FilterBadge>
              ) : null}
              {patron.library_name ? (
                <span>{patron.library_name}</span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {badgeList.map((badge) => (
                <FilterBadge key={badge}>{badge}</FilterBadge>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6 text-center">
          <div>
            <p className="font-display text-xl font-semibold text-foreground">
              {loanSummary}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              On loan
            </p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-foreground">
              {overdueSummary}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Overdue
            </p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-foreground">
              {holdSummary}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Holds
            </p>
          </div>
        </div>
      </div>

      <SectionCard title="Personal information">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Display name">{name}</DetailField>
          <DetailField label="Card number">
            {fieldValue(patron.cardnumber)}
          </DetailField>
          <DetailField label="Userid">{fieldValue(patron.userid)}</DetailField>
          <DetailField label="Email">{fieldValue(patron.email)}</DetailField>
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

      <SectionCard title="Loans">
        {checkoutsQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : checkoutsQuery.isError ? (
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
        ) : checkouts?.status === "unavailable" ? (
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
        ) : checkouts?.status === "ok" && checkouts.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current loans.</p>
        ) : checkouts?.status === "ok" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Title</th>
                  <th className="px-2 py-2 font-semibold">Checked out</th>
                  <th className="px-2 py-2 font-semibold">Due</th>
                  <th className="px-2 py-2 font-semibold">Renewals</th>
                  {showBarcodeColumn ? (
                    <th className="px-2 py-2 font-semibold">Barcode</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {checkouts.items.map((item, index) => (
                  <tr
                    key={item.checkout_id ?? `${item.item_id}-${index}`}
                    className="border-b border-border"
                  >
                    <td className="px-2 py-2 text-foreground">
                      {loanTitleCell(item)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {fieldValue(item.checkout_date)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {fieldValue(item.due_date)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {item.renewals_count ?? "—"}
                    </td>
                    {showBarcodeColumn ? (
                      <td className="px-2 py-2 text-foreground">
                        {"external_id" in item && item.external_id != null
                          ? item.external_id
                          : "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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
    </div>
  );
}