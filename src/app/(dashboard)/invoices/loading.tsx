export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-28 rounded-md bg-surface animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-surface animate-pulse" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-3 w-20 rounded bg-surface animate-pulse" />
            <div className="mt-2 h-7 w-24 rounded bg-surface animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex gap-3">
            <div className="h-10 flex-1 rounded-lg bg-surface animate-pulse" />
            <div className="h-10 w-28 rounded-lg bg-surface animate-pulse" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-5 w-5 rounded bg-surface animate-pulse" />
              <div className="h-4 w-24 rounded bg-surface animate-pulse" />
              <div className="h-4 w-40 rounded bg-surface animate-pulse" />
              <div className="ml-auto flex gap-2">
                <div className="h-6 w-20 rounded bg-surface animate-pulse" />
                <div className="h-6 w-24 rounded bg-surface animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}