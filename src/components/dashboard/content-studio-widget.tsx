"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Upload, MessageSquare, Loader2, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

interface UploadStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
}

interface CaptionStats {
  total: number;
  good: number;
  poor: number;
  untested: number;
}

export function ContentStudioWidget() {
  const supabase = createClient();
  const [uploads, setUploads] = useState<UploadStats | null>(null);
  const [captions, setCaptions] = useState<CaptionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Fetch content uploads
      const { data: uploadData } = await supabase
        .from("content_uploads")
        .select("status");

      const uploadStats: UploadStats = { total: 0, todo: 0, inProgress: 0, done: 0 };
      (uploadData || []).forEach((u: { status: string }) => {
        uploadStats.total++;
        if (u.status === "todo") uploadStats.todo++;
        else if (u.status === "in-progress") uploadStats.inProgress++;
        else if (u.status === "done") uploadStats.done++;
      });
      setUploads(uploadStats);

      // Fetch caption bank
      const { data: captionData } = await supabase
        .from("caption_bank")
        .select("performance");

      const capStats: CaptionStats = { total: 0, good: 0, poor: 0, untested: 0 };
      (captionData || []).forEach((c: { performance: string }) => {
        capStats.total++;
        if (c.performance === "good") capStats.good++;
        else if (c.performance === "poor") capStats.poor++;
        else capStats.untested++;
      });
      setCaptions(capStats);
    } catch (err) {
      console.error("Content Studio widget error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Upload size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Content Studio</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      </div>
    );
  }

  const uploadRate = uploads && uploads.total > 0
    ? Math.round((uploads.done / uploads.total) * 100)
    : 0;
  const captionGoodRate = captions && captions.total > 0
    ? Math.round((captions.good / captions.total) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Upload Tracker Widget */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">SMM Upload Tracker</h3>
          </div>
          <Link href="/creative" className="text-xs text-primary hover:underline">
            Detail
          </Link>
        </div>

        {uploads && uploads.total > 0 ? (
          <>
            {/* Progress bar */}
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">Completion Rate</span>
                <span className="font-bold text-foreground">{uploadRate}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${uploadRate}%` }}
                />
              </div>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 rounded-md bg-muted/10 px-2 py-1">
                <Clock size={12} className="text-muted" />
                <span className="text-xs font-medium text-muted">{uploads.todo} Todo</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1">
                <Loader2 size={12} className="text-warning" />
                <span className="text-xs font-medium text-warning">{uploads.inProgress} Progress</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1">
                <CheckCircle2 size={12} className="text-success" />
                <span className="text-xs font-medium text-success">{uploads.done} Done</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
                <Upload size={12} className="text-primary" />
                <span className="text-xs font-medium text-primary">{uploads.total} Total</span>
              </div>
            </div>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted">Belum ada data upload</p>
        )}
      </div>

      {/* Caption Bank Widget */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-accent" />
            <h3 className="text-sm font-bold text-foreground">Caption Bank Performance</h3>
          </div>
          <Link href="/creative" className="text-xs text-primary hover:underline">
            Detail
          </Link>
        </div>

        {captions && captions.total > 0 ? (
          <>
            {/* Good rate */}
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">Good Performance Rate</span>
                <span className="flex items-center gap-1 font-bold text-success">
                  <TrendingUp size={12} />
                  {captionGoodRate}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${captionGoodRate}%` }}
                />
              </div>
            </div>

            {/* Performance distribution */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-xs text-muted">Good</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-success"
                      style={{ width: `${(captions.good / captions.total) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-bold text-foreground">{captions.good}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-muted" />
                  <span className="text-xs text-muted">Untested</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-muted"
                      style={{ width: `${(captions.untested / captions.total) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-bold text-foreground">{captions.untested}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-danger" />
                  <span className="text-xs text-muted">Poor</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-danger"
                      style={{ width: `${(captions.poor / captions.total) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-bold text-foreground">{captions.poor}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 border-t border-border pt-2 text-center">
              <span className="text-[10px] text-muted">Total: </span>
              <span className="text-xs font-bold text-foreground">{captions.total} captions</span>
            </div>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted">Belum ada data caption bank</p>
        )}
      </div>
    </div>
  );
}