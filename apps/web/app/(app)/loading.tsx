import { Skeleton } from "@/components/ui/skeleton";

export default function StaffAppLoading() {
  return (
    <div className="flex flex-col gap-4 px-6 py-8 lg:px-8">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-4 w-full max-w-lg" />
    </div>
  );
}
