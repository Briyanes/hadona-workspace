// ============================================
// HADONA WORKSPACE - TYPE DEFINITIONS
// ============================================

export type UserRole = "super_admin" | "admin" | "project_manager" | "creative_director" | "advertiser" | "account_executive" | "designer" | "copywriter" | "developer";

export type Division = "Creative Director" | "Advertiser" | "Account Executive" | "Designer" | "Copywriter" | "Developer" | "Production";

export type ClientStatus = "active" | "inactive" | "hold" | "onboarding";

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type AdPlatform = "META" | "Google" | "TikTok";
export type AdAccountStatus = "active" | "inactive" | "hold";
export type AdObjective = "CTWA" | "CPAS" | "GSN" | "CT_LP_TO_WA" | "CT_WEBSITE_PURCHASE" | "TRAFFIC" | "AWARENESS" | "OTHER";

export type ReportStatus = "draft" | "submitted" | "reviewed";

export type ApprovalStatus = "pending_onboarding" | "pending_approval" | "approved" | "rejected";

export type CreativeRequestStatus = "requested" | "in_progress" | "review" | "approved" | "rejected";
export type FunnelStage = "awareness" | "consideration" | "conversion" | "retention";

export type MetricType = "spend" | "cpr" | "results" | "ctr" | "frequency" | "impressions" | "clicks" | "cost_per_follower" | "new_followers" | "purchase" | "wa_leads" | "link_clicks";

// ---- Database Entities ----

export interface NotificationPrefs {
  email_task: boolean;
  email_report: boolean;
  email_daily: boolean;
  email_weekly: boolean;
  telegram_enabled: boolean;
  telegram_webhook: string | null;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: "id" | "en";
  timezone: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  division: Division[] | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
  notification_prefs: NotificationPrefs | null;
  preferences: UserPreferences | null;
  is_active: boolean;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: ClientStatus;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  services: string[];
  notes: string | null;
  created_at: string;
  sort_order?: number | null;
}

export interface Task {
  id: string;
  client_id: string | null;
  client?: Client;
  title: string;
  description: string | null;
  result: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  division: Division | null;
  assignees: Profile[];
  start_date: string | null;
  due_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user?: Profile;
  comment: string;
  created_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  order_index: number;
  created_by: string | null;
  created_at: string;
}

export interface AdAccount {
  id: string;
  client_id: string;
  client?: Client;
  platform: AdPlatform;
  ad_account_id: string;
  account_name: string | null;
  objective: AdObjective | null;
  daily_budget: number | null;
  remaining_budget: number | null;
  days_left: number | null;
  status: AdAccountStatus;
  notes: string | null;
  updated_at: string;
}

// 🆕 P4: Data status flag untuk transparansi kelengkapan data.
//   - 'ok'           → metrics lengkap
//   - 'no_metrics'   → narrative only (ada text, tanpa angka)
//   - 'partial'      → metric < 3 (data tidak lengkap)
//   - 'synced_error' → sync gagal parse, data mungkin unreliable
export type ReportDataStatus = "ok" | "no_metrics" | "partial" | "synced_error";

// 🆕 P4: Sumber data report.
//   - 'sheet_auto'   → di-import otomatis oleh sync engine (cron/manual sync)
//   - 'sheet_manual' → di-import satu kali via tombol "Import Sheet"
//   - 'manual_entry' → diinput manual user via form
export type ReportDataSourceKind = "sheet_auto" | "sheet_manual" | "manual_entry";

export interface WeeklyReport {
  id: string;
  client_id: string;
  client?: Client;
  pic_id: string;
  pic?: Profile;
  period_start: string;
  period_end: string;
  summary: string | null;
  performance_text: string | null;
  conclusion: string | null;
  action: string | null;
  status: ReportStatus;
  created_at: string;
  // 🆕 P4: Sheet source & data provenance tracking
  source_sheet_url?: string | null;
  sheet_source?: string | null;
  sheet_gid?: string | null;
  last_synced_at?: string | null;
  data_status?: ReportDataStatus;
  data_source_kind?: ReportDataSourceKind;
}

export interface ReportMetric {
  id: string;
  weekly_report_id: string;
  metric_type: MetricType;
  value: number | null;
  previous_value: number | null;
}

export interface ClientStrategy {
  id: string;
  client_id: string;
  client?: Client;
  title: string;
  description: string | null;
  deck_url: string | null;
  plan_url: string | null;
  service_type: string | null;
  period: string | null;
  created_at: string;
}

export interface StrategyObjective {
  id: string;
  strategy_id: string;
  objective_text: string;
  order_index: number;
}

export interface StrategyKeyResult {
  id: string;
  objective_id: string;
  key_result_text: string;
  target_value: string | null;
  current_value: string | null;
  order_index: number;
}

export interface CreativeRequest {
  id: string;
  client_id: string | null;
  client?: Client;
  request_date: string;
  objective_campaign: string | null;
  funnel: FunnelStage | null;
  format: string | null;
  angle: string | null;
  content_url: string | null;
  caption: string | null;
  prefilled_message: string | null;
  status: CreativeRequestStatus;
  created_at: string;
}

export interface ContentPlan {
  id: string;
  client_id: string;
  client?: Client;
  month: string;
  plan_url: string | null;
  services: string[];
  notes: string | null;
  created_at: string;
}

export interface FileAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  created_at: string;
}

export type NotificationType = "task_assigned" | "task_updated" | "report_deadline" | "mention" | "general";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}
