export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          created_at: string
          description: string
          id: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          client_message_id: string | null
          content: string
          created_at: string
          id: string
          parts: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          client_message_id?: string | null
          content: string
          created_at?: string
          id?: string
          parts?: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          client_message_id?: string | null
          content?: string
          created_at?: string
          id?: string
          parts?: Json | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          model: string
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          model?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          model?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deadlines: {
        Row: {
          created_at: string
          due_date: string
          id: string
          project_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          project_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          project_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          checklist: Json | null
          created_at: string
          id: string
          inspection_type: string
          inspector: string
          notes: string
          permit_item_id: string | null
          photos: Json | null
          project_id: string
          result: string | null
          result_date: string | null
          scheduled_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checklist?: Json | null
          created_at?: string
          id?: string
          inspection_type: string
          inspector?: string
          notes?: string
          permit_item_id?: string | null
          photos?: Json | null
          project_id: string
          result?: string | null
          result_date?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checklist?: Json | null
          created_at?: string
          id?: string
          inspection_type?: string
          inspector?: string
          notes?: string
          permit_item_id?: string | null
          photos?: Json | null
          project_id?: string
          result?: string | null
          result_date?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_permit_item_id_fkey"
            columns: ["permit_item_id"]
            isOneToOne: false
            referencedRelation: "permit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdiction_profiles: {
        Row: {
          contacts: Json
          created_at: string
          created_by: string
          department: string
          fees: Json
          id: string
          name: string
          overview: string
          permits: Json
          portal_url: string
          refreshed_at: string
          slug: string
          source_urls: string[]
          state: string
          timelines: Json
          updated_at: string
        }
        Insert: {
          contacts?: Json
          created_at?: string
          created_by: string
          department?: string
          fees?: Json
          id?: string
          name: string
          overview?: string
          permits?: Json
          portal_url?: string
          refreshed_at?: string
          slug: string
          source_urls?: string[]
          state?: string
          timelines?: Json
          updated_at?: string
        }
        Update: {
          contacts?: Json
          created_at?: string
          created_by?: string
          department?: string
          fees?: Json
          id?: string
          name?: string
          overview?: string
          permits?: Json
          portal_url?: string
          refreshed_at?: string
          slug?: string
          source_urls?: string[]
          state?: string
          timelines?: Json
          updated_at?: string
        }
        Relationships: []
      }
      jurisdiction_syncs: {
        Row: {
          created_at: string
          error: string
          findings: Json
          id: string
          portal_name: string
          portal_url: string
          project_id: string
          source_url: string
          status: string
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string
          findings?: Json
          id?: string
          portal_name?: string
          portal_url?: string
          project_id: string
          source_url?: string
          status?: string
          summary?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string
          findings?: Json
          id?: string
          portal_name?: string
          portal_url?: string
          project_id?: string
          source_url?: string
          status?: string
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      permit_analyses: {
        Row: {
          analysis: Json
          created_at: string
          id: string
          intake: Json
          jurisdiction: string | null
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json
          created_at?: string
          id?: string
          intake?: Json
          jurisdiction?: string | null
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          id?: string
          intake?: Json
          jurisdiction?: string | null
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_items: {
        Row: {
          application_fields: Json | null
          application_packet_doc_id: string | null
          category: string
          created_at: string
          due_date: string | null
          id: string
          name: string
          notes: string
          project_id: string
          required: boolean
          sort_order: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_fields?: Json | null
          application_packet_doc_id?: string | null
          category?: string
          created_at?: string
          due_date?: string | null
          id?: string
          name: string
          notes?: string
          project_id: string
          required?: boolean
          sort_order?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_fields?: Json | null
          application_packet_doc_id?: string | null
          category?: string
          created_at?: string
          due_date?: string | null
          id?: string
          name?: string
          notes?: string
          project_id?: string
          required?: boolean
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_items_application_packet_doc_id_fkey"
            columns: ["application_packet_doc_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_sync_history: {
        Row: {
          created_at: string
          found: boolean
          id: string
          jurisdiction: string
          permit_number: string
          portal_name: string | null
          project_id: string
          snapshot: Json
          source_url: string | null
          status: string
          trigger: string
          user_id: string
        }
        Insert: {
          created_at?: string
          found?: boolean
          id?: string
          jurisdiction?: string
          permit_number: string
          portal_name?: string | null
          project_id: string
          snapshot?: Json
          source_url?: string | null
          status?: string
          trigger?: string
          user_id: string
        }
        Update: {
          created_at?: string
          found?: boolean
          id?: string
          jurisdiction?: string
          permit_number?: string
          portal_name?: string | null
          project_id?: string
          snapshot?: Json
          source_url?: string | null
          status?: string
          trigger?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_sync_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          ai_action_items: Json | null
          ai_summary: string | null
          analyzed_at: string | null
          created_at: string
          id: string
          mime_type: string
          name: string
          plan_review: Json | null
          plan_reviewed_at: string | null
          project_id: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          ai_action_items?: Json | null
          ai_summary?: string | null
          analyzed_at?: string | null
          created_at?: string
          id?: string
          mime_type?: string
          name: string
          plan_review?: Json | null
          plan_reviewed_at?: string | null
          project_id: string
          size_bytes?: number
          storage_path: string
          user_id: string
        }
        Update: {
          ai_action_items?: Json | null
          ai_summary?: string | null
          analyzed_at?: string | null
          created_at?: string
          id?: string
          mime_type?: string
          name?: string
          plan_review?: Json | null
          plan_reviewed_at?: string | null
          project_id?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          current_stage: number
          estimate: Json | null
          estimate_generated_at: string | null
          id: string
          jurisdiction: string
          linked_permit_data: Json | null
          linked_permit_number: string | null
          linked_permit_synced_at: string | null
          linked_permit_url: string | null
          location: string
          name: string
          permit_count: number
          permits_issued: number
          project_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_stage?: number
          estimate?: Json | null
          estimate_generated_at?: string | null
          id?: string
          jurisdiction?: string
          linked_permit_data?: Json | null
          linked_permit_number?: string | null
          linked_permit_synced_at?: string | null
          linked_permit_url?: string | null
          location?: string
          name: string
          permit_count?: number
          permits_issued?: number
          project_type?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_stage?: number
          estimate?: Json | null
          estimate_generated_at?: string | null
          id?: string
          jurisdiction?: string
          linked_permit_data?: Json | null
          linked_permit_number?: string | null
          linked_permit_synced_at?: string | null
          linked_permit_url?: string | null
          location?: string
          name?: string
          permit_count?: number
          permits_issued?: number
          project_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          password_hash: string | null
          project_id: string
          project_snapshot: Json
          report: Json
          revoked_at: string | null
          token: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          password_hash?: string | null
          project_id: string
          project_snapshot?: Json
          report: Json
          revoked_at?: string | null
          token: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          password_hash?: string | null
          project_id?: string
          project_snapshot?: Json
          report?: Json
          revoked_at?: string | null
          token?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
