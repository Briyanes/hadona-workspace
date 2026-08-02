import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Activity Logger Helper
 * Reusable function untuk log aktivitas user ke tabel activity_logs
 */

type ActionType =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "assign"
  | "approve"
  | "reject"
  | "invite"
  | "login";

type EntityType =
  | "task"
  | "client"
  | "report"
  | "ad_account"
  | "creative_request"
  | "user"
  | "content_plan"
  | "strategy"
  | "invoice";

interface LogActivityParams {
  supabase: SupabaseClient;
  userId: string;
  action: ActionType;
  entityType: EntityType;
  description: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log aktivitas user ke tabel activity_logs
 * Fire-and-forget (tidak throw error jika gagal)
 */
export async function logActivity({
  supabase,
  userId,
  action,
  entityType,
  description,
  entityId,
  metadata,
}: LogActivityParams) {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description,
      metadata: metadata || {},
    });

    if (error) {
      console.error("[logActivity] Failed to log:", error.message);
    }
  } catch (err) {
    // Silent fail — activity logging should never break main operation
    console.error(
      "[logActivity] Error:",
      err instanceof Error ? err.message : "Unknown"
    );
  }
}