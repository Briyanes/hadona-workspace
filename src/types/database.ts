// ============================================
// HADONA WORKSPACE - SUPABASE DATABASE TYPES
// Auto-generated schema types for Supabase
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: string;
          division: string[] | null;
          avatar_url: string | null;
          phone: string | null;
          is_active: boolean;
          two_factor_enabled: boolean;
          two_factor_secret: string | null;
          two_factor_backup_codes: string[] | null;
          two_factor_enabled_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: string;
          division?: string[] | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
          two_factor_enabled?: boolean;
          two_factor_secret?: string | null;
          two_factor_backup_codes?: string[] | null;
          two_factor_enabled_at?: string | null;
        };
        Update: {
          email?: string;
          full_name?: string;
          role?: string;
          division?: string[] | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
          two_factor_enabled?: boolean;
          two_factor_secret?: string | null;
          two_factor_backup_codes?: string[] | null;
          two_factor_enabled_at?: string | null;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          name: string;
          slug: string;
          industry: string | null;
          status: string;
          contact_person: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          services: string[];
          notes: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          slug?: string;
          industry?: string | null;
          status?: string;
          contact_person?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          services?: string[];
          notes?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          industry?: string | null;
          status?: string;
          contact_person?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          services?: string[];
          notes?: string | null;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          client_id: string | null;
          title: string;
          description: string | null;
          result: string | null;
          status: string;
          priority: string;
          division: string | null;
          start_date: string | null;
          due_date: string | null;
          notes: string | null;
          approval_status: string | null;
          approved_by: string | null;
          approved_at: string | null;
          approval_note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          title: string;
          description?: string | null;
          result?: string | null;
          status?: string;
          priority?: string;
          division?: string | null;
          start_date?: string | null;
          due_date?: string | null;
          notes?: string | null;
          approval_status?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          approval_note?: string | null;
          created_by: string;
        };
        Update: {
          client_id?: string | null;
          title?: string;
          description?: string | null;
          result?: string | null;
          status?: string;
          priority?: string;
          division?: string | null;
          start_date?: string | null;
          due_date?: string | null;
          notes?: string | null;
          approval_status?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          approval_note?: string | null;
        };
        Relationships: [
          { foreignKeyName: "tasks_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "tasks_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "tasks_approved_by_fkey"; columns: ["approved_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      subtasks: {
        Row: {
          id: string;
          task_id: string;
          title: string;
          is_completed: boolean;
          created_by: string | null;
          order_index: number;
          created_at: string;
        };
        Insert: {
          task_id: string;
          title: string;
          is_completed?: boolean;
          created_by?: string | null;
          order_index?: number;
        };
        Update: {
          title?: string;
          is_completed?: boolean;
          order_index?: number;
        };
        Relationships: [
          { foreignKeyName: "subtasks_task_id_fkey"; columns: ["task_id"]; referencedRelation: "tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "subtasks_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      timesheets: {
        Row: {
          id: string;
          user_id: string;
          task_id: string | null;
          client_id: string | null;
          date: string;
          hours: number;
          activity_type: string | null;
          description: string | null;
          billable: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          task_id?: string | null;
          client_id?: string | null;
          date?: string;
          hours?: number;
          activity_type?: string | null;
          description?: string | null;
          billable?: boolean;
        };
        Update: {
          task_id?: string | null;
          client_id?: string | null;
          date?: string;
          hours?: number;
          activity_type?: string | null;
          description?: string | null;
          billable?: boolean;
        };
        Relationships: [
          { foreignKeyName: "timesheets_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "timesheets_task_id_fkey"; columns: ["task_id"]; referencedRelation: "tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "timesheets_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] }
        ];
      };
      task_assignees: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
        };
        Insert: { task_id: string; user_id: string };
        Update: { task_id?: string; user_id?: string };
        Relationships: [
          { foreignKeyName: "task_assignees_task_id_fkey"; columns: ["task_id"]; referencedRelation: "tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "task_assignees_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          comment: string;
          created_at: string;
        };
        Insert: { task_id: string; user_id: string; comment: string };
        Update: { comment?: string };
        Relationships: [];
      };
      ad_accounts: {
        Row: {
          id: string;
          client_id: string;
          platform: string;
          ad_account_id: string;
          account_name: string | null;
          objective: string | null;
          daily_budget: number | null;
          remaining_budget: number | null;
          days_left: number | null;
          status: string;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          platform: string;
          ad_account_id: string;
          account_name?: string | null;
          objective?: string | null;
          daily_budget?: number | null;
          remaining_budget?: number | null;
          days_left?: number | null;
          status?: string;
          notes?: string | null;
        };
        Update: {
          platform?: string;
          ad_account_id?: string;
          account_name?: string | null;
          objective?: string | null;
          daily_budget?: number | null;
          remaining_budget?: number | null;
          days_left?: number | null;
          status?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      weekly_reports: {
        Row: {
          id: string;
          client_id: string;
          pic_id: string;
          period_start: string;
          period_end: string;
          summary: string | null;
          performance_text: string | null;
          conclusion: string | null;
          action: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          client_id: string;
          pic_id: string;
          period_start: string;
          period_end: string;
          summary?: string | null;
          performance_text?: string | null;
          conclusion?: string | null;
          action?: string | null;
          status?: string;
        };
        Update: {
          period_start?: string;
          period_end?: string;
          summary?: string | null;
          performance_text?: string | null;
          conclusion?: string | null;
          action?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      report_metrics: {
        Row: {
          id: string;
          weekly_report_id: string;
          metric_type: string;
          value: number | null;
          previous_value: number | null;
        };
        Insert: {
          weekly_report_id: string;
          metric_type: string;
          value?: number | null;
          previous_value?: number | null;
        };
        Update: {
          metric_type?: string;
          value?: number | null;
          previous_value?: number | null;
        };
        Relationships: [];
      };
      client_strategies: {
        Row: {
          id: string;
          client_id: string;
          title: string;
          description: string | null;
          deck_url: string | null;
          plan_url: string | null;
          service_type: string | null;
          period: string | null;
          created_at: string;
        };
        Insert: {
          client_id: string;
          title: string;
          description?: string | null;
          deck_url?: string | null;
          plan_url?: string | null;
          service_type?: string | null;
          period?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          deck_url?: string | null;
          plan_url?: string | null;
          service_type?: string | null;
          period?: string | null;
        };
        Relationships: [];
      };
      strategy_objectives: {
        Row: {
          id: string;
          strategy_id: string;
          objective_text: string;
          order_index: number;
        };
        Insert: {
          strategy_id: string;
          objective_text: string;
          order_index?: number;
        };
        Update: {
          objective_text?: string;
          order_index?: number;
        };
        Relationships: [];
      };
      strategy_key_results: {
        Row: {
          id: string;
          objective_id: string;
          key_result_text: string;
          target_value: string | null;
          current_value: string | null;
          order_index: number;
        };
        Insert: {
          objective_id: string;
          key_result_text: string;
          target_value?: string | null;
          current_value?: string | null;
          order_index?: number;
        };
        Update: {
          key_result_text?: string;
          target_value?: string | null;
          current_value?: string | null;
          order_index?: number;
        };
        Relationships: [];
      };
      creative_requests: {
        Row: {
          id: string;
          client_id: string | null;
          request_date: string;
          objective_campaign: string | null;
          funnel: string | null;
          format: string | null;
          angle: string | null;
          content_url: string | null;
          caption: string | null;
          prefilled_message: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          client_id?: string | null;
          request_date: string;
          objective_campaign?: string | null;
          funnel?: string | null;
          format?: string | null;
          angle?: string | null;
          content_url?: string | null;
          caption?: string | null;
          prefilled_message?: string | null;
          status?: string;
        };
        Update: {
          client_id?: string | null;
          objective_campaign?: string | null;
          funnel?: string | null;
          format?: string | null;
          angle?: string | null;
          content_url?: string | null;
          caption?: string | null;
          prefilled_message?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      content_plans: {
        Row: {
          id: string;
          client_id: string;
          month: string;
          plan_url: string | null;
          services: string[];
          notes: string | null;
          created_at: string;
        };
        Insert: {
          client_id: string;
          month: string;
          plan_url?: string | null;
          services?: string[];
          notes?: string | null;
        };
        Update: {
          month?: string;
          plan_url?: string | null;
          services?: string[];
          notes?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          metadata: Json | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type?: string;
          title: string;
          body?: string | null;
          link?: string | null;
          metadata?: Json | null;
          is_read?: boolean;
        };
        Update: {
          type?: string;
          title?: string;
          body?: string | null;
          link?: string | null;
          metadata?: Json | null;
          is_read?: boolean;
        };
        Relationships: [
          { foreignKeyName: "notifications_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      budget_alerts: {
        Row: {
          id: string;
          client_id: string | null;
          ad_account_id: string | null;
          threshold_pct: number;
          current_spend: number;
          monthly_budget: number;
          alert_type: string;
          message: string | null;
          is_acknowledged: boolean;
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          created_at: string;
        };
        Insert: {
          client_id?: string | null;
          ad_account_id?: string | null;
          threshold_pct?: number;
          current_spend?: number;
          monthly_budget?: number;
          alert_type?: string;
          message?: string | null;
          is_acknowledged?: boolean;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
        };
        Update: {
          client_id?: string | null;
          ad_account_id?: string | null;
          threshold_pct?: number;
          current_spend?: number;
          monthly_budget?: number;
          alert_type?: string;
          message?: string | null;
          is_acknowledged?: boolean;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "budget_alerts_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] }
        ];
      };
      client_contracts: {
        Row: {
          id: string;
          client_id: string;
          contract_number: string | null;
          start_date: string;
          end_date: string;
          minimum_months: number;
          status: string;
          contract_type: string;
          notes: string | null;
          signed_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          start_date: string;
          end_date: string;
          minimum_months?: number;
          status?: string;
          contract_type?: string;
          notes?: string | null;
          signed_url?: string | null;
          created_by?: string | null;
        };
        Update: {
          start_date?: string;
          end_date?: string;
          minimum_months?: number;
          status?: string;
          contract_type?: string;
          notes?: string | null;
          signed_url?: string | null;
        };
        Relationships: [
          { foreignKeyName: "client_contracts_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "client_contracts_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      contract_services: {
        Row: {
          id: string;
          contract_id: string;
          service_name: string;
          monthly_fee: number;
          effective_from: string;
          effective_to: string | null;
          status: string;
          added_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          contract_id: string;
          service_name: string;
          monthly_fee?: number;
          effective_from?: string;
          effective_to?: string | null;
          status?: string;
          added_by?: string | null;
          notes?: string | null;
        };
        Update: {
          service_name?: string;
          monthly_fee?: number;
          effective_from?: string;
          effective_to?: string | null;
          status?: string;
          notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: "contract_services_contract_id_fkey"; columns: ["contract_id"]; referencedRelation: "client_contracts"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_services_added_by_fkey"; columns: ["added_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      contract_billings: {
        Row: {
          id: string;
          contract_id: string;
          client_id: string;
          billing_period: string;
          total_amount: number;
          tax_amount: number;
          grand_total: number;
          status: string;
          due_date: string | null;
          paid_at: string | null;
          payment_method: string | null;
          payment_ref: string | null;
          invoice_url: string | null;
          services_snapshot: Json | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          contract_id: string;
          client_id: string;
          billing_period: string;
          total_amount?: number;
          tax_amount?: number;
          grand_total?: number;
          status?: string;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          payment_ref?: string | null;
          invoice_url?: string | null;
          services_snapshot?: Json | null;
          notes?: string | null;
        };
        Update: {
          total_amount?: number;
          tax_amount?: number;
          grand_total?: number;
          status?: string;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          payment_ref?: string | null;
          invoice_url?: string | null;
          services_snapshot?: Json | null;
          notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: "contract_billings_contract_id_fkey"; columns: ["contract_id"]; referencedRelation: "client_contracts"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_billings_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] }
        ];
      };
      chat_channels: {
        Row: {
          id: string;
          name: string;
          type: string;
          division: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          type?: string;
          division?: string | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          type?: string;
          division?: string | null;
          created_by?: string | null;
        };
        Relationships: [
          { foreignKeyName: "chat_channels_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          content: string;
          message_type: string;
          metadata: Json;
          reply_to: string | null;
          created_at: string;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          content: string;
          message_type?: string;
          metadata?: Json;
          reply_to?: string | null;
        };
        Update: {
          content?: string;
          message_type?: string;
          metadata?: Json;
          reply_to?: string | null;
        };
        Relationships: [
          { foreignKeyName: "chat_messages_channel_id_fkey"; columns: ["channel_id"]; referencedRelation: "chat_channels"; referencedColumns: ["id"] },
          { foreignKeyName: "chat_messages_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "chat_messages_reply_to_fkey"; columns: ["reply_to"]; referencedRelation: "chat_messages"; referencedColumns: ["id"] }
        ];
      };
      chat_read_receipts: {
        Row: {
          user_id: string;
          channel_id: string;
          last_read_at: string;
        };
        Insert: {
          user_id: string;
          channel_id: string;
          last_read_at?: string;
        };
        Update: {
          last_read_at?: string;
        };
        Relationships: [
          { foreignKeyName: "chat_read_receipts_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "chat_read_receipts_channel_id_fkey"; columns: ["channel_id"]; referencedRelation: "chat_channels"; referencedColumns: ["id"] }
        ];
      };
      content_uploads: {
        Row: {
          id: string;
          client_id: string | null;
          upload_date: string;
          division: string | null;
          brief_no: string | null;
          caption: string | null;
          content_link: string | null;
          status: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          upload_date?: string;
          division?: string | null;
          brief_no?: string | null;
          caption?: string | null;
          content_link?: string | null;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          client_id?: string | null;
          upload_date?: string;
          division?: string | null;
          brief_no?: string | null;
          caption?: string | null;
          content_link?: string | null;
          status?: string;
          notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: "content_uploads_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "content_uploads_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      caption_bank: {
        Row: {
          id: string;
          client_id: string | null;
          product: string | null;
          theme: string | null;
          headline: string | null;
          caption: string | null;
          hashtags: string | null;
          performance: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          product?: string | null;
          theme?: string | null;
          headline?: string | null;
          caption?: string | null;
          hashtags?: string | null;
          performance?: string;
          created_by?: string | null;
        };
        Update: {
          client_id?: string | null;
          product?: string | null;
          theme?: string | null;
          headline?: string | null;
          caption?: string | null;
          hashtags?: string | null;
          performance?: string;
        };
        Relationships: [
          { foreignKeyName: "caption_bank_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "caption_bank_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}