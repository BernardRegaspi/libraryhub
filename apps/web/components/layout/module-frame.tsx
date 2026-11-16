import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SquareLock01Icon } from "@hugeicons/core-free-icons";

type ModuleFrameProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  actions?: ReactNode;
  hideModuleSentence?: boolean;
};

export function ModuleFrame({
  eyebrow,
  title,
  description,
  actions,
  hideModuleSentence = false,
}: ModuleFrameProps) {
  return (
    <div className="flex flex-col gap-4 px-6 py-8 lg:px-8">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">
        {eyebrow}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {!hideModuleSentence ? (
        <p className="text-sm text-muted-foreground">
          This module&apos;s tools will be added in a later spec.
        </p>
      ) : null}
    </div>
  );
}

type AccessDeniedProps = {
  roleName: string;
};

export function AccessDenied({ roleName }: AccessDeniedProps) {
  return (
    <div className="mx-6 my-12 flex max-w-lg flex-col items-center gap-4 rounded-xl border border-border bg-card px-8 py-10 text-center lg:mx-8">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <HugeiconsIcon
          icon={SquareLock01Icon}
          strokeWidth={2}
          className="size-6 text-primary"
        />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">
        Access denied
      </h2>
      <p className="text-sm text-muted-foreground">
        Your role ({roleName}) does not include this module. Authorization is
        enforced by the backend API as well as this UI.
      </p>
    </div>
  );
}