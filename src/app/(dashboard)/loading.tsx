export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-md bg-surface animate-pulse" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card skeleton h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card skeleton h-64" />
        ))}
      </div>
    </div>
  );
}