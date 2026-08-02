export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-md bg-surface animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-surface animate-pulse" />
      </div>

      {/* Search bar */}
      <div className="card p-4">
        <div className="flex gap-3">
          <div className="h-10 flex-1 rounded-lg bg-surface animate-pulse" />
          <div className="h-10 w-28 rounded-lg bg-surface animate-pulse" />
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-surface animate-pulse" />
                <div>
                  <div className="h-4 w-28 rounded bg-surface animate-pulse" />
                  <div className="mt-1 h-3 w-20 rounded bg-surface animate-pulse" />
                </div>
              </div>
              <div className="h-6 w-16 rounded-full bg-surface animate-pulse" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-5 w-16 rounded bg-surface animate-pulse" />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-surface animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-surface animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}