export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-md bg-surface animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-surface animate-pulse" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-surface animate-pulse" />
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-4 w-32 rounded bg-surface animate-pulse" />
                <div className="mt-2 flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-surface animate-pulse" />
                  <div className="h-5 w-20 rounded-full bg-surface animate-pulse" />
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-surface animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-surface animate-pulse" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="h-6 w-24 rounded bg-surface animate-pulse" />
              <div className="h-8 w-8 rounded-lg bg-surface animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}