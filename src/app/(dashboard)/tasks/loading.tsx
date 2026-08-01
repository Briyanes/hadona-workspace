export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-md bg-surface animate-pulse" />
        <div className="h-10 w-40 rounded-md bg-surface animate-pulse" />
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 w-20 rounded bg-surface animate-pulse" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-5 w-5 rounded bg-surface animate-pulse" />
              <div className="h-4 w-64 rounded bg-surface animate-pulse" />
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