import { SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-md bg-muted/50 animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-muted/50 animate-pulse" />
      </div>
      {/* Filter tabs */}
      <div className="flex gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
      {/* Table skeleton */}
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
}