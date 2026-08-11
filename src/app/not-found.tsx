import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Search className="text-primary" size={32} />
      </div>
      <h1 className="mb-2 text-6xl font-bold text-foreground">404</h1>
      <h2 className="mb-2 text-lg font-semibold text-foreground">
        Halaman Tidak Ditemukan
      </h2>
      <p className="mb-6 max-w-sm text-sm text-muted">
        Halaman yang Anda cari mungkin telah dipindahkan, dihapus, atau tidak pernah ada.
      </p>
      <Link
        href="/"
        className="btn-primary flex items-center gap-1.5 text-xs"
      >
        <Home size={14} />
        Kembali ke Dashboard
      </Link>
    </div>
  );
}