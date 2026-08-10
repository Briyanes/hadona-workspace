import { SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-md bg-muted/50 animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-muted/50 animate-pulse" />
      </div>
      {/* Calendar grid skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SkeletonCard lines={5} />
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 grid grid-cols-7 gap-2">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-6 rounded bg-muted/50 animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {[...Array(35)].map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}