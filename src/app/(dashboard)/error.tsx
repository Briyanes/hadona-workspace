"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
        <AlertTriangle className="text-danger" size={32} />
      </div>

      <h1 className="mb-2 text-2xl font-bold text-foreground">
        Halaman Error
      </h1>

      <p className="mb-1 max-w-md text-sm text-muted">
        Terjadi kesalahan saat memuat halaman ini. Tim kami sudah diberi notifikasi.
        Silakan coba lagi atau kembali ke Dashboard.
      </p>

      {error.digest && (
        <p className="mb-4 font-mono text-xs text-muted">
          Error ID: {error.digest}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} />
          Coba Lagi
        </button>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-background"
        >
          <Home size={14} />
          Dashboard
        </Link>
      </div>
    </div>
  );
}