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
      compliance_reports: {
        Row: {
          address: string
          agent_id: string
          confidence: number | null
          contacts: Json
          cost_estimate: Json
          created_at: string
          error: string | null
          id: string
          jurisdiction: string | null
          project_id: string | null
          project_type: string
          report: Json
          sources: Json
          state: string | null
          status: string
          summary: string | null
          timeline: Json
          updated_at: string
          user_id: string
          wbs: Json
        }
        Insert: {
          address: string
          agent_id: string
          confidence?: number | null
          contacts?: Json
          cost_estimate?: Json
          created_at?: string
          error?: string | null
          id?: string
          jurisdiction?: string | null
          project_id?: string | null
          project_type: string
          report?: Json
          sources?: Json
          state?: string | null
          status?: string
          summary?: string | null
          timeline?: Json
          updated_at?: string
          user_id: string
          wbs?: Json
        }
        Update: {
          address?: string
          agent_id?: string
          confidence?: number | null
          contacts?: Json
          cost_estimate?: Json
          created_at?: string
          error?: string | null
          id?: string
          jurisdiction?: string | null
          project_id?: string | null
          project_type?: string
          report?: Json
          sources?: Json
          state?: string | null
          status?: string
          summary?: string | null
          timeline?: Json
          updated_at?: string
          user_id?: string
          wbs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "compliance_reports_project_id_fkey"
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
      health_environmental_portals: {
        Row: {
          address_search_template: string | null
          agency_type: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          jurisdiction: string
          last_verified_date: string | null
          notes: string | null
          permit_search_template: string | null
          plan_review_url: string | null
          service_types: string[]
          state: string
          updated_at: string
          url: string
          verification_status: string
          verified_by: string | null
        }
        Insert: {
          address_search_template?: string | null
          agency_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          jurisdiction: string
          last_verified_date?: string | null
          notes?: string | null
          permit_search_template?: string | null
          plan_review_url?: string | null
          service_types?: string[]
          state: string
          updated_at?: string
          url: string
          verification_status?: string
          verified_by?: string | null
        }
        Update: {
          address_search_template?: string | null
          agency_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string
          last_verified_date?: string | null
          notes?: string | null
          permit_search_template?: string | null
          plan_review_url?: string | null
          service_types?: string[]
          state?: string
          updated_at?: string
          url?: string
          verification_status?: string
          verified_by?: string | null
        }
        Relationships: []
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
          confidence: string
          contacts: Json
          county: string
          created_at: string
          created_by: string
          department: string
          departments: Json
          email: string
          fees: Json
          gov_website: string
          id: string
          is_demo: boolean
          jurisdiction_type: string
          last_verified_date: string | null
          name: string
          office_address: string
          office_hours: string
          overview: string
          permit_categories: Json
          permits: Json
          phone: string
          portal_url: string
          refreshed_at: string
          requirements: Json
          slug: string
          source_urls: string[]
          sources: Json
          state: string
          submission_portals: Json
          timelines: Json
          updated_at: string
          verification_status: string
          verified_by: string | null
        }
        Insert: {
          confidence?: string
          contacts?: Json
          county?: string
          created_at?: string
          created_by: string
          department?: string
          departments?: Json
          email?: string
          fees?: Json
          gov_website?: string
          id?: string
          is_demo?: boolean
          jurisdiction_type?: string
          last_verified_date?: string | null
          name: string
          office_address?: string
          office_hours?: string
          overview?: string
          permit_categories?: Json
          permits?: Json
          phone?: string
          portal_url?: string
          refreshed_at?: string
          requirements?: Json
          slug: string
          source_urls?: string[]
          sources?: Json
          state?: string
          submission_portals?: Json
          timelines?: Json
          updated_at?: string
          verification_status?: string
          verified_by?: string | null
        }
        Update: {
          confidence?: string
          contacts?: Json
          county?: string
          created_at?: string
          created_by?: string
          department?: string
          departments?: Json
          email?: string
          fees?: Json
          gov_website?: string
          id?: string
          is_demo?: boolean
          jurisdiction_type?: string
          last_verified_date?: string | null
          name?: string
          office_address?: string
          office_hours?: string
          overview?: string
          permit_categories?: Json
          permits?: Json
          phone?: string
          portal_url?: string
          refreshed_at?: string
          requirements?: Json
          slug?: string
          source_urls?: string[]
          sources?: Json
          state?: string
          submission_portals?: Json
          timelines?: Json
          updated_at?: string
          verification_status?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      jurisdiction_requests: {
        Row: {
          county: string
          created_at: string
          id: string
          jurisdiction_name: string
          notes: string
          permit_type: string
          priority: string
          project_address: string
          project_type: string
          state: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          county?: string
          created_at?: string
          id?: string
          jurisdiction_name: string
          notes?: string
          permit_type?: string
          priority?: string
          project_address?: string
          project_type?: string
          state?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          county?: string
          created_at?: string
          id?: string
          jurisdiction_name?: string
          notes?: string
          permit_type?: string
          priority?: string
          project_address?: string
          project_type?: string
          state?: string
          status?: string
          updated_at?: string
          user_id?: string
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
          screen_set_id: string | null
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
          screen_set_id?: string | null
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
          screen_set_id?: string | null
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
          {
            foreignKeyName: "permit_analyses_screen_set_id_fkey"
            columns: ["screen_set_id"]
            isOneToOne: false
            referencedRelation: "screen_sets"
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
      permit_roadmaps: {
        Row: {
          authority_stack: Json
          confidence: number | null
          created_at: string
          generated_by_model: string | null
          health_score: number | null
          id: string
          jurisdiction_id: string | null
          project_id: string
          prompt_version: string | null
          scope_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          authority_stack?: Json
          confidence?: number | null
          created_at?: string
          generated_by_model?: string | null
          health_score?: number | null
          id?: string
          jurisdiction_id?: string | null
          project_id: string
          prompt_version?: string | null
          scope_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          authority_stack?: Json
          confidence?: number | null
          created_at?: string
          generated_by_model?: string | null
          health_score?: number | null
          id?: string
          jurisdiction_id?: string | null
          project_id?: string
          prompt_version?: string | null
          scope_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_roadmaps_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdiction_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_roadmaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_roadmaps_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scope_of_work"
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
      portal_mappings: {
        Row: {
          address_search_template: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          jurisdiction: string
          notes: string | null
          permit_search_template: string | null
          plan_review_url: string | null
          platform: string
          state: string
          updated_at: string
          url: string
        }
        Insert: {
          address_search_template?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          jurisdiction: string
          notes?: string | null
          permit_search_template?: string | null
          plan_review_url?: string | null
          platform: string
          state: string
          updated_at?: string
          url: string
        }
        Update: {
          address_search_template?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string
          notes?: string | null
          permit_search_template?: string | null
          plan_review_url?: string | null
          platform?: string
          state?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
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
          permit_item_id: string | null
          plan_review: Json | null
          plan_reviewed_at: string | null
          project_id: string
          size_bytes: number
          stage: number | null
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
          permit_item_id?: string | null
          plan_review?: Json | null
          plan_reviewed_at?: string | null
          project_id: string
          size_bytes?: number
          stage?: number | null
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
          permit_item_id?: string | null
          plan_review?: Json | null
          plan_reviewed_at?: string | null
          project_id?: string
          size_bytes?: number
          stage?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_permit_item_id_fkey"
            columns: ["permit_item_id"]
            isOneToOne: false
            referencedRelation: "permit_items"
            referencedColumns: ["id"]
          },
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
      roadmap_agencies: {
        Row: {
          created_at: string
          id: string
          jurisdiction: string | null
          level: Database["public"]["Enums"]["authority_level"] | null
          name: string
          phone: string | null
          roadmap_id: string
          role: string | null
          source_id: string | null
          url: string | null
          verification: Database["public"]["Enums"]["verification_label"]
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction?: string | null
          level?: Database["public"]["Enums"]["authority_level"] | null
          name: string
          phone?: string | null
          roadmap_id: string
          role?: string | null
          source_id?: string | null
          url?: string | null
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction?: string | null
          level?: Database["public"]["Enums"]["authority_level"] | null
          name?: string
          phone?: string | null
          roadmap_id?: string
          role?: string | null
          source_id?: string | null
          url?: string | null
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_agencies_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_agencies_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "roadmap_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_documents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          permit_id: string | null
          required: boolean
          roadmap_id: string
          source_ids: string[]
          verification: Database["public"]["Enums"]["verification_label"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          permit_id?: string | null
          required?: boolean
          roadmap_id: string
          source_ids?: string[]
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          permit_id?: string | null
          required?: boolean
          roadmap_id?: string
          source_ids?: string[]
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_documents_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "roadmap_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_documents_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_followups: {
        Row: {
          answered_at: string | null
          answered_value: string | null
          created_at: string
          field_hint: string | null
          id: string
          question: string
          roadmap_id: string
        }
        Insert: {
          answered_at?: string | null
          answered_value?: string | null
          created_at?: string
          field_hint?: string | null
          id?: string
          question: string
          roadmap_id: string
        }
        Update: {
          answered_at?: string | null
          answered_value?: string | null
          created_at?: string
          field_hint?: string | null
          id?: string
          question?: string
          roadmap_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_followups_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_permits: {
        Row: {
          agency: string | null
          category: Database["public"]["Enums"]["permit_category"] | null
          concurrent_with: string[]
          created_at: string
          critical_path: boolean
          depends_on: string[]
          fee_basis: string | null
          fee_estimate_cents: number | null
          id: string
          level: Database["public"]["Enums"]["authority_level"] | null
          likelihood: Database["public"]["Enums"]["permit_likelihood"]
          name: string
          notes: string | null
          review_days_max: number | null
          review_days_min: number | null
          roadmap_id: string
          sequence_order: number | null
          source_ids: string[]
          verification: Database["public"]["Enums"]["verification_label"]
        }
        Insert: {
          agency?: string | null
          category?: Database["public"]["Enums"]["permit_category"] | null
          concurrent_with?: string[]
          created_at?: string
          critical_path?: boolean
          depends_on?: string[]
          fee_basis?: string | null
          fee_estimate_cents?: number | null
          id?: string
          level?: Database["public"]["Enums"]["authority_level"] | null
          likelihood?: Database["public"]["Enums"]["permit_likelihood"]
          name: string
          notes?: string | null
          review_days_max?: number | null
          review_days_min?: number | null
          roadmap_id: string
          sequence_order?: number | null
          source_ids?: string[]
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Update: {
          agency?: string | null
          category?: Database["public"]["Enums"]["permit_category"] | null
          concurrent_with?: string[]
          created_at?: string
          critical_path?: boolean
          depends_on?: string[]
          fee_basis?: string | null
          fee_estimate_cents?: number | null
          id?: string
          level?: Database["public"]["Enums"]["authority_level"] | null
          likelihood?: Database["public"]["Enums"]["permit_likelihood"]
          name?: string
          notes?: string | null
          review_days_max?: number | null
          review_days_min?: number | null
          roadmap_id?: string
          sequence_order?: number | null
          source_ids?: string[]
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_permits_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_risks: {
        Row: {
          category: string | null
          created_at: string
          id: string
          message: string
          mitigation: string | null
          roadmap_id: string
          severity: Database["public"]["Enums"]["risk_severity"]
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          message: string
          mitigation?: string | null
          roadmap_id: string
          severity?: Database["public"]["Enums"]["risk_severity"]
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          mitigation?: string | null
          roadmap_id?: string
          severity?: Database["public"]["Enums"]["risk_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_risks_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_sources: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          publisher: string | null
          quote: string | null
          retrieved_at: string | null
          roadmap_id: string
          title: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          publisher?: string | null
          quote?: string | null
          retrieved_at?: string | null
          roadmap_id: string
          title?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          publisher?: string | null
          quote?: string | null
          retrieved_at?: string | null
          roadmap_id?: string
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_sources_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_verifications: {
        Row: {
          assigned_to: string | null
          created_at: string
          decided_at: string | null
          evidence_url: string | null
          id: string
          item_id: string
          item_table: string
          notes: string | null
          requested_by: string | null
          roadmap_id: string
          status: Database["public"]["Enums"]["verification_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          evidence_url?: string | null
          id?: string
          item_id: string
          item_table: string
          notes?: string | null
          requested_by?: string | null
          roadmap_id: string
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          evidence_url?: string | null
          id?: string
          item_id?: string
          item_table?: string
          notes?: string | null
          requested_by?: string | null
          roadmap_id?: string
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_verifications_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "permit_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jurisdictions: {
        Row: {
          created_at: string
          id: string
          jurisdiction_id: string
          notes: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_id: string
          notes?: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_id?: string
          notes?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jurisdictions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdiction_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_of_work: {
        Row: {
          address: string | null
          address_normalized: string | null
          construction_type: string | null
          construction_value_cents: number | null
          created_at: string
          dwelling_units: number | null
          id: string
          lat: number | null
          lng: number | null
          occupancy_existing: string | null
          occupancy_proposed: string | null
          project_id: string
          project_type: Database["public"]["Enums"]["scope_project_type"] | null
          residential_or_commercial:
            | Database["public"]["Enums"]["res_or_com"]
            | null
          scope_text: string | null
          sq_ft_affected: number | null
          sq_ft_gross: number | null
          status: Database["public"]["Enums"]["scope_status"]
          target_open_date: string | null
          target_start_date: string | null
          trades: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          address_normalized?: string | null
          construction_type?: string | null
          construction_value_cents?: number | null
          created_at?: string
          dwelling_units?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          occupancy_existing?: string | null
          occupancy_proposed?: string | null
          project_id: string
          project_type?:
            | Database["public"]["Enums"]["scope_project_type"]
            | null
          residential_or_commercial?:
            | Database["public"]["Enums"]["res_or_com"]
            | null
          scope_text?: string | null
          sq_ft_affected?: number | null
          sq_ft_gross?: number | null
          status?: Database["public"]["Enums"]["scope_status"]
          target_open_date?: string | null
          target_start_date?: string | null
          trades?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          address_normalized?: string | null
          construction_type?: string | null
          construction_value_cents?: number | null
          created_at?: string
          dwelling_units?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          occupancy_existing?: string | null
          occupancy_proposed?: string | null
          project_id?: string
          project_type?:
            | Database["public"]["Enums"]["scope_project_type"]
            | null
          residential_or_commercial?:
            | Database["public"]["Enums"]["res_or_com"]
            | null
          scope_text?: string | null
          sq_ft_affected?: number | null
          sq_ft_gross?: number | null
          status?: Database["public"]["Enums"]["scope_status"]
          target_open_date?: string | null
          target_start_date?: string | null
          trades?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_of_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_sets: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      roadmap_visible: { Args: { _roadmap_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      authority_level:
        | "city"
        | "county"
        | "state"
        | "federal"
        | "utility"
        | "special_district"
      permit_category:
        | "zoning"
        | "building"
        | "electrical"
        | "mechanical"
        | "plumbing"
        | "fire"
        | "health"
        | "site"
        | "environmental"
        | "row"
        | "utility"
        | "business_license"
        | "sign"
        | "tco"
        | "co"
        | "other"
      permit_likelihood: "required" | "likely" | "conditional" | "not_required"
      res_or_com: "residential" | "commercial" | "mixed_use"
      risk_severity: "low" | "medium" | "high"
      scope_project_type:
        | "new_construction"
        | "tenant_improvement"
        | "change_of_occupancy"
        | "addition"
        | "alteration"
        | "repair"
        | "demolition"
        | "shell"
        | "core_and_shell"
        | "other"
      scope_status:
        | "draft"
        | "submitted"
        | "analyzing"
        | "needs_followup"
        | "complete"
      source_kind: "agency_site" | "code" | "ordinance" | "portal" | "other"
      verification_label:
        | "verified"
        | "ai_assisted"
        | "needs_agency_confirmation"
      verification_status: "open" | "in_review" | "verified" | "rejected"
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
    Enums: {
      app_role: ["admin", "user"],
      authority_level: [
        "city",
        "county",
        "state",
        "federal",
        "utility",
        "special_district",
      ],
      permit_category: [
        "zoning",
        "building",
        "electrical",
        "mechanical",
        "plumbing",
        "fire",
        "health",
        "site",
        "environmental",
        "row",
        "utility",
        "business_license",
        "sign",
        "tco",
        "co",
        "other",
      ],
      permit_likelihood: ["required", "likely", "conditional", "not_required"],
      res_or_com: ["residential", "commercial", "mixed_use"],
      risk_severity: ["low", "medium", "high"],
      scope_project_type: [
        "new_construction",
        "tenant_improvement",
        "change_of_occupancy",
        "addition",
        "alteration",
        "repair",
        "demolition",
        "shell",
        "core_and_shell",
        "other",
      ],
      scope_status: [
        "draft",
        "submitted",
        "analyzing",
        "needs_followup",
        "complete",
      ],
      source_kind: ["agency_site", "code", "ordinance", "portal", "other"],
      verification_label: [
        "verified",
        "ai_assisted",
        "needs_agency_confirmation",
      ],
      verification_status: ["open", "in_review", "verified", "rejected"],
    },
  },
} as const
