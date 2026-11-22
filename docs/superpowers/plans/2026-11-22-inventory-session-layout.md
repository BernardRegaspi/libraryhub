# Inventory session layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the inventory session page use the approved prototype composition and the shared Patron KPI card, without changing inventory rules.

**Architecture:** Pure layout helpers decide the progress sentence, the scan count, the stepper marks, and the seven KPI definitions. `KpiCard` moves to a shared component. The session page splits into a card, a stepper, a progress bar, a KPI row, a scans panel, an exception panel, and a sidebar. `SessionView` keeps the queries, the scan queue, and the session actions.

**Tech Stack:** Next.js 16, React, TanStack Query, shadcn `Card` and `Button`, Hugeicons, `node --test`, `npm run typecheck`.

**Spec:** `docs/superpowers/specs/2026-11-22-inventory-session-layout-design.md`

## Global Constraints

- Do not change `/inventory`, `/inventory/new`, the API, Koha, or the four patron KPI cards’ labels, hints, icons, tones, or grid.
- Do not add rows for books that were never scanned, a shelf dropdown, a damaged checkbox, sample barcodes, Simulate scans, an accuracy percentage, or a stocktake-history panel.
- The staff shell stays. Do not draw the prototype sidebar or top bar.
- Statuses stay `draft`, `in_progress`, `in_review`, and `cancelled`.
- The barcode field, Type barcode, sound, result, and “Checking Koha…” stay as they are and mount only in `in_progress`.
- Approve and No action stay disabled until a preset is chosen, and only during `in_review`. Empty review copy stays “No exceptions to review.”
- Export exceptions is enabled only in `in_review` and `cancelled`. It still downloads `{reference}-exceptions.csv` and does not change status.
- A null location reads “Whole library.” The zero-count sentence on a draft stays “Koha returned no items for this library and location. You can still start and record unexpected barcodes.”
- Back to sessions stays a link button with `nativeButton={false}`.
- Copy in this plan is exact. Do not add a period to the progress sentence.
- On Windows, commit with `git commit -F` a message file. Never add `Co-authored-by: Cursor <cursoragent@cursor.com>`.
- Tests run from `apps/web`: `npm test` and `npm run typecheck`.

## File structure

- Create `apps/web/lib/inventory/layout.ts`. Progress text, scan count, stepper marks, KPI definitions.
- Create `apps/web/lib/inventory/layout.test.ts`.
- Create `apps/web/components/kpi-card.tsx`. The card now private inside `patron-kpis.tsx`.
- Modify `apps/web/components/patrons/patron-kpis.tsx`. Import the shared card. Pass the same four cards.
- Create `apps/web/components/inventory/inventory-kpis.tsx`.
- Create `apps/web/components/inventory/session-stepper.tsx`.
- Create `apps/web/components/inventory/session-progress.tsx`.
- Create `apps/web/components/inventory/session-card.tsx`.
- Create `apps/web/components/inventory/scans-panel.tsx`. Move the current scans panel.
- Create `apps/web/components/inventory/exception-review.tsx`. Move the current review panel and row.
- Create `apps/web/components/inventory/session-sidebar.tsx`. Move the current sidebar and rename its headings.
- Modify `apps/web/components/inventory/session-view.tsx`. Compose the card, the KPI row, and one `lg:grid-cols-3` layout.

---

### Task 1: Layout helpers

**Files:**
- Create: `apps/web/lib/inventory/layout.ts`
- Create: `apps/web/lib/inventory/layout.test.ts`
- Test: `apps/web/lib/inventory/layout.test.ts`

**Interfaces:**
- Consumes: `InventorySessionCounters` and `InventorySessionStatus` from `apps/web/lib/inventory/types.ts`.
- Produces: `savedScanCount(counters)`, `progressText(seen, expectedCount, scanCount)`, `stepMarks(status)`, `inventoryKpis(counters, expectedCount)`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/inventory/layout.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  inventoryKpis,
  progressText,
  savedScanCount,
  stepMarks,
} from "./layout.ts";
import type { InventorySessionCounters } from "./types.ts";

const counters: InventorySessionCounters = {
  expected_count: 12,
  seen: 3,
  verified: 1,
  misplaced: 1,
  unexpected: 0,
  not_found: 1,
  withdrawn: 1,
  damaged: 1,
  other_exception: 0,
  needs_a_look: 4,
  duplicates: 1,
  remaining: 9,
};

test("savedScanCount counts every saved scan row", () => {
  assert.equal(savedScanCount(counters), 6);
});

test("progressText uses the spec sentence and a singular scan", () => {
  assert.equal(
    progressText(3, 12, 6),
    "3 of 12 expected items seen · 6 scans",
  );
  assert.equal(progressText(0, 0, 1), "0 of 0 expected items seen · 1 scan");
});

test("stepMarks follows draft, scanning, review, and cancelled", () => {
  assert.deepEqual(stepMarks("draft"), ["current", "later", "later", "later"]);
  assert.deepEqual(stepMarks("in_progress"), [
    "complete",
    "current",
    "later",
    "later",
  ]);
  assert.deepEqual(stepMarks("in_review"), [
    "complete",
    "complete",
    "current",
    "later",
  ]);
  assert.deepEqual(stepMarks("cancelled"), ["later", "later", "later", "later"]);
});

test("inventoryKpis keeps the seven labels, hints, tones, and values", () => {
  assert.deepEqual(
    inventoryKpis(counters, 12).map((card) => ({
      key: card.key,
      label: card.label,
      hint: card.hint,
      tone: card.tone,
      value: card.value,
    })),
    [
      { key: "expected", label: "Expected", hint: "in this session", tone: "maroon", value: 12 },
      { key: "verified", label: "Verified", hint: "matched the shelf", tone: "gold", value: 1 },
      { key: "not_found", label: "Not found", hint: "no Koha record", tone: "red", value: 1 },
      { key: "misplaced", label: "Misplaced", hint: "wrong shelf", tone: "blue", value: 1 },
      { key: "unexpected", label: "Unexpected", hint: "outside this scope", tone: "maroon", value: 0 },
      { key: "damaged", label: "Damaged", hint: "needs repair", tone: "red", value: 1 },
      { key: "withdrawn", label: "Withdrawn", hint: "found on the shelf", tone: "gold", value: 1 },
    ],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `npm test`

Expected: FAIL because `./layout.ts` cannot be resolved.

- [ ] **Step 3: Write the helpers**

Create `apps/web/lib/inventory/layout.ts`:

```ts
import type {
  InventorySessionCounters,
  InventorySessionStatus,
} from "./types.ts";

export type StepMark = "complete" | "current" | "later";

export type InventoryKpiKey =
  | "expected"
  | "verified"
  | "not_found"
  | "misplaced"
  | "unexpected"
  | "damaged"
  | "withdrawn";

export type InventoryKpiTone = "maroon" | "gold" | "blue" | "red";

export type InventoryKpi = {
  key: InventoryKpiKey;
  label: string;
  hint: string;
  tone: InventoryKpiTone;
  value: number;
};

export function savedScanCount(counters: InventorySessionCounters): number {
  return (
    counters.verified +
    counters.misplaced +
    counters.unexpected +
    counters.not_found +
    counters.withdrawn +
    counters.damaged +
    counters.other_exception +
    counters.duplicates
  );
}

export function progressText(
  seen: number,
  expectedCount: number,
  scanCount: number,
): string {
  const scans = scanCount === 1 ? "1 scan" : `${scanCount} scans`;
  return `${seen} of ${expectedCount} expected items seen · ${scans}`;
}

export function stepMarks(
  status: InventorySessionStatus,
): [StepMark, StepMark, StepMark, StepMark] {
  if (status === "draft") {
    return ["current", "later", "later", "later"];
  }
  if (status === "in_progress") {
    return ["complete", "current", "later", "later"];
  }
  if (status === "in_review") {
    return ["complete", "complete", "current", "later"];
  }
  return ["later", "later", "later", "later"];
}

export function inventoryKpis(
  counters: InventorySessionCounters,
  expectedCount: number,
): InventoryKpi[] {
  return [
    { key: "expected", label: "Expected", hint: "in this session", tone: "maroon", value: expectedCount },
    { key: "verified", label: "Verified", hint: "matched the shelf", tone: "gold", value: counters.verified },
    { key: "not_found", label: "Not found", hint: "no Koha record", tone: "red", value: counters.not_found },
    { key: "misplaced", label: "Misplaced", hint: "wrong shelf", tone: "blue", value: counters.misplaced },
    { key: "unexpected", label: "Unexpected", hint: "outside this scope", tone: "maroon", value: counters.unexpected },
    { key: "damaged", label: "Damaged", hint: "needs repair", tone: "red", value: counters.damaged },
    { key: "withdrawn", label: "Withdrawn", hint: "found on the shelf", tone: "gold", value: counters.withdrawn },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `npm test`

Expected: PASS, including the existing inventory tests.

- [ ] **Step 5: Commit**

Message:

```
Add inventory layout helpers for the session page.

The stepper, progress sentence, and KPI definitions need one tested source.
```

Stage only `apps/web/lib/inventory/layout.ts` and `apps/web/lib/inventory/layout.test.ts`.

---

### Task 2: Shared KPI card

**Files:**
- Create: `apps/web/components/kpi-card.tsx`
- Modify: `apps/web/components/patrons/patron-kpis.tsx`

**Interfaces:**
- Consumes: shadcn `Card`, `Skeleton`, `cn`, `HugeiconsIcon`.
- Produces: `KpiCard` and `KpiTone`. Patrons import `KpiCard`. The patron grid, labels, hints, icons, and tones stay the ones already in `patron-kpis.tsx`.

- [ ] **Step 1: Move the card**

Create `apps/web/components/kpi-card.tsx` with the current `TONES` object and `KpiCard` function from `patron-kpis.tsx`. Export both the tone type and the component:

```tsx
"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

const TONES = {
  maroon: "bg-[#F6E7E7] text-[#7D1519]",
  gold: "bg-[#FFF1D6] text-[#8A5A00]",
  blue: "bg-[#E9F1FB] text-[#1D4E89]",
  red: "bg-[#FDECEA] text-[#B42318]",
} as const;

export type KpiTone = keyof typeof TONES;

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconSvgElement;
  tone: KpiTone;
  loading: boolean;
}) {
  const unavailable = value === "Unavailable";
  return (
    <Card className="rounded-[0.9rem] p-4 shadow-[0_1px_2px_rgba(34,26,24,0.05),0_6px_18px_-12px_rgba(34,26,24,0.12)] ring-foreground/7 [--card-spacing:--spacing(4)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p
              className={cn(
                "font-display mt-1 leading-none text-foreground",
                unavailable ? "text-lg font-medium" : "text-2xl font-bold lg:text-[1.7rem]",
              )}
            >
              {value}
            </p>
          )}
          {hint ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "flex size-[2.6rem] shrink-0 items-center justify-center rounded-[0.7rem]",
            TONES[tone],
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
        </span>
      </div>
    </Card>
  );
}
```

In `patron-kpis.tsx`, delete the local `TONES` object and `KpiCard` function. Import `KpiCard` from `@/components/kpi-card`. Leave the four `KpiCard` calls and the `grid-cols-2 gap-4 md:grid-cols-4` wrapper unchanged.

- [ ] **Step 2: Typecheck**

Run from `apps/web`: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 3: Commit**

Message:

```
Share the patron KPI card.

Inventory needs the same card without a second copy of its markup.
```

Stage only `apps/web/components/kpi-card.tsx` and `apps/web/components/patrons/patron-kpis.tsx`.

---

### Task 3: Inventory KPI row

**Files:**
- Create: `apps/web/components/inventory/inventory-kpis.tsx`
- Modify: `apps/web/components/inventory/session-view.tsx`

**Interfaces:**
- Consumes: `inventoryKpis` from Task 1 and `KpiCard` from Task 2.
- Produces: `InventoryKpis({ counters, expectedCount })`.

- [ ] **Step 1: Add the row**

Create `apps/web/components/inventory/inventory-kpis.tsx`:

```tsx
"use client";

import {
  Alert02Icon,
  Bookmark02Icon,
  CheckmarkCircle02Icon,
  LibraryIcon,
  Location01Icon,
  PackageIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { KpiCard } from "@/components/kpi-card";
import {
  inventoryKpis,
  type InventoryKpiKey,
} from "@/lib/inventory/layout";
import type { InventorySessionCounters } from "@/lib/inventory/types";

const ICONS: Record<InventoryKpiKey, IconSvgElement> = {
  expected: LibraryIcon,
  verified: CheckmarkCircle02Icon,
  not_found: Search01Icon,
  misplaced: Location01Icon,
  unexpected: PackageIcon,
  damaged: Alert02Icon,
  withdrawn: Bookmark02Icon,
};

export function InventoryKpis({
  counters,
  expectedCount,
}: {
  counters: InventorySessionCounters;
  expectedCount: number;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
      {inventoryKpis(counters, expectedCount).map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value.toLocaleString("en-PH")}
          hint={card.hint}
          icon={ICONS[card.key]}
          tone={card.tone}
          loading={false}
        />
      ))}
    </div>
  );
}
```

In `session-view.tsx`, delete `CountCardsGrid`. Where it was rendered, render `InventoryKpis` with `displayCounters` and `session.expected_count`. Keep the surrounding `displayCounters` check.

- [ ] **Step 2: Typecheck and test**

Run from `apps/web`: `npm test` and `npm run typecheck`

Expected: both exit 0.

- [ ] **Step 3: Commit**

Message:

```
Show inventory counts on the shared KPI card.

The session page was using plain bordered numbers.
```

Stage only the two files in this task.

---

### Task 4: Session card, stepper, and progress

**Files:**
- Create: `apps/web/components/inventory/session-stepper.tsx`
- Create: `apps/web/components/inventory/session-progress.tsx`
- Create: `apps/web/components/inventory/session-card.tsx`
- Modify: `apps/web/components/inventory/session-view.tsx`

**Interfaces:**
- Consumes: `stepMarks`, `progressText`, and `savedScanCount` from Task 1.
- Produces: `SessionStepper`, `SessionProgress`, and `SessionCard`.

- [ ] **Step 1: Add the three components**

`session-stepper.tsx`:

```tsx
const LABELS = ["Plan", "Scan", "Review", "Submit"] as const;

function circleClass(mark: StepMark): string {
  if (mark === "complete") {
    return "bg-maroon-700 text-white";
  }
  if (mark === "current") {
    return "bg-gold-400 text-maroon-950";
  }
  return "bg-muted text-muted-foreground";
}

export function SessionStepper({ status }: { status: InventorySessionStatus }) {
  const marks = stepMarks(status);
  return (
    <ol className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
      {LABELS.map((label, index) => {
        const mark = marks[index];
        return (
          <li key={label} className="flex min-w-0 items-center gap-2 text-sm">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${circleClass(mark)}`}
            >
              {mark === "complete" ? "✓" : index + 1}
            </span>
            <span className={mark === "current" ? "font-bold text-foreground" : "text-muted-foreground"}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
```

`session-progress.tsx` renders the label “Scan progress”, `progressText(seen, expectedCount, scanCount)`, and a bar whose width is `0` when `expectedCount` is `0`, otherwise `Math.min(100, (seen / expectedCount) * 100)`. The track is `h-2` and `bg-muted`. The fill is `bg-maroon-700`. The track keeps `role="progressbar"` with `aria-valuenow={seen}`, `aria-valuemin={0}`, and `aria-valuemax={expectedCount}`.

`session-card.tsx` accepts the session, `actionPending`, `actionError`, `exportPending`, `exportError`, and callbacks `onStart`, `onFinish`, `onResume`, `onCancel`, and `onExport`. It renders:

- The existing heading: reference, a middle dot, and the name, in `font-display`.
- The status pill: Draft, In progress, In review, or Cancelled.
- The meta line: library name, a middle dot, and the location. A null location is “Whole library.”
- Buttons, with `min-h-11`:
  - `draft`: Start scanning, Cancel session, Export exceptions disabled.
  - `in_progress`: Finish scanning, Cancel session, Export exceptions disabled.
  - `in_review`: Back to scanning, Cancel session, Export exceptions enabled unless `exportPending`.
  - `cancelled`: the text “Cancelled”, and Export exceptions enabled unless `exportPending`.
- `SessionStepper` and `SessionProgress`. The scan count passed to progress is `savedScanCount(session.counters)`.
- `actionError` and `exportError` as destructive text when present.

The card is a white rounded bordered section. It does not render Back to sessions.

- [ ] **Step 2: Use the card in SessionView**

Replace `WorkstationHeader`, `InventoryStepper`, the standalone `SessionProgress`, and the per-status button blocks with one `SessionCard`. Keep Back to sessions above it. Delete the three local functions after the card owns them. Leave the barcode form, scans panel, review panel, sidebar, and cancel dialog where they are for this task.

`onStart` calls the existing `onStartScanning`. `onFinish` calls `onFinishScanning`. `onResume` calls `onBackToScanning`. `onCancel` opens the existing cancel dialog. `onExport` calls `onExportExceptions`.

- [ ] **Step 3: Typecheck and test**

Run from `apps/web`: `npm test` and `npm run typecheck`

Expected: both exit 0.

- [ ] **Step 4: Commit**

Message:

```
Put the inventory stepper and actions on one session card.

Export stays a separate button, and Submit stays a step label.
```

Stage only the four files in this task.

---

### Task 5: Columns, scans, review, and sidebar

**Files:**
- Create: `apps/web/components/inventory/scans-panel.tsx`
- Create: `apps/web/components/inventory/exception-review.tsx`
- Create: `apps/web/components/inventory/session-sidebar.tsx`
- Modify: `apps/web/components/inventory/session-view.tsx`

**Interfaces:**
- Consumes: the existing `ScansPanel`, `ExceptionReviewPanel`, `ExceptionReviewRow`, `WorkstationSidebar`, `SidebarGroup`, and `SidebarError` function bodies.
- Produces: those components from their new files, with the same props they have now.

- [ ] **Step 1: Move the panels**

Move each function into the file named above and export the panel component. Keep the props and the request behavior. A review row still PUTs its own decision and still patches the exceptions cache.

Change only these strings:

- Sidebar title `Latest scans` becomes `Recent scans`.
- Sidebar error `Latest scans could not be loaded.` becomes `Recent scans could not be loaded.`
- Sidebar title `Audit` becomes `Audit trail`.
- Scans panel gains a heading “Scans” and the description “Saved barcodes compared with Koha item records.”
- Exception panel gains a heading “Exception review”.
- Empty copy stays “No scans yet.”, “No exceptions to review.”, “No audit entries yet.”, and “No other sessions.”

- [ ] **Step 2: Compose one grid**

Under the KPI row, render this grid. Delete the second sidebar that uses `lg:hidden` and `hidden lg:flex`.

```tsx
<div className="grid min-w-0 gap-4 lg:grid-cols-3">
  <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
    {session.status === "in_progress" ? (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-display text-lg font-bold text-foreground">Scan barcodes</h2>
        {/* existing barcode form, waiting count, failure, retry, and result card */}
      </section>
    ) : null}
    {session.status === "draft" && session.expected_count === 0 ? (
      <p className="text-sm text-muted-foreground">{ZERO_COUNT_COPY}</p>
    ) : null}
    {session.status === "in_progress" ||
    session.status === "in_review" ||
    session.status === "cancelled" ? (
      <ScansPanel
        scansQuery={scansQuery}
        scanSearchDraft={scanSearchDraft}
        onScanSearchChange={setScanSearchDraft}
        scanFilter={scanFilter}
        onScanFilterChange={setScanFilter}
        scanPage={scanPage}
        onScanPageChange={setScanPage}
      />
    ) : null}
    <ExceptionReviewPanel
      sessionId={sessionId}
      status={session.status}
      exceptionsQuery={exceptionsQuery}
      reviewPage={reviewPage}
      onReviewPageChange={setReviewPage}
    />
  </div>
  <SessionSidebar
    className="min-w-0"
    sessionId={sessionId}
    sidebarScansQuery={sidebarScansQuery}
    sidebarAuditQuery={sidebarAuditQuery}
    sidebarSessionsQuery={sidebarSessionsQuery}
  />
</div>
```

The comment marks are the existing elements already in `session-view.tsx`. Move them into that card and those panels. Do not rewrite the scan queue.

Do not change scan invalidation, exception invalidation, or the cancel dialog.

- [ ] **Step 3: Typecheck and test**

Run from `apps/web`: `npm test` and `npm run typecheck`

Expected: both exit 0.

- [ ] **Step 4: Commit**

Message:

```
Place inventory review beside the session sidebar.

The session page was stacking the scans, the review, and a second sidebar.
```

Stage only the four files in this task.

---

### Task 6: Browser check

**Files:**
- Modify: none unless a check fails. A failure is fixed in the file from the task that owns it, then that task’s typecheck is rerun.

- [ ] **Step 1: Open a session in each status**

On a wide window, confirm:

- Draft shows the session card, Plan as the current step, Scan progress, seven KPI cards, and the sidebar headings Recent scans, Audit trail, and Other sessions.
- Export exceptions is disabled. The barcode field is absent.
- A draft with `expected_count` 0 shows “Koha returned no items for this library and location. You can still start and record unexpected barcodes.”
- Start scanning shows the barcode field inside “Scan barcodes”, focuses it, and shows Type barcode and Sound off. Scan becomes the current step. Plan has a check.
- Finish scanning hides the barcode field. Review becomes the current step. Submit stays a later step. Approve stays disabled until a preset is chosen.
- After Approve, the row shows `Approve · {display name}` when the name is present.
- Export exceptions downloads `{reference}-exceptions.csv`.
- The sidebar sits beside the main column. At a narrow width it stacks, and the page does not scroll sideways.
- The patron directory still shows Registered patrons, Students, Faculty & staff, and With outstanding fines.

- [ ] **Step 2: Record the result**

If every check passes, no commit is needed. If a check fails, fix that behavior and commit only the files that changed.
