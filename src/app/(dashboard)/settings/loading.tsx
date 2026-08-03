export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 animate-pulse rounded bg-muted/20" />
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded bg-muted/20" />
        ))}
      </div>
      <div className="card space-y-4 p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted/20" />
        <div className="h-32 animate-pulse rounded bg-muted/10" />
        <div className="h-10 w-full animate-pulse rounded bg-muted/10" />
      </div>
    </div>
  );
}