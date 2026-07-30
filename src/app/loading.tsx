import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
      <p className="text-sm text-muted">Memuat...</p>
    </div>
  );
}