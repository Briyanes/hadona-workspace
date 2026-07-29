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
          division: string | null;
          avatar_url: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: string;
          division?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
        };
        Update: {
          email?: string;
          full_name?: string;
          role?: string;
          division?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
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
        };
        Relationships: [
          { foreignKeyName: "tasks_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "tasks_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
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