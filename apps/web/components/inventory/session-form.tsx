"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchApi } from "@/lib/api";
import type { InventorySession } from "@/lib/inventory/types";

type InventoryLibrariesResponse = {
  libraries: { id: string; name: string }[];
};

const INVENTORY_DESCRIPTION =
  "Plan, scan, and review shelf checks against Koha item records. Item status changes stay in Koha.";

const LOCATION_HINT =
  "Leave blank for the whole library. The code must match Koha exactly.";

export function SessionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [homeLibraryId, setHomeLibraryId] = useState("");
  const [location, setLocation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const librariesQuery = useQuery({
    queryKey: ["inventory", "libraries"],
    queryFn: () =>
      fetchApi<InventoryLibrariesResponse>("/inventory/libraries"),
  });

  const libraries = librariesQuery.data?.libraries ?? [];

  const submitDisabled =
    submitting ||
    librariesQuery.isPending ||
    librariesQuery.isError ||
    !homeLibraryId ||
    !name.trim();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled) {
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    const trimmedLocation = location.trim();
    const body = {
      name: name.trim(),
      home_library_id: homeLibraryId,
      location: trimmedLocation.length > 0 ? trimmedLocation : null,
    };

    try {
      const created = await fetchApi<InventorySession>("/inventory/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.push(`/inventory/${created.id}`);
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError) {
        setSubmitError(caught.detail?.message ?? caught.message);
        return;
      }
      setSubmitError("Inventory sessions are unavailable. Try again.");
    }
  }

  return (
    <>
      <ModuleFrame
        eyebrow="Library"
        title="Inventory & Stocktaking"
        description={INVENTORY_DESCRIPTION}
        hideModuleSentence
      />

      <div className="flex w-full min-w-0 justify-center px-4 pb-8 sm:px-6 lg:px-8">
        <form
          className="flex w-full min-w-0 max-w-lg flex-col gap-6"
          onSubmit={onSubmit}
          noValidate
        >
          {librariesQuery.isError ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4">
              <p className="text-sm text-foreground">
                {librariesQuery.error instanceof Error
                  ? librariesQuery.error.message
                  : "Koha could not load libraries. Try again."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 self-start"
                onClick={() => {
                  void librariesQuery.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4">
            <div className="space-y-2">
              <Label htmlFor="session-name">Name</Label>
              <Input
                id="session-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={submitting}
                className="min-h-11 h-11 text-sm"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-library">Library</Label>
              {librariesQuery.isPending ? (
                <Skeleton className="h-11 w-full" />
              ) : (
                <Select
                  value={homeLibraryId}
                  onValueChange={(value) => {
                    if (value == null) {
                      return;
                    }
                    setHomeLibraryId(value);
                  }}
                  disabled={librariesQuery.isError || submitting}
                >
                  <SelectTrigger
                    id="session-library"
                    className="min-h-11 h-11 w-full text-sm"
                  >
                    <SelectValue placeholder="Select a library" />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {libraries.map((library) => (
                      <SelectItem key={library.id} value={library.id}>
                        {library.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-location">Shelving location code</Label>
              <Input
                id="session-location"
                name="location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                disabled={submitting || librariesQuery.isError}
                className="min-h-11 h-11 text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{LOCATION_HINT}</p>
            </div>
          </div>

          {submitError ? (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              disabled={submitDisabled}
            >
              Create session
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              nativeButton={false}
              render={<Link href="/inventory" />}
            >
              Back to sessions
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}