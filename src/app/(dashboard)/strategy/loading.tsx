export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-md bg-surface animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-lg bg-surface animate-pulse" />
          <div className="h-9 w-20 rounded-lg bg-surface animate-pulse" />
          <div className="h-10 w-36 rounded-md bg-surface animate-pulse" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-3 w-20 rounded bg-surface animate-pulse" />
            <div className="mt-2 h-7 w-12 rounded bg-surface animate-pulse" />
          </div>
        ))}
      </div>

      {/* OKR Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-5 w-48 rounded bg-surface animate-pulse" />
                <div className="mt-2 h-3 w-32 rounded bg-surface animate-pulse" />
              </div>
              <div className="h-6 w-20 rounded-full bg-surface animate-pulse" />
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between">
                <div className="h-3 w-16 rounded bg-surface animate-pulse" />
                <div className="h-3 w-10 rounded bg-surface animate-pulse" />
              </div>
              <div className="h-2 w-full rounded-full bg-surface animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}