import { Calendar, Construction } from "lucide-react";

export default function ContentPlansPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
        <Calendar className="text-primary" size={28} />
      </div>
      <h2 className="text-xl font-bold text-white">Content Plans</h2>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted">
        <Construction size={14} />
        Modul ini sedang dalam pengembangan
      </div>
    </div>
  );
}