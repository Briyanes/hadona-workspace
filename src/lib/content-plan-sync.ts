/**
 * Shared workflow sync: Content Plans ↔ Task Manager (divisi Editor).
 *
 * Aturan status (progress plan → task editor via tasks.sheet_row_id):
 * - "proses_edit" → pastikan task editor ada (buat bila belum; reopen bila done/blocked)
 * - "done"        → task editor ikut selesai (status: done)
 * - "cancel"      → task editor di-hold (status: blocked — tidak dihapus, histori tetap ada)
 * - "draft"       → task aktif (todo/in_progress) DIHAPUS dari board Editor
 *                   (plan draft belum pasti dieksekusi); task done/blocked dibiarkan
 *                   sebagai histori. Task dibuat ulang otomatis saat plan kembali
 *                   ke "proses_edit".
 *
 * Arah sebaliknya (editor drag task → done) disinkronkan via trigger DB
 * (supabase/migration-v101.sql). Modul ini tetap melakukan update yang sama
 * secara idempoten agar tetap bekerja sebelum migration dijalankan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Loosely-typed agar menerima browser client (Database generics @supabase/ssr)
// maupun server client tanpa konflik invariance antar versi supabase-js.
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;

export interface PlanTaskInfo {
  id: string;
  client_id: string;
  client_name?: string;
  pilar?: string | null;
  konten?: string | null;
  tema?: string | null;
  details?: string | null;
  reference?: string | null;
  tanggal_upload?: string | null;
}

export type PlanTaskSyncAction = "created" | "updated" | "reopened" | "none" | "error";

export interface PlanTaskSyncResult {
  action: PlanTaskSyncAction;
  message?: string;
}

export function planLinkKey(planId: string): string {
  return `content_plan:${planId}`;
}

function buildDescription(plan: PlanTaskInfo): string | null {
  const parts: string[] = [];
  if (plan.pilar) parts.push(`Pilar: ${plan.pilar}`);
  if (plan.konten) parts.push(`Konten: ${plan.konten}`);
  if (plan.tema) parts.push(`Tema: ${plan.tema}`);
  if (plan.details) parts.push("", "Details:", plan.details);
  if (plan.reference) parts.push("", `Reference: ${plan.reference}`);
  return parts.join("\n") || null;
}

/**
 * Sinkronkan status plan → task editor. Idempoten & aman dipanggil berulang.
 * Tidak pernah melempar error (caller cukup cek `action` untuk toast).
 */
export async function syncTaskForPlan(
  supabase: AnySupabaseClient,
  plan: PlanTaskInfo,
  progressKey: string
): Promise<PlanTaskSyncResult> {
  try {
    if (!plan?.id) return { action: "none" };
    const linkKey = planLinkKey(plan.id);

    if (progressKey === "proses_edit") {
      const { data: existing, error: selErr } = await supabase
        .from("tasks")
        .select("id, status")
        .eq("sheet_row_id", linkKey)
        .limit(1)
        .maybeSingle();

      if (selErr) throw new Error(selErr.message);

      if (existing) {
        // Task sudah ada — reopen bila sebelumnya done/blocked (plan kembali diproses)
        if (existing.status === "done" || existing.status === "blocked") {
          const { error } = await supabase
            .from("tasks")
            .update({ status: "todo" })
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          return { action: "reopened", message: "Task editor dibuka kembali (To Do)" };
        }
        return { action: "none" };
      }

      const { data: userData } = await supabase.auth.getUser();
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          title: `[Content] ${plan.client_name || "Client"} — ${plan.tema || plan.konten || "Content Plan"}`,
          description: buildDescription(plan),
          client_id: plan.client_id || null,
          priority: "medium",
          status: "todo",
          division: "Editor",
          due_date: plan.tanggal_upload || null,
          created_by: userData.user?.id,
          sheet_row_id: linkKey,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return task
        ? { action: "created", message: "Task editor dibuat di Task Manager (divisi Editor)" }
        : { action: "error", message: "Task tidak terbentuk" };
    }

    if (progressKey === "done" || progressKey === "cancel") {
      const target = progressKey === "done" ? "done" : "blocked";
      // Update + select agar terdeteksi bila TIDAK ada task ter-link
      // (mencegah toast palsu "Task editor ditandai selesai")
      const { data: updated, error } = await supabase
        .from("tasks")
        .update({ status: target })
        .eq("sheet_row_id", linkKey)
        .neq("status", target)
        .select("id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) return { action: "none" };
      return {
        action: "updated",
        message: progressKey === "done" ? "Task editor ditandai selesai" : "Task editor di-hold (Blocked)",
      };
    }

    if (progressKey === "draft") {
      // Plan kembali ke draft → hapus task AKTIF dari board Editor (belum pasti dieksekusi).
      // Task done/blocked dibiarkan (histori). Saat plan aktif lagi (proses_edit),
      // task dibuat ulang otomatis oleh cabang di atas.
      const { data: deleted, error } = await supabase
        .from("tasks")
        .delete()
        .eq("sheet_row_id", linkKey)
        .in("status", ["todo", "in_progress"])
        .select("id");
      if (error) throw new Error(error.message);
      if (!deleted || deleted.length === 0) return { action: "none" };
      return { action: "updated", message: "Task editor dihapus (plan kembali ke Draft)" };
    }

    return { action: "none" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Sync task error:", err);
    return { action: "error", message: msg };
  }
}

/** Toast standar hasil sync (dipakai page + modal). */
export function toastSyncResult(res: PlanTaskSyncResult, fallbackToast: {
  success: (m: string) => void;
  warning: (m: string) => void;
}) {
  if (res.action === "created" || res.action === "updated" || res.action === "reopened") {
    fallbackToast.success(res.message || "Task editor disinkronkan");
  } else if (res.action === "error") {
    fallbackToast.warning("Plan tersimpan, tapi sinkronisasi task editor gagal: " + (res.message || ""));
  }
  // action === "none" → diam saja (tidak ada perubahan task)
}