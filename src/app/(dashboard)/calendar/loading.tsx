export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-md bg-surface animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-32 rounded-lg bg-surface animate-pulse" />
          <div className="h-9 w-9 rounded-lg bg-surface animate-pulse" />
          <div className="h-9 w-9 rounded-lg bg-surface animate-pulse" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-3 w-20 rounded bg-surface animate-pulse" />
            <div className="mt-2 h-7 w-12 rounded bg-surface animate-pulse" />
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-surface animate-pulse" />
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="p-2 text-center">
                <div className="mx-auto h-3 w-8 rounded bg-surface animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {[...Array(35)].map((_, i) => (
              <div
                key={i}
                className="min-h-[80px] border-b border-r border-border p-2 lg:min-h-[100px]"
              >
                <div className="mb-1 h-3 w-5 rounded bg-surface animate-pulse" />
                <div className="h-4 w-full rounded bg-surface animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="card p-4">
          <div className="mb-3 h-5 w-28 rounded bg-surface animate-pulse" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-surface animate-pulse" />
                <div className="flex-1">
                  <div className="h-3 w-32 rounded bg-surface animate-pulse" />
                  <div className="mt-1 h-2 w-20 rounded bg-surface animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}