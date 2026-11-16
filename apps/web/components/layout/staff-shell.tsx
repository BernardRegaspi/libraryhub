"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, fetchApi } from "@/lib/api";
import { STAFF_NAV } from "@/lib/auth/nav";
import type { CurrentUser } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

type StaffShellProps = {
  me: CurrentUser;
  children: ReactNode;
};

function departmentSelectValue(user: CurrentUser): string {
  return user.active_department_id ?? "all";
}

function staffRoleNames(me: CurrentUser): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const assignment of me.assignments) {
    const name = assignment.role.name;
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names.join(", ");
}

function redirectToLogin(pathname: string): void {
  window.location.assign(`/login?next=${encodeURIComponent(pathname)}`);
}

async function mutateWithSessionRecovery<T>(
  pathname: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }

    if (error.status === 401) {
      redirectToLogin(pathname);
      throw error;
    }

    if (error.detail?.code !== "csrf_failed") {
      throw error;
    }

    try {
      await fetchApi<CurrentUser>("/auth/me");
    } catch (meError) {
      if (meError instanceof ApiError && meError.status === 401) {
        redirectToLogin(pathname);
      }
      throw meError;
    }

    try {
      return await call();
    } catch (retryError) {
      if (retryError instanceof ApiError) {
        if (
          retryError.status === 401 ||
          retryError.detail?.code === "csrf_failed"
        ) {
          redirectToLogin(pathname);
        }
      }
      throw retryError;
    }
  }
}

function StaffSidebarHeader() {
  const [sealFailed, setSealFailed] = useState(false);

  return (
    <SidebarHeader className="border-b border-sidebar-border/40 px-3 py-4">
      <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
        {!sealFailed ? (
          <Image
            src="https://www.usant.edu.ph/images/usant_logo_new.png"
            alt="USANT seal"
            width={36}
            height={36}
            className="size-9 shrink-0 object-contain group-data-[collapsible=icon]:size-8"
            onError={() => setSealFailed(true)}
          />
        ) : null}
        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
          <div className="truncate text-sm font-semibold text-sidebar-foreground">
            libraryhub
          </div>
          <div className="truncate text-xs text-sidebar-foreground/75">
            USANT · ULMS
          </div>
        </div>
      </div>
    </SidebarHeader>
  );
}

export function StaffShell({ me, children }: StaffShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [departmentValue, setDepartmentValue] = useState(() =>
    departmentSelectValue(me),
  );
  const [trackedDepartmentId, setTrackedDepartmentId] = useState(
    me.active_department_id,
  );
  if (trackedDepartmentId !== me.active_department_id) {
    setTrackedDepartmentId(me.active_department_id);
    setDepartmentValue(departmentSelectValue(me));
  }

  const permittedItems = useMemo(
    () => STAFF_NAV.filter((item) => me.permissions.includes(item.permission)),
    [me.permissions],
  );

  const groupedNav = useMemo(() => {
    const groups: { group: string; items: typeof permittedItems }[] = [];
    for (const item of permittedItems) {
      const last = groups[groups.length - 1];
      if (last?.group === item.group) {
        last.items.push(item);
      } else {
        groups.push({ group: item.group, items: [item] });
      }
    }
    return groups;
  }, [permittedItems]);

  const roleNames = staffRoleNames(me);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleDepartmentChange = useCallback(
    async (value: string | null) => {
      if (value === null) {
        return;
      }
      const previous = departmentValue;
      setDepartmentValue(value);
      setDepartmentError(null);
      const activeDepartmentId = value === "all" ? null : value;

      try {
        await mutateWithSessionRecovery(pathname, () =>
          fetchApi<CurrentUser>("/auth/session", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active_department_id: activeDepartmentId }),
          }),
        );
        router.refresh();
      } catch (error) {
        if (error instanceof ApiError && error.detail?.code === "department_forbidden") {
          setDepartmentValue(previous);
          setDepartmentError(error.detail.message ?? error.message);
          return;
        }
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.detail?.code === "csrf_failed")
        ) {
          return;
        }
        setDepartmentValue(previous);
        setDepartmentError(
          error instanceof Error ? error.message : "The change did not complete.",
        );
      }
    },
    [departmentValue, pathname, router],
  );

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await mutateWithSessionRecovery(pathname, () =>
        fetchApi<void>("/auth/logout", { method: "POST" }),
      );
      window.location.assign("/login");
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.detail?.code === "csrf_failed")
      ) {
        return;
      }
      setSignOutError("Sign-out did not complete.");
    }
  }, [pathname]);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
          <StaffSidebarHeader />
          <SidebarContent>
            {groupedNav.map(({ group, items }) => (
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={pathname === item.href}
                          tooltip={item.label}
                          className={cn(
                            "text-sidebar-foreground/75 hover:bg-white/7 hover:text-white",
                            "data-active:bg-[#FAA61A] data-active:text-[#2E080A] data-active:font-bold",
                          )}
                          render={<Link href={item.href} />}
                        >
                          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter className="p-2 group-data-[collapsible=icon]:p-1">
            <Card
              size="sm"
              className="border-sidebar-border/50 bg-sidebar-foreground/5 py-3 text-sidebar-foreground shadow-none group-data-[collapsible=icon]:hidden"
            >
              <CardContent className="flex flex-col gap-1 px-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      me.koha_configured
                        ? "bg-emerald-400"
                        : "bg-sidebar-foreground/35",
                    )}
                    aria-hidden
                  />
                  {me.koha_configured ? "Koha configured" : "Koha not configured"}
                </div>
                <p className="text-[0.6875rem] leading-snug text-sidebar-foreground/75">
                  Source of truth for catalog, patrons & circulation.
                </p>
              </CardContent>
            </Card>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 lg:px-6">
            <div className="flex flex-wrap items-center gap-2 lg:gap-3">
              <SidebarTrigger
                className="lg:hidden"
                aria-label="Open menu"
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:gap-3">
                <Select
                  value={departmentValue}
                  onValueChange={handleDepartmentChange}
                >
                  <SelectTrigger className="max-w-full min-w-40 sm:min-w-48">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {me.can_select_all_departments ? (
                      <SelectItem value="all">All departments</SelectItem>
                    ) : null}
                    {me.departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="hidden min-w-0 flex-1 justify-start text-muted-foreground sm:flex lg:max-w-xs"
                  onClick={() => setCommandOpen(true)}
                >
                  <span className="truncate">Search or jump to…</span>
                  <span className="ml-auto hidden text-[0.625rem] text-muted-foreground lg:inline">
                    ⌘K
                  </span>
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="sm:hidden"
                  onClick={() => setCommandOpen(true)}
                >
                  Search or jump to…
                </Button>
                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  className="inline-flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted"
                >
                  <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} />
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-full font-semibold"
                      >
                        {me.user.initials}
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="font-normal">
                        <div className="font-medium">{me.user.display_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {roleNames}
                        </div>
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void handleSignOut()}>
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {departmentError ? (
              <p className="text-xs text-destructive" role="alert">
                {departmentError}
              </p>
            ) : null}
            {signOutError ? (
              <p className="text-xs text-destructive" role="alert">
                {signOutError}
              </p>
            ) : null}
          </header>
          <div className="flex-1">{children}</div>
        </SidebarInset>
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <Command>
            <CommandInput placeholder="Search or jump to…" />
            <CommandList>
              <CommandEmpty>No matching routes.</CommandEmpty>
              {groupedNav.map(({ group, items }) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.href}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => {
                        setCommandOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </CommandDialog>
      </SidebarProvider>
    </TooltipProvider>
  );
}