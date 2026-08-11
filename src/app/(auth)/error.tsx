"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
        <AlertTriangle className="text-danger" size={32} />
      </div>

      <h1 className="mb-2 text-2xl font-bold text-foreground">
        Terjadi Kesalahan
      </h1>

      <p className="mb-1 max-w-md text-sm text-muted">
        Maaf, sesuatu tidak berjalan semestinya. Silakan coba lagi.
      </p>

      {error.digest && (
        <p className="mb-4 font-mono text-xs text-muted">
          Error ID: {error.digest}
        </p>
      )}

      <div className="mt-4">
        <button
          onClick={reset}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} />
          Coba Lagi
        </button>
      </div>
    </div>
  );
}