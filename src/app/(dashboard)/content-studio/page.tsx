"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import AdsCaptionBank from "@/components/content-studio/ads-caption-bank";
import AdsContentClusters from "@/components/content-studio/ads-content-clusters";
import AdsCreativeRequests from "@/components/content-studio/ads-creative-requests";
import { BookMarked, Boxes, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "requests" | "captions" | "clusters";

export default function ContentStudioPage() {
  const [tab, setTab] = useState<Tab>("requests");
  const [stats, setStats] = useState({ totalRequests: 0, totalCaptions: 0, totalClusters: 0 });
  // eslint-disable-next-line
  const supabase = createClient() as any;

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [reqRes, captionsRes, clustersRes] = await Promise.all([
        supabase.from("ads_creative_requests").select("id"),
        supabase.from("ads_captions").select("id"),
        supabase.from("ads_content_clusters").select("id"),
      ]);
      setStats({
        totalRequests: (reqRes.data || []).length,
        totalCaptions: (captionsRes.data || []).length,
        totalClusters: (clustersRes.data || []).length,
      });
    } catch {
      // tables might not exist yet
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ads Content Studio" subtitle="Creative request, banking caption & clustering content untuk divisi Copywriter & Advertiser" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <ClipboardList className="mb-2 text-orange-500" size={18} />
          <p className="text-xl font-bold text-foreground">{stats.totalRequests}</p>
          <p className="text-xs text-muted">Creative Request</p>
        </div>
        <div className="card p-4">
          <BookMarked className="mb-2 text-primary" size={18} />
          <p className="text-xl font-bold text-foreground">{stats.totalCaptions}</p>
          <p className="text-xs text-muted">Banking Caption</p>
        </div>
        <div className="card p-4">
          <Boxes className="mb-2 text-accent" size={18} />
          <p className="text-xl font-bold text-foreground">{stats.totalClusters}</p>
          <p className="text-xs text-muted">Clustering Content</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          <button
            onClick={() => setTab("requests")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
              tab === "requests"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <ClipboardList size={16} /> Creative Request
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
            <BookMarked size={16} /> Banking Caption
          </button>
          <button
            onClick={() => setTab("clusters")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === "clusters"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <Boxes size={16} /> Clustering Content
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {tab === "requests" ? (
          <AdsCreativeRequests />
        ) : tab === "captions" ? (
          <AdsCaptionBank />
        ) : (
          <AdsContentClusters />
        )}
      </div>
    </div>
  );
}