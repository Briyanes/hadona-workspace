import { SkeletonTable, SkeletonStat } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-md bg-muted/50 animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-muted/50 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}