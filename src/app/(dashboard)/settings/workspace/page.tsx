"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings2, Gamepad2, CheckCircle2, XCircle, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

export default function WorkspaceSettingsPage() {
  const [metaStatus, setMetaStatus] = useState<"connected" | "disconnected" | "loading">("loading");
  const [metaExpiry, setMetaExpiry] = useState<string | null>(null);

  const checkMetaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/status");
      if (!res.ok) { setMetaStatus("disconnected"); return; }
      const data = await res.json();
      if (data.connected) {
        setMetaStatus("connected");
        setMetaExpiry(data.expires_at || null);
      } else {
        setMetaStatus("disconnected");
      }
    } catch {
      setMetaStatus("disconnected");
    }
  }, []);

  useEffect(() => { checkMetaStatus(); }, [checkMetaStatus]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id";

  return (
    <div className="space-y-6">
      {/* WorkAdventure Integration */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Gamepad2 size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">WorkAdventure Integration</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Embed URL (Dashboard)</p>
              <button onClick={() => copyToClipboard(`${appUrl}/embed?token=ACCESS_TOKEN`)} className="text-muted hover:text-primary">
                <Copy size={12} />
              </button>
            </div>
            <code className="text-xs text-primary break-all">{appUrl}/embed?token=ACCESS_TOKEN</code>
          </div>
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Embed URL (Tasks)</p>
              <button onClick={() => copyToClipboard(`${appUrl}/embed/tasks?token=ACCESS_TOKEN`)} className="text-muted hover:text-primary">
                <Copy size={12} />
              </button>
            </div>
            <code className="text-xs text-primary break-all">{appUrl}/embed/tasks?token=ACCESS_TOKEN</code>
          </div>
          <p className="text-xs text-muted">
            Gunakan URL ini di WorkAdventure Map (Tiled) sebagai properti <code className="text-primary">openTab</code> pada objek interaktif.
          </p>
        </div>
      </div>

      {/* Meta API Integration */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">Meta (Facebook) API</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              {metaStatus === "connected" ? (
                <CheckCircle2 size={18} className="text-success" />
              ) : metaStatus === "loading" ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
              ) : (
                <XCircle size={18} className="text-danger" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {metaStatus === "connected" ? "Connected" : metaStatus === "loading" ? "Checking..." : "Not Connected"}
                </p>
                <p className="text-xs text-muted">
                  {metaExpiry && metaStatus === "connected"
                    ? `Expires: ${new Date(metaExpiry).toLocaleDateString("id-ID")}`
                    : "Hubungkan untuk sync ad spend otomatis"}
                </p>
              </div>
            </div>
            <a
              href="/api/meta/auth"
              className={metaStatus === "connected" ? "btn-ghost px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
            >
              {metaStatus === "connected" ? "Reconnect" : "Connect"}
              <ExternalLink size={12} className="ml-1" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}