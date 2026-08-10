"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
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

  const isNotFound =
    error?.message?.toLowerCase().includes("not found") ||
    error?.name === "NotFound";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
        {isNotFound ? (
          <Bug className="text-muted" size={32} />
        ) : (
          <AlertTriangle className="text-danger" size={32} />
        )}
      </div>

      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        {isNotFound ? "Halaman Tidak Ditemukan" : "Terjadi Kesalahan"}
      </h1>

      <p className="mb-1 max-w-md text-sm text-muted">
        {isNotFound
          ? "Halaman yang Anda cari mungkin telah dipindahkan atau tidak lagi tersedia."
          : "Maaf, sesuatu tidak berjalan semestinya. Silakan coba lagi."}
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
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
        >
          <Home size={14} />
          Dashboard
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
        >
          <RefreshCw size={14} />
          Muat Ulang
        </button>
      </div>
    </div>
  );
}