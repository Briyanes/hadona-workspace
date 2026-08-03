export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/20" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card h-24 animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="card h-96 animate-pulse rounded-lg" />
    </div>
  );
}