"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
        <AlertCircle className="text-danger" size={32} />
      </div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        Terjadi Kesalahan
      </h1>
      <p className="mb-1 max-w-md text-sm text-muted">
        Maaf, sesuatu tidak berjalan semestinya. Tim kami telah diberi tahu tentang masalah ini.
      </p>
      {error.digest && (
        <p className="mb-4 font-mono text-xs text-muted">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={reset}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} />
          Coba Lagi
        </button>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
        >
          <Home size={14} />
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}