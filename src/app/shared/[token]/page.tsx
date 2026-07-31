import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ReportView } from "./report-view";

/**
 * Server component: fetch report server-side untuk generate OG meta tags
 * + render client view.
 */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getReportByToken(token: string) {
  const supabase = getAdminClient();
  const { data: shareLink, error } = await supabase
    .from("shared_reports")
    .select("report_id, is_active, expires_at")
    .eq("token", token)
    .single();

  if (error || !shareLink) return null;
  if (!shareLink.is_active) return null;
  if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) return null;

  const { data: report } = await supabase
    .from("weekly_reports")
    .select("period_start, period_end, status, client:clients(name)")
    .eq("id", shareLink.report_id)
    .single();

  if (!report) return null;

  // Supabase return array untuk nested relation — normalize ke object
  const clientArr = report.client as unknown as { name: string }[] | null;
  return {
    ...report,
    client: Array.isArray(clientArr) && clientArr.length > 0 ? clientArr[0] : null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const report = await getReportByToken(token);

  if (!report) {
    return {
      title: "Weekly Report — Hadona Workspace",
      description: "Laporan performa iklan mingguan",
    };
  }

  const clientName = report.client?.name || "Client";
  const periodText = `${new Date(report.period_start).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  })} - ${new Date(report.period_end).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const title = `Weekly Report ${clientName} (${periodText})`;
  const description = `Laporan performa iklan ${clientName} periode ${periodText}. Hadona Workspace.`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://workspace.hadona.id";
  const ogImageUrl = `${siteUrl}/api/reports/og?token=${token}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteUrl}/shared/${token}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Weekly Report ${clientName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();
  return <ReportView token={token} />;
}