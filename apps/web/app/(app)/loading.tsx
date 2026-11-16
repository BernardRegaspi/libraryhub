import { Skeleton } from "@/components/ui/skeleton";

export default function StaffAppLoading() {
  return (
    <div className="ulms flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-border bg-[#2e080a] p-4 lg:flex">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md bg-white/10" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24 bg-white/10" />
            <Skeleton className="h-3 w-20 bg-white/10" />
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-4">
          <Skeleton className="h-3 w-16 bg-white/10" />
          <Skeleton className="h-8 w-full bg-white/10" />
          <Skeleton className="h-8 w-full bg-white/10" />
          <Skeleton className="h-8 w-4/5 bg-white/10" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="hidden h-7 flex-1 max-w-xs sm:block" />
          <Skeleton className="ml-auto size-8 rounded-full" />
        </header>
        <div className="flex flex-col gap-4 p-6 lg:p-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      </div>
    </div>
  );
}