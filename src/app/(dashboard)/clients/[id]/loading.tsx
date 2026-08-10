import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-md bg-muted/50 animate-pulse" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SkeletonCard lines={4} />
        <div className="md:col-span-2">
          <SkeletonTable rows={5} cols={4} />
        </div>
      </div>
    </div>
  );
}