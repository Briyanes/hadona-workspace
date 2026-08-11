export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/50" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-muted/30" />
        ))}
      </div>
      <div className="card h-96 animate-pulse bg-muted/20" />
    </div>
  );
}