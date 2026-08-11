"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plug, CheckCircle2, XCircle, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function IntegrationsSettingsPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/google/status");
      if (res.ok) {
        const data = await res.json();
        setConnected(!!data.connected);
        setHasRefreshToken(!!data.hasRefreshToken);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const err = searchParams.get("google_error");
    const ok = searchParams.get("google_connected");
    if (err) {
      toast.error("Gagal connect Google: " + decodeURIComponent(err));
    } else if (ok) {
      toast.success("Google Calendar berhasil dihubungkan!");
      checkStatus();
    }
  }, [searchParams, checkStatus]);

  const handleConnect = () => {
    setConnecting(true);
    window.location.href = "/api/google/auth";
  };

  const handleDisconnect = async () => {
    if (!confirm("Putuskan koneksi Google Calendar?")) return;
    try {
      const res = await fetch("/api/google/create-meet", { method: "DELETE" });
      if (res.ok) {
        toast.success("Koneksi Google diputus");
        setConnected(false);
        setHasRefreshToken(false);
      } else {
        throw new Error("Failed");
      }
    } catch {
      toast.error("Gagal memutus koneksi");
    }
  };

  return (
    <div className="space-y-6">
      {/* Google Calendar Integration */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3z" fill="#4285F4"/>
            <path d="M12 6v12m-3-3h6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h3 className="text-sm font-semibold text-foreground">Google Calendar & Meet</h3>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            {connected ? (
              <CheckCircle2 size={18} className="text-success" />
            ) : loading ? (
              <Loader2 size={18} className="animate-spin text-muted" />
            ) : (
              <XCircle size={18} className="text-danger" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                {connected ? "Connected" : loading ? "Checking..." : "Not Connected"}
              </p>
              <p className="text-xs text-muted max-w-md">
                Hubungkan untuk auto-generate Google Meet link saat membuat event meeting dengan client di Calendar
              </p>
            </div>
          </div>
          {connected ? (
            <button
              onClick={handleDisconnect}
              className="btn-ghost px-3 py-1.5 text-xs"
              disabled={loading}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={connecting || loading}
            >
              {connecting ? "Connecting..." : "Connect"}
              <ExternalLink size={12} className="ml-1" />
            </button>
          )}
        </div>

        {!connected || !hasRefreshToken ? (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Diperlukan untuk fitur auto-generate Google Meet link di Calendar. Tanpa koneksi ini, event meeting tetap bisa dibuat tapi tanpa link Meet otomatis.
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-400">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span>
              ✓ Saat membuat event "Meeting" di Calendar, Google Meet link akan dibuat otomatis. Invite email dikirim ke attendee + assigned PM.
            </span>
          </div>
        )}
      </div>

      {/* Email SMTP placeholder */}
      <div className="card p-6 opacity-60">
        <div className="mb-3 flex items-center gap-2">
          <Plug size={18} className="text-muted" />
          <h3 className="text-sm font-semibold text-foreground">Email (SMTP)</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Coming Soon
          </span>
        </div>
        <p className="text-xs text-muted">
          Untuk auto-send invoice & laporan bulanan ke client via email.
        </p>
      </div>
    </div>
  );
}