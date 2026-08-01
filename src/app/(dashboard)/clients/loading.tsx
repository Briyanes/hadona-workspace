export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 rounded-md bg-surface animate-pulse" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card skeleton h-40" />
        ))}
      </div>
    </div>
  );
}