import { Settings, Construction } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-muted">Konfigurasi workspace</p>
      </div>

      <div className="card">
        <h3 className="mb-3 font-semibold text-gray-900">WorkAdventure Integration</h3>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="mb-1 text-xs text-muted">Embed URL (Dashboard)</p>
            <code className="text-xs text-primary">
              {process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id"}/embed?token=ACCESS_TOKEN
            </code>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="mb-1 text-xs text-muted">Embed URL (Tasks)</p>
            <code className="text-xs text-primary">
              {process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id"}/embed/tasks?token=ACCESS_TOKEN
            </code>
          </div>
          <p className="text-xs text-muted">
            Gunakan URL ini di WorkAdventure Map (Tiled) sebagai properti <code className="text-primary">openTab</code> pada objek interaktif.
          </p>
        </div>
      </div>

      <div className="flex min-h-[20vh] flex-col items-center justify-center text-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Construction size={14} />
          Pengaturan lainnya sedang dalam pengembangan
        </div>
      </div>
    </div>
  );
}