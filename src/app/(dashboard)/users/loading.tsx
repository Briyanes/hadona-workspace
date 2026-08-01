export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 rounded-md bg-surface animate-pulse" />
      <div className="card overflow-hidden">
        <div className="divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-full bg-surface animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 rounded bg-surface animate-pulse" />
                <div className="mt-1 h-3 w-24 rounded bg-surface animate-pulse" />
              </div>
              <div className="h-6 w-20 rounded bg-surface animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}