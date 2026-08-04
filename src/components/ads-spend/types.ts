// ============================================
// ADS SPEND — Shared Types
// ============================================

export interface AdAccount {
  id: string;
  platform: string;
  ad_account_id: string;
  account_name: string | null;
  objective: string | null;
  daily_budget: number | null;
  remaining_budget: number | null;
  days_left: number | null;
  status: string;
  notes: string | null;
  client_id: string;
  pic_id: string | null;
  meta_sync_enabled?: boolean | null;
  meta_connection_id?: string | null;
  client?: { name: string };
  pic?: { full_name: string | null } | null;
}

export interface SpendLog {
  id: string;
  ad_account_id: string;
  log_date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  notes: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
}

export interface TeamMember {
  id: string;
  full_name: string | null;
}

export interface MetaConnection {
  id: string;
  fb_user_name: string | null;
  is_active: boolean;
  auto_sync: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  token_expires_at: string | null;
  token_status?: string | null; // valid | expiring_soon | invalid | unknown
}

export interface TrendData {
  date: string;
  spend: number;
  revenue: number;
}

export interface AdAccountForm {
  client_id: string;
  platform: string;
  ad_account_id: string;
  account_name: string;
  objective: string;
  daily_budget: string;
  remaining_budget: string;
  status: string;
  notes: string;
  pic_id: string;
}

export interface SpendForm {
  log_date: string;
  spend: string;
  impressions: string;
  clicks: string;
  conversions: string;
  revenue: string;
  notes: string;
}

export const emptyAdAccountForm: AdAccountForm = {
  client_id: "",
  platform: "META",
  ad_account_id: "",
  account_name: "",
  objective: "",
  daily_budget: "",
  remaining_budget: "",
  status: "active",
  notes: "",
  pic_id: "",
};

export const emptySpendForm: SpendForm = {
  log_date: new Date().toISOString().split("T")[0],
  spend: "",
  impressions: "",
  clicks: "",
  conversions: "",
  revenue: "",
  notes: "",
};

export interface AssignResult {
  matched: number;
  clients_created: number;
  already_assigned: number;
  duplicates: number;
  no_match: number;
  matched_details: { client: string; nomorAkun: string; accountName: string | null; action: string }[];
  no_match_details: { client: string; nomorAkun: string }[];
}

export function calcDaysLeft(remaining: number | null, daily: number | null): number | null {
  if (!remaining || !daily || daily <= 0) return null;
  return Math.floor(remaining / daily);
}