"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import UploadTracker from "@/components/content-studio/upload-tracker";
import CaptionBank from "@/components/content-studio/caption-bank";
import AdsManager from "@/components/content-studio/ads-manager";
import { Upload, FileText, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "uploads" | "captions" | "ads";

export default function ContentStudioPage() {
  const [tab, setTab] = useState<Tab>("uploads");
  const [stats, setStats] = useState({ totalUploads: 0, doneUploads: 0, totalCaptions: 0 });
  // eslint-disable-next-line
  const supabase = createClient() as any;

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [uploadsRes, captionsRes] = await Promise.all([
        supabase.from("content_uploads").select("status"),
        supabase.from("caption_bank").select("id"),
      ]);
      const uploads = uploadsRes.data || [];
      const captions = captionsRes.data || [];
      setStats({
        totalUploads: uploads.length,
        doneUploads: uploads.filter((u: { status: string }) => u.status === "done").length,
        totalCaptions: captions.length,
      });
    } catch {
      // tables might not exist yet
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Content Studio" subtitle="Kelola content uploads, caption bank & ads manager" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <Upload className="mb-2 text-primary" size={18} />
          <p className="text-xl font-bold text-foreground">{stats.totalUploads}</p>
          <p className="text-xs text-muted">Total Uploads</p>
        </div>
        <div className="card p-4">
          <Upload className="mb-2 text-success" size={18} />
          <p className="text-xl font-bold text-success">{stats.doneUploads}</p>
          <p className="text-xs text-muted">Completed</p>
        </div>
        <div className="card p-4">
          <FileText className="mb-2 text-accent" size={18} />
          <p className="text-xl font-bold text-foreground">{stats.totalCaptions}</p>
          <p className="text-xs text-muted">Caption Bank</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("uploads")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === "uploads"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <Upload size={16} /> Upload Tracker
          </button>
          <button
            onClick={() => setTab("captions")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === "captions"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <FileText size={16} /> Caption Bank
          </button>
          <button
            onClick={() => setTab("ads")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === "ads"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <Megaphone size={16} /> Ads Manager
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === "uploads" ? <UploadTracker /> : tab === "captions" ? <CaptionBank /> : <AdsManager />}
    </div>
  );
}