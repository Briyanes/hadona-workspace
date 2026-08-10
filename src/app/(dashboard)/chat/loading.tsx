import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex h-[calc(100vh-180px)] rounded-xl border bg-card overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="w-64 flex-shrink-0 border-r bg-muted/30 p-3 hidden md:block">
          <Skeleton className="h-4 w-20 mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        {/* Chat area skeleton */}
        <div className="flex-1 p-4">
          <Skeleton className="h-12 w-full mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}