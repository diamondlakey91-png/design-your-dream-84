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
      agent_client_questions: {
        Row: {
          agent_key: string
          agent_run_id: string
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          blocking: boolean
          created_at: string
          id: string
          question: string
          question_key: string
          who_can_answer: string | null
          why_it_matters: string
        }
        Insert: {
          agent_key: string
          agent_run_id: string
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          blocking?: boolean
          created_at?: string
          id?: string
          question: string
          question_key: string
          who_can_answer?: string | null
          why_it_matters?: string
        }
        Update: {
          agent_key?: string
          agent_run_id?: string
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          blocking?: boolean
          created_at?: string
          id?: string
          question?: string
          question_key?: string
          who_can_answer?: string | null
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_client_questions_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conflicts: {
        Row: {
          affects: string[]
          agent_run_id: string
          conflict_type: string
          created_at: string
          description: string
          finding_ids: string[]
          id: string
          resolution_notes: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_ids: string[]
        }
        Insert: {
          affects?: string[]
          agent_run_id: string
          conflict_type: string
          created_at?: string
          description: string
          finding_ids?: string[]
          id?: string
          resolution_notes?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_ids?: string[]
        }
        Update: {
          affects?: string[]
          agent_run_id?: string
          conflict_type?: string
          created_at?: string
          description?: string
          finding_ids?: string[]
          id?: string
          resolution_notes?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "agent_conflicts_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_definitions: {
        Row: {
          active: boolean
          agent_key: string
          client_visible_output_allowed: boolean
          concurrency_safe: boolean
          created_at: string
          dependencies: string[]
          description: string
          human_review_required: boolean
          id: string
          max_attempts: number
          model: Json
          name: string
          optional_inputs: string[]
          output_schema: string
          phases: string[]
          prompt_version: string
          required_inputs: string[]
          service_products: string[]
          timeout_ms: number
          tools_allowed: string[]
          updated_at: string
          version: string
        }
        Insert: {
          active?: boolean
          agent_key: string
          client_visible_output_allowed?: boolean
          concurrency_safe?: boolean
          created_at?: string
          dependencies?: string[]
          description: string
          human_review_required?: boolean
          id?: string
          max_attempts?: number
          model?: Json
          name: string
          optional_inputs?: string[]
          output_schema?: string
          phases?: string[]
          prompt_version?: string
          required_inputs?: string[]
          service_products?: string[]
          timeout_ms?: number
          tools_allowed?: string[]
          updated_at?: string
          version: string
        }
        Update: {
          active?: boolean
          agent_key?: string
          client_visible_output_allowed?: boolean
          concurrency_safe?: boolean
          created_at?: string
          dependencies?: string[]
          description?: string
          human_review_required?: boolean
          id?: string
          max_attempts?: number
          model?: Json
          name?: string
          optional_inputs?: string[]
          output_schema?: string
          phases?: string[]
          prompt_version?: string
          required_inputs?: string[]
          service_products?: string[]
          timeout_ms?: number
          tools_allowed?: string[]
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      agent_finding_sources: {
        Row: {
          agent_finding_id: string
          agent_source_id: string
          created_at: string
          id: string
          primary_source: boolean
          support_description: string | null
          supporting_excerpt: string | null
        }
        Insert: {
          agent_finding_id: string
          agent_source_id: string
          created_at?: string
          id?: string
          primary_source?: boolean
          support_description?: string | null
          supporting_excerpt?: string | null
        }
        Update: {
          agent_finding_id?: string
          agent_source_id?: string
          created_at?: string
          id?: string
          primary_source?: boolean
          support_description?: string | null
          supporting_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_finding_sources_agent_finding_id_fkey"
            columns: ["agent_finding_id"]
            isOneToOne: false
            referencedRelation: "agent_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_finding_sources_agent_source_id_fkey"
            columns: ["agent_source_id"]
            isOneToOne: false
            referencedRelation: "agent_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_findings: {
        Row: {
          agency: string | null
          agent_key: string
          agent_run_id: string
          agent_task_id: string | null
          analysis: string
          applicability: string
          category: string
          client_visible: boolean
          confidence: string
          confirmation_required: boolean
          cost_impact: string | null
          created_at: string
          finding: string
          finding_key: string
          geographic_scope: string | null
          id: string
          module: string
          recommendation: string | null
          responsible_party: string | null
          review_action: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string
          schedule_impact: string | null
          superseded_by: string | null
          title: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          agency?: string | null
          agent_key: string
          agent_run_id: string
          agent_task_id?: string | null
          analysis?: string
          applicability?: string
          category?: string
          client_visible?: boolean
          confidence?: string
          confirmation_required?: boolean
          cost_impact?: string | null
          created_at?: string
          finding: string
          finding_key: string
          geographic_scope?: string | null
          id?: string
          module: string
          recommendation?: string | null
          responsible_party?: string | null
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          schedule_impact?: string | null
          superseded_by?: string | null
          title: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          agency?: string | null
          agent_key?: string
          agent_run_id?: string
          agent_task_id?: string | null
          analysis?: string
          applicability?: string
          category?: string
          client_visible?: boolean
          confidence?: string
          confirmation_required?: boolean
          cost_impact?: string | null
          created_at?: string
          finding?: string
          finding_key?: string
          geographic_scope?: string | null
          id?: string
          module?: string
          recommendation?: string | null
          responsible_party?: string | null
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          schedule_impact?: string | null
          superseded_by?: string | null
          title?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_findings_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_findings_agent_task_id_fkey"
            columns: ["agent_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_findings_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "agent_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_quality_checks: {
        Row: {
          agent_run_id: string
          blocking: boolean
          check_key: string
          created_at: string
          detail: string | null
          id: string
          label: string
          status: string
        }
        Insert: {
          agent_run_id: string
          blocking?: boolean
          check_key: string
          created_at?: string
          detail?: string | null
          id?: string
          label: string
          status?: string
        }
        Update: {
          agent_run_id?: string
          blocking?: boolean
          check_key?: string
          created_at?: string
          detail?: string | null
          id?: string
          label?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_quality_checks_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_review_actions: {
        Row: {
          action: string
          agent_finding_id: string | null
          agent_run_id: string
          created_at: string
          id: string
          notes: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          stage: string
        }
        Insert: {
          action: string
          agent_finding_id?: string | null
          agent_run_id: string
          created_at?: string
          id?: string
          notes?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          stage?: string
        }
        Update: {
          action?: string
          agent_finding_id?: string | null
          agent_run_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_review_actions_agent_finding_id_fkey"
            columns: ["agent_finding_id"]
            isOneToOne: false
            referencedRelation: "agent_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_review_actions_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          blocking_question_count: number
          client_stage: string
          completed_at: string | null
          context_snapshot: Json
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          organization_id: string | null
          professional_review_required: boolean
          progress_percent: number
          project_id: string | null
          qa_status: string
          requested_by: string | null
          requested_deliverable: string
          review_stage: string
          revision: number
          service_order_id: string | null
          sir_request_id: string | null
          started_at: string | null
          status: string
          supersedes_run_id: string | null
          total_credits_reserved: number
          total_credits_used: number
          total_estimated_cost: number
          updated_at: string
          workflow_key: string
          workflow_version: string
        }
        Insert: {
          blocking_question_count?: number
          client_stage?: string
          completed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          organization_id?: string | null
          professional_review_required?: boolean
          progress_percent?: number
          project_id?: string | null
          qa_status?: string
          requested_by?: string | null
          requested_deliverable?: string
          review_stage?: string
          revision?: number
          service_order_id?: string | null
          sir_request_id?: string | null
          started_at?: string | null
          status?: string
          supersedes_run_id?: string | null
          total_credits_reserved?: number
          total_credits_used?: number
          total_estimated_cost?: number
          updated_at?: string
          workflow_key: string
          workflow_version?: string
        }
        Update: {
          blocking_question_count?: number
          client_stage?: string
          completed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          organization_id?: string | null
          professional_review_required?: boolean
          progress_percent?: number
          project_id?: string | null
          qa_status?: string
          requested_by?: string | null
          requested_deliverable?: string
          review_stage?: string
          revision?: number
          service_order_id?: string | null
          sir_request_id?: string | null
          started_at?: string | null
          status?: string
          supersedes_run_id?: string | null
          total_credits_reserved?: number
          total_credits_used?: number
          total_estimated_cost?: number
          updated_at?: string
          workflow_key?: string
          workflow_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_supersedes_run_id_fkey"
            columns: ["supersedes_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sources: {
        Row: {
          accessed_at: string | null
          agent_run_id: string
          agent_task_id: string | null
          authority_level: string
          code_section: string | null
          created_at: string
          effective_date: string | null
          geographic_scope: string | null
          id: string
          map_layer: string | null
          page_reference: string | null
          publisher: string
          retrieved: boolean
          source_key: string
          source_type: string
          stale: boolean
          title: string
          uploaded_document_id: string | null
          url: string | null
        }
        Insert: {
          accessed_at?: string | null
          agent_run_id: string
          agent_task_id?: string | null
          authority_level?: string
          code_section?: string | null
          created_at?: string
          effective_date?: string | null
          geographic_scope?: string | null
          id?: string
          map_layer?: string | null
          page_reference?: string | null
          publisher: string
          retrieved?: boolean
          source_key: string
          source_type: string
          stale?: boolean
          title: string
          uploaded_document_id?: string | null
          url?: string | null
        }
        Update: {
          accessed_at?: string | null
          agent_run_id?: string
          agent_task_id?: string | null
          authority_level?: string
          code_section?: string | null
          created_at?: string
          effective_date?: string | null
          geographic_scope?: string | null
          id?: string
          map_layer?: string | null
          page_reference?: string | null
          publisher?: string
          retrieved?: boolean
          source_key?: string
          source_type?: string
          stale?: boolean
          title?: string
          uploaded_document_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_sources_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_sources_agent_task_id_fkey"
            columns: ["agent_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_key: string
          agent_run_id: string
          agent_version: string
          attempt: number
          completed_at: string | null
          created_at: string
          dependencies: string[]
          error: string | null
          id: string
          input_snapshot: Json | null
          max_attempts: number
          model: string | null
          optional: boolean
          output_snapshot: Json | null
          parallel_group: number
          prompt_version: string
          sequence: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_key: string
          agent_run_id: string
          agent_version?: string
          attempt?: number
          completed_at?: string | null
          created_at?: string
          dependencies?: string[]
          error?: string | null
          id?: string
          input_snapshot?: Json | null
          max_attempts?: number
          model?: string | null
          optional?: boolean
          output_snapshot?: Json | null
          parallel_group?: number
          prompt_version?: string
          sequence?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_key?: string
          agent_run_id?: string
          agent_version?: string
          attempt?: number
          completed_at?: string | null
          created_at?: string
          dependencies?: string[]
          error?: string | null
          id?: string
          input_snapshot?: Json | null
          max_attempts?: number
          model?: string | null
          optional?: boolean
          output_snapshot?: Json | null
          parallel_group?: number
          prompt_version?: string
          sequence?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_usage_ledger: {
        Row: {
          agent_run_id: string
          agent_task_id: string | null
          charge_key: string
          created_at: string
          credits_used: number
          document_pages: number
          entry_type: string
          estimated_cost: number
          id: string
          input_units: number
          model: string | null
          organization_id: string | null
          output_units: number
          research_calls: number
        }
        Insert: {
          agent_run_id: string
          agent_task_id?: string | null
          charge_key: string
          created_at?: string
          credits_used?: number
          document_pages?: number
          entry_type?: string
          estimated_cost?: number
          id?: string
          input_units?: number
          model?: string | null
          organization_id?: string | null
          output_units?: number
          research_calls?: number
        }
        Update: {
          agent_run_id?: string
          agent_task_id?: string | null
          charge_key?: string
          created_at?: string
          credits_used?: number
          document_pages?: number
          entry_type?: string
          estimated_cost?: number
          id?: string
          input_units?: number
          model?: string | null
          organization_id?: string | null
          output_units?: number
          research_calls?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_usage_ledger_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usage_ledger_agent_task_id_fkey"
            columns: ["agent_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usage_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_workflows: {
        Row: {
          active: boolean
          configuration: Json
          created_at: string
          id: string
          name: string
          service_product_key: string | null
          updated_at: string
          version: string
          workflow_key: string
        }
        Insert: {
          active?: boolean
          configuration?: Json
          created_at?: string
          id?: string
          name: string
          service_product_key?: string | null
          updated_at?: string
          version: string
          workflow_key: string
        }
        Update: {
          active?: boolean
          configuration?: Json
          created_at?: string
          id?: string
          name?: string
          service_product_key?: string | null
          updated_at?: string
          version?: string
          workflow_key?: string
        }
        Relationships: []
      }
      authorities: {
        Row: {
          created_at: string
          department: string | null
          id: string
          jurisdiction_id: string
          last_verified_at: string | null
          official_name: string
          phone: string | null
          portal_url: string | null
          responsibility: string | null
          role: Database["public"]["Enums"]["authority_role"]
          source_id: string | null
          updated_at: string
          verification: string
          website: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          jurisdiction_id: string
          last_verified_at?: string | null
          official_name: string
          phone?: string | null
          portal_url?: string | null
          responsibility?: string | null
          role: Database["public"]["Enums"]["authority_role"]
          source_id?: string | null
          updated_at?: string
          verification?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          jurisdiction_id?: string
          last_verified_at?: string | null
          official_name?: string
          phone?: string | null
          portal_url?: string | null
          responsibility?: string | null
          role?: Database["public"]["Enums"]["authority_role"]
          source_id?: string | null
          updated_at?: string
          verification?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorities_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "official_sources"
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
      code_adoptions: {
        Row: {
          code_family: string
          created_at: string
          discipline: Database["public"]["Enums"]["code_discipline"]
          edition: string
          effective_date: string | null
          id: string
          jurisdiction_id: string
          last_verified_at: string | null
          local_amendments_url: string | null
          source_id: string | null
          updated_at: string
          verification: string
        }
        Insert: {
          code_family: string
          created_at?: string
          discipline: Database["public"]["Enums"]["code_discipline"]
          edition: string
          effective_date?: string | null
          id?: string
          jurisdiction_id: string
          last_verified_at?: string | null
          local_amendments_url?: string | null
          source_id?: string | null
          updated_at?: string
          verification?: string
        }
        Update: {
          code_family?: string
          created_at?: string
          discipline?: Database["public"]["Enums"]["code_discipline"]
          edition?: string
          effective_date?: string | null
          id?: string
          jurisdiction_id?: string
          last_verified_at?: string | null
          local_amendments_url?: string | null
          source_id?: string | null
          updated_at?: string
          verification?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_adoptions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_adoptions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_responses: {
        Row: {
          assignee: string | null
          code_reference: string | null
          comment_no: number
          comment_text: string
          created_at: string
          discipline: string
          document_id: string | null
          id: string
          project_id: string
          response_text: string | null
          severity: string
          sheet_reference: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
          verification: string
        }
        Insert: {
          assignee?: string | null
          code_reference?: string | null
          comment_no?: number
          comment_text: string
          created_at?: string
          discipline?: string
          document_id?: string | null
          id?: string
          project_id: string
          response_text?: string | null
          severity?: string
          sheet_reference?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
          verification?: string
        }
        Update: {
          assignee?: string | null
          code_reference?: string | null
          comment_no?: number
          comment_text?: string
          created_at?: string
          discipline?: string
          document_id?: string | null
          id?: string
          project_id?: string
          response_text?: string | null
          severity?: string
          sheet_reference?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          verification?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_responses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_responses_project_id_fkey"
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
      intake_answers: {
        Row: {
          answer_choice: string | null
          answer_value: string | null
          created_at: string
          document_id: string | null
          id: string
          project_id: string
          question_key: string
          source: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          answer_choice?: string | null
          answer_value?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          project_id: string
          question_key: string
          source?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          answer_choice?: string | null
          answer_value?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          project_id?: string
          question_key?: string
          source?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "intake_answers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdiction_confirmations: {
        Row: {
          city: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          formatted_address: string | null
          id: string
          incorporated: boolean | null
          jurisdiction_id: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          overrides: Json
          parcel_number: string | null
          project_id: string
          state: string
          status: Database["public"]["Enums"]["jurisdiction_confirmation_status"]
          street: string
          suite: string | null
          updated_at: string
          zip: string
        }
        Insert: {
          city: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          formatted_address?: string | null
          id?: string
          incorporated?: boolean | null
          jurisdiction_id?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          overrides?: Json
          parcel_number?: string | null
          project_id: string
          state: string
          status?: Database["public"]["Enums"]["jurisdiction_confirmation_status"]
          street: string
          suite?: string | null
          updated_at?: string
          zip: string
        }
        Update: {
          city?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          formatted_address?: string | null
          id?: string
          incorporated?: boolean | null
          jurisdiction_id?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          overrides?: Json
          parcel_number?: string | null
          project_id?: string
          state?: string
          status?: Database["public"]["Enums"]["jurisdiction_confirmation_status"]
          street?: string
          suite?: string | null
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "jurisdiction_confirmations_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jurisdiction_confirmations_project_id_fkey"
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
      jurisdictions: {
        Row: {
          centroid_lat: number | null
          centroid_lng: number | null
          county: string
          created_at: string
          fips_county: string | null
          fips_place: string | null
          id: string
          incorporated: boolean
          municipality: string | null
          state: string
          updated_at: string
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          county: string
          created_at?: string
          fips_county?: string | null
          fips_place?: string | null
          id?: string
          incorporated?: boolean
          municipality?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          county?: string
          created_at?: string
          fips_county?: string | null
          fips_place?: string | null
          id?: string
          incorporated?: boolean
          municipality?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      official_sources: {
        Row: {
          created_at: string
          fetched_at: string
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          publisher: string | null
          quote: string | null
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          publisher?: string | null
          quote?: string | null
          title: string
          url: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          publisher?: string | null
          quote?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          credentials: string | null
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials?: string | null
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credentials?: string | null
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          branding: Json
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          notes: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          branding?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name: string
          notes?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          branding?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name?: string
          notes?: string | null
          slug?: string
          updated_at?: string
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
      permit_filings: {
        Row: {
          applicant_of_record: string | null
          approved_at: string | null
          approved_by: string | null
          confirmation_number: string | null
          created_at: string
          id: string
          jurisdiction: string
          notes: string | null
          permit_type: string
          portal_name: string | null
          portal_url: string | null
          preflight: Json
          project_id: string | null
          status: Database["public"]["Enums"]["permit_filing_status"]
          status_source: string | null
          submitted_at: string | null
          target_submittal_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_of_record?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confirmation_number?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string
          notes?: string | null
          permit_type?: string
          portal_name?: string | null
          portal_url?: string | null
          preflight?: Json
          project_id?: string | null
          status?: Database["public"]["Enums"]["permit_filing_status"]
          status_source?: string | null
          submitted_at?: string | null
          target_submittal_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_of_record?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confirmation_number?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string
          notes?: string | null
          permit_type?: string
          portal_name?: string | null
          portal_url?: string | null
          preflight?: Json
          project_id?: string | null
          status?: Database["public"]["Enums"]["permit_filing_status"]
          status_source?: string | null
          submitted_at?: string | null
          target_submittal_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_filings_project_id_fkey"
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
      permit_roadmaps: {
        Row: {
          authority_stack: Json
          confidence: number | null
          confirmation_id: string | null
          created_at: string
          generated_by_model: string | null
          health_score: number | null
          id: string
          jurisdiction_id: string | null
          project_id: string
          prompt_version: string | null
          scope_id: string
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          authority_stack?: Json
          confidence?: number | null
          confirmation_id?: string | null
          created_at?: string
          generated_by_model?: string | null
          health_score?: number | null
          id?: string
          jurisdiction_id?: string | null
          project_id: string
          prompt_version?: string | null
          scope_id: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          authority_stack?: Json
          confidence?: number | null
          confirmation_id?: string | null
          created_at?: string
          generated_by_model?: string | null
          health_score?: number | null
          id?: string
          jurisdiction_id?: string | null
          project_id?: string
          prompt_version?: string | null
          scope_id?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_roadmaps_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "jurisdiction_confirmations"
            referencedColumns: ["id"]
          },
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
      portal_credentials: {
        Row: {
          created_at: string
          id: string
          jurisdiction: string | null
          kind: string
          label: string
          last_verified_at: string | null
          notes: string | null
          password_encrypted: string | null
          portal_url: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction?: string | null
          kind?: string
          label: string
          last_verified_at?: string | null
          notes?: string | null
          password_encrypted?: string | null
          portal_url?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction?: string | null
          kind?: string
          label?: string
          last_verified_at?: string | null
          notes?: string | null
          password_encrypted?: string | null
          portal_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
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
      professional_reviews: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          requested_notes: string | null
          reviewed_at: string | null
          reviewer_name: string | null
          reviewer_notes: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          requested_notes?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          reviewer_notes?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          requested_notes?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          reviewer_notes?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_reviews_project_id_fkey"
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
      project_type_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          keyword_only: boolean
          project_type_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          keyword_only?: boolean
          project_type_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          keyword_only?: boolean
          project_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_type_aliases_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      project_type_categories: {
        Row: {
          active_status: boolean
          category_name: string
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          category_name: string
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          category_name?: string
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_types: {
        Row: {
          active_status: boolean
          category_id: string
          client_label: string
          common_scope_triggers: string[]
          created_at: string
          display_order: number
          follow_up_question_ids: string[]
          id: string
          internal_name: string
          possible_agency_categories: string[]
          possible_document_categories: string[]
          possible_permit_categories: string[]
          residential_or_commercial: string
          short_description: string | null
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          category_id: string
          client_label: string
          common_scope_triggers?: string[]
          created_at?: string
          display_order?: number
          follow_up_question_ids?: string[]
          id?: string
          internal_name: string
          possible_agency_categories?: string[]
          possible_document_categories?: string[]
          possible_permit_categories?: string[]
          residential_or_commercial: string
          short_description?: string | null
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          category_id?: string
          client_label?: string
          common_scope_triggers?: string[]
          created_at?: string
          display_order?: number
          follow_up_question_ids?: string[]
          id?: string
          internal_name?: string
          possible_agency_categories?: string[]
          possible_document_categories?: string[]
          possible_permit_categories?: string[]
          residential_or_commercial?: string
          short_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "project_type_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          additional_project_type_ids: string[]
          created_at: string
          current_stage: number
          custom_project_type_description: string | null
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
          organization_id: string | null
          permit_count: number
          permits_issued: number
          primary_project_type_id: string | null
          project_type: string
          project_type_confidence: number | null
          project_type_confirmed_at: string | null
          project_type_confirmed_by: string | null
          project_type_source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_project_type_ids?: string[]
          created_at?: string
          current_stage?: number
          custom_project_type_description?: string | null
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
          organization_id?: string | null
          permit_count?: number
          permits_issued?: number
          primary_project_type_id?: string | null
          project_type?: string
          project_type_confidence?: number | null
          project_type_confirmed_at?: string | null
          project_type_confirmed_by?: string | null
          project_type_source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_project_type_ids?: string[]
          created_at?: string
          current_stage?: number
          custom_project_type_description?: string | null
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
          organization_id?: string | null
          permit_count?: number
          permits_issued?: number
          primary_project_type_id?: string | null
          project_type?: string
          project_type_confidence?: number | null
          project_type_confirmed_at?: string | null
          project_type_confirmed_by?: string | null
          project_type_source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_primary_project_type_id_fkey"
            columns: ["primary_project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_signoffs: {
        Row: {
          created_at: string
          gate_passed: boolean
          id: string
          notes: string | null
          overridden: boolean
          override_reason: string | null
          project_id: string
          scope: string
          signed_by_name: string
          signed_by_role: string | null
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gate_passed?: boolean
          id?: string
          notes?: string | null
          overridden?: boolean
          override_reason?: string | null
          project_id: string
          scope?: string
          signed_by_name: string
          signed_by_role?: string | null
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gate_passed?: boolean
          id?: string
          notes?: string | null
          overridden?: boolean
          override_reason?: string | null
          project_id?: string
          scope?: string
          signed_by_name?: string
          signed_by_role?: string | null
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_signoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qaqc_findings: {
        Row: {
          category: string
          code_basis: string | null
          created_at: string
          discipline: string
          finding_no: number
          id: string
          jurisdiction_source_url: string | null
          location: string | null
          plain_language: string | null
          recommended_action: string | null
          resolved: boolean
          responsible_discipline: string | null
          review_id: string
          severity: string
          sheet_number: string | null
          sheet_title: string | null
          summary: string
          updated_at: string
          user_id: string
          verification: string
          why_it_matters: string | null
        }
        Insert: {
          category?: string
          code_basis?: string | null
          created_at?: string
          discipline?: string
          finding_no: number
          id?: string
          jurisdiction_source_url?: string | null
          location?: string | null
          plain_language?: string | null
          recommended_action?: string | null
          resolved?: boolean
          responsible_discipline?: string | null
          review_id: string
          severity?: string
          sheet_number?: string | null
          sheet_title?: string | null
          summary: string
          updated_at?: string
          user_id: string
          verification?: string
          why_it_matters?: string | null
        }
        Update: {
          category?: string
          code_basis?: string | null
          created_at?: string
          discipline?: string
          finding_no?: number
          id?: string
          jurisdiction_source_url?: string | null
          location?: string | null
          plain_language?: string | null
          recommended_action?: string | null
          resolved?: boolean
          responsible_discipline?: string | null
          review_id?: string
          severity?: string
          sheet_number?: string | null
          sheet_title?: string | null
          summary?: string
          updated_at?: string
          user_id?: string
          verification?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qaqc_findings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "qaqc_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      qaqc_reviews: {
        Row: {
          codes_researched: Json
          created_at: string
          document_ids: string[]
          error: string | null
          executive_summary: string | null
          id: string
          inventory_gaps: Json
          jurisdiction_snapshot: Json
          missing_documents: Json
          model: string | null
          needs_professional_confirmation: Json
          project_context: Json
          project_id: string
          prompt_version: string | null
          readiness_category: string
          readiness_score: number | null
          recommended_actions: Json
          revision_label: string
          sources: Json
          status: string
          submission_issues: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          codes_researched?: Json
          created_at?: string
          document_ids?: string[]
          error?: string | null
          executive_summary?: string | null
          id?: string
          inventory_gaps?: Json
          jurisdiction_snapshot?: Json
          missing_documents?: Json
          model?: string | null
          needs_professional_confirmation?: Json
          project_context?: Json
          project_id: string
          prompt_version?: string | null
          readiness_category?: string
          readiness_score?: number | null
          recommended_actions?: Json
          revision_label?: string
          sources?: Json
          status?: string
          submission_issues?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          codes_researched?: Json
          created_at?: string
          document_ids?: string[]
          error?: string | null
          executive_summary?: string | null
          id?: string
          inventory_gaps?: Json
          jurisdiction_snapshot?: Json
          missing_documents?: Json
          model?: string | null
          needs_professional_confirmation?: Json
          project_context?: Json
          project_id?: string
          prompt_version?: string | null
          readiness_category?: string
          readiness_score?: number | null
          recommended_actions?: Json
          revision_label?: string
          sources?: Json
          status?: string
          submission_issues?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qaqc_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qaqc_revision_diffs: {
        Row: {
          added_sheets: Json
          base_review_id: string
          changes: Json
          compare_review_id: string
          created_at: string
          id: string
          project_id: string
          removed_sheets: Json
          revised_sheets: Json
          summary: string | null
          user_id: string
        }
        Insert: {
          added_sheets?: Json
          base_review_id: string
          changes?: Json
          compare_review_id: string
          created_at?: string
          id?: string
          project_id: string
          removed_sheets?: Json
          revised_sheets?: Json
          summary?: string | null
          user_id: string
        }
        Update: {
          added_sheets?: Json
          base_review_id?: string
          changes?: Json
          compare_review_id?: string
          created_at?: string
          id?: string
          project_id?: string
          removed_sheets?: Json
          revised_sheets?: Json
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qaqc_revision_diffs_base_review_id_fkey"
            columns: ["base_review_id"]
            isOneToOne: false
            referencedRelation: "qaqc_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qaqc_revision_diffs_compare_review_id_fkey"
            columns: ["compare_review_id"]
            isOneToOne: false
            referencedRelation: "qaqc_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qaqc_revision_diffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qaqc_sheets: {
        Row: {
          created_at: string
          discipline: string
          document_id: string | null
          id: string
          index_state: string
          notes: string | null
          professional_of_record: string | null
          review_id: string
          revision_date: string | null
          revision_number: string | null
          seal_status: string
          sheet_number: string
          sheet_title: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          discipline?: string
          document_id?: string | null
          id?: string
          index_state?: string
          notes?: string | null
          professional_of_record?: string | null
          review_id: string
          revision_date?: string | null
          revision_number?: string | null
          seal_status?: string
          sheet_number: string
          sheet_title?: string | null
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          discipline?: string
          document_id?: string | null
          id?: string
          index_state?: string
          notes?: string | null
          professional_of_record?: string | null
          review_id?: string
          revision_date?: string | null
          revision_number?: string | null
          seal_status?: string
          sheet_number?: string
          sheet_title?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qaqc_sheets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qaqc_sheets_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "qaqc_reviews"
            referencedColumns: ["id"]
          },
        ]
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
          authority_id: string | null
          created_at: string
          id: string
          jurisdiction: string | null
          last_verified_at: string | null
          level: Database["public"]["Enums"]["authority_level"] | null
          name: string
          phone: string | null
          raw_name: string | null
          roadmap_id: string
          role: string | null
          source_id: string | null
          url: string | null
          verification: Database["public"]["Enums"]["verification_label"]
        }
        Insert: {
          authority_id?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string | null
          last_verified_at?: string | null
          level?: Database["public"]["Enums"]["authority_level"] | null
          name: string
          phone?: string | null
          raw_name?: string | null
          roadmap_id: string
          role?: string | null
          source_id?: string | null
          url?: string | null
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Update: {
          authority_id?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string | null
          last_verified_at?: string | null
          level?: Database["public"]["Enums"]["authority_level"] | null
          name?: string
          phone?: string | null
          raw_name?: string | null
          roadmap_id?: string
          role?: string | null
          source_id?: string | null
          url?: string | null
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_agencies_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
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
          required_by_authority_id: string | null
          required_by_permit_id: string | null
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
          required_by_authority_id?: string | null
          required_by_permit_id?: string | null
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
          required_by_authority_id?: string | null
          required_by_permit_id?: string | null
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
            foreignKeyName: "roadmap_documents_required_by_authority_id_fkey"
            columns: ["required_by_authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
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
          authority_id: string | null
          category: Database["public"]["Enums"]["permit_category"] | null
          code_adoption_ids: string[]
          concurrent_with: string[]
          created_at: string
          critical_path: boolean
          depends_on: string[]
          fee_basis: string | null
          fee_estimate_cents: number | null
          id: string
          last_verified_at: string | null
          level: Database["public"]["Enums"]["authority_level"] | null
          likelihood: Database["public"]["Enums"]["permit_likelihood"]
          name: string
          notes: string | null
          review_days_max: number | null
          review_days_min: number | null
          roadmap_id: string
          sequence_order: number | null
          source_ids: string[]
          timeline_basis: Database["public"]["Enums"]["timeline_basis"]
          trigger_condition: string | null
          verification: Database["public"]["Enums"]["verification_label"]
        }
        Insert: {
          agency?: string | null
          authority_id?: string | null
          category?: Database["public"]["Enums"]["permit_category"] | null
          code_adoption_ids?: string[]
          concurrent_with?: string[]
          created_at?: string
          critical_path?: boolean
          depends_on?: string[]
          fee_basis?: string | null
          fee_estimate_cents?: number | null
          id?: string
          last_verified_at?: string | null
          level?: Database["public"]["Enums"]["authority_level"] | null
          likelihood?: Database["public"]["Enums"]["permit_likelihood"]
          name: string
          notes?: string | null
          review_days_max?: number | null
          review_days_min?: number | null
          roadmap_id: string
          sequence_order?: number | null
          source_ids?: string[]
          timeline_basis?: Database["public"]["Enums"]["timeline_basis"]
          trigger_condition?: string | null
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Update: {
          agency?: string | null
          authority_id?: string | null
          category?: Database["public"]["Enums"]["permit_category"] | null
          code_adoption_ids?: string[]
          concurrent_with?: string[]
          created_at?: string
          critical_path?: boolean
          depends_on?: string[]
          fee_basis?: string | null
          fee_estimate_cents?: number | null
          id?: string
          last_verified_at?: string | null
          level?: Database["public"]["Enums"]["authority_level"] | null
          likelihood?: Database["public"]["Enums"]["permit_likelihood"]
          name?: string
          notes?: string | null
          review_days_max?: number | null
          review_days_min?: number | null
          roadmap_id?: string
          sequence_order?: number | null
          source_ids?: string[]
          timeline_basis?: Database["public"]["Enums"]["timeline_basis"]
          trigger_condition?: string | null
          verification?: Database["public"]["Enums"]["verification_label"]
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_permits_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
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
          additional_project_type_ids: string[]
          address: string | null
          address_normalized: string | null
          construction_type: string | null
          construction_value_cents: number | null
          created_at: string
          due_diligence: Json | null
          due_diligence_generated_at: string | null
          due_diligence_model: string | null
          dwelling_units: number | null
          friendly_project_type: string | null
          id: string
          intake_status: string
          intake_step: number
          lat: number | null
          lng: number | null
          occupancy_existing: string | null
          occupancy_proposed: string | null
          plain_scope: string | null
          primary_project_type_id: string | null
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
          additional_project_type_ids?: string[]
          address?: string | null
          address_normalized?: string | null
          construction_type?: string | null
          construction_value_cents?: number | null
          created_at?: string
          due_diligence?: Json | null
          due_diligence_generated_at?: string | null
          due_diligence_model?: string | null
          dwelling_units?: number | null
          friendly_project_type?: string | null
          id?: string
          intake_status?: string
          intake_step?: number
          lat?: number | null
          lng?: number | null
          occupancy_existing?: string | null
          occupancy_proposed?: string | null
          plain_scope?: string | null
          primary_project_type_id?: string | null
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
          additional_project_type_ids?: string[]
          address?: string | null
          address_normalized?: string | null
          construction_type?: string | null
          construction_value_cents?: number | null
          created_at?: string
          due_diligence?: Json | null
          due_diligence_generated_at?: string | null
          due_diligence_model?: string | null
          dwelling_units?: number | null
          friendly_project_type?: string | null
          id?: string
          intake_status?: string
          intake_step?: number
          lat?: number | null
          lng?: number | null
          occupancy_existing?: string | null
          occupancy_proposed?: string | null
          plain_scope?: string | null
          primary_project_type_id?: string | null
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
            foreignKeyName: "scope_of_work_primary_project_type_id_fkey"
            columns: ["primary_project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
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
      service_discount_codes: {
        Row: {
          active: boolean
          amount_off_cents: number | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_redemptions: number | null
          percent_off: number | null
          product_id: string | null
          redemptions: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_off_cents?: number | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          percent_off?: number | null
          product_id?: string | null
          redemptions?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_off_cents?: number | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          percent_off?: number | null
          product_id?: string | null
          redemptions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_discount_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "service_products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_entitlements: {
        Row: {
          created_at: string
          delivery_tier: Database["public"]["Enums"]["service_delivery_tier"]
          entitlement_status: Database["public"]["Enums"]["service_entitlement_status"]
          entitlement_type: Database["public"]["Enums"]["service_entitlement_type"]
          expires_at: string | null
          granted_by: string | null
          id: string
          order_id: string | null
          organization_id: string | null
          product_id: string
          project_id: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          entitlement_status?: Database["public"]["Enums"]["service_entitlement_status"]
          entitlement_type?: Database["public"]["Enums"]["service_entitlement_type"]
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string | null
          product_id: string
          project_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          entitlement_status?: Database["public"]["Enums"]["service_entitlement_status"]
          entitlement_type?: Database["public"]["Enums"]["service_entitlement_type"]
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string | null
          product_id?: string
          project_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_entitlements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "service_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_entitlements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          created_at: string
          delivery_tier: Database["public"]["Enums"]["service_delivery_tier"]
          id: string
          label: string | null
          order_id: string
          product_id: string
          quantity: number
          unit_amount_cents: number
        }
        Insert: {
          created_at?: string
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          id?: string
          label?: string | null
          order_id: string
          product_id: string
          quantity?: number
          unit_amount_cents?: number
        }
        Update: {
          created_at?: string
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          id?: string
          label?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          unit_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "service_products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          amount_cents: number
          client_notes: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          delivery_tier: Database["public"]["Enums"]["service_delivery_tier"]
          discount_cents: number
          environment: string
          id: string
          product_id: string
          project_id: string | null
          rush: boolean
          status: Database["public"]["Enums"]["service_order_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          client_notes?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          discount_cents?: number
          environment?: string
          id?: string
          product_id: string
          project_id?: string | null
          rush?: boolean
          status?: Database["public"]["Enums"]["service_order_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          client_notes?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          discount_cents?: number
          environment?: string
          id?: string
          product_id?: string
          project_id?: string | null
          rush?: boolean
          status?: Database["public"]["Enums"]["service_order_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "service_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_products: {
        Row: {
          active: boolean
          base_price_cents: number
          category: string
          client_question: string | null
          client_title: string
          commercial_price_cents: number | null
          complexity_multiplier: number
          created_at: string
          currency: string
          deliverables: Json
          description: string
          display_order: number
          eligibility_rules: Json
          id: string
          name: string
          product_key: string
          professional_review_price_cents: number | null
          recommended_phases: Json
          residential_price_cents: number | null
          rush_price_cents: number | null
          sheet_pricing_rules: Json
          supports_professional_review: boolean
          turnaround_estimate: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price_cents?: number
          category: string
          client_question?: string | null
          client_title: string
          commercial_price_cents?: number | null
          complexity_multiplier?: number
          created_at?: string
          currency?: string
          deliverables?: Json
          description: string
          display_order?: number
          eligibility_rules?: Json
          id?: string
          name: string
          product_key: string
          professional_review_price_cents?: number | null
          recommended_phases?: Json
          residential_price_cents?: number | null
          rush_price_cents?: number | null
          sheet_pricing_rules?: Json
          supports_professional_review?: boolean
          turnaround_estimate?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          category?: string
          client_question?: string | null
          client_title?: string
          commercial_price_cents?: number | null
          complexity_multiplier?: number
          created_at?: string
          currency?: string
          deliverables?: Json
          description?: string
          display_order?: number
          eligibility_rules?: Json
          id?: string
          name?: string
          product_key?: string
          professional_review_price_cents?: number | null
          recommended_phases?: Json
          residential_price_cents?: number | null
          rush_price_cents?: number | null
          sheet_pricing_rules?: Json
          supports_professional_review?: boolean
          turnaround_estimate?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_report_versions: {
        Row: {
          created_at: string
          delivery_tier: Database["public"]["Enums"]["service_delivery_tier"]
          id: string
          order_id: string | null
          payload: Json | null
          product_id: string
          project_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_table: string | null
          summary: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          id?: string
          order_id?: string | null
          payload?: Json | null
          product_id: string
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_table?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          delivery_tier?: Database["public"]["Enums"]["service_delivery_tier"]
          id?: string
          order_id?: string | null
          payload?: Json | null
          product_id?: string
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_table?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_report_versions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_report_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "service_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_report_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_upgrade_requests: {
        Row: {
          contact_value: string | null
          created_at: string
          desired_timeline: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          notes: string | null
          preferred_contact: string | null
          project_id: string | null
          request_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_value?: string | null
          created_at?: string
          desired_timeline?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          preferred_contact?: string | null
          project_id?: string | null
          request_type?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_value?: string | null
          created_at?: string
          desired_timeline?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          preferred_contact?: string | null
          project_id?: string | null
          request_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_upgrade_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_agent_runs: {
        Row: {
          agent: Database["public"]["Enums"]["sir_agent"]
          assignment_id: string
          completed_at: string | null
          created_at: string
          error: string | null
          findings_created: number
          id: string
          input_version: number
          module: string
          notes: string | null
          output_version: number
          retry_count: number
          reviewer_action: string | null
          revision: number
          sequence: number
          sources_found: number
          started_at: string | null
          status: Database["public"]["Enums"]["sir_task_status"]
          task: string
          updated_at: string
        }
        Insert: {
          agent: Database["public"]["Enums"]["sir_agent"]
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          findings_created?: number
          id?: string
          input_version?: number
          module: string
          notes?: string | null
          output_version?: number
          retry_count?: number
          reviewer_action?: string | null
          revision?: number
          sequence?: number
          sources_found?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["sir_task_status"]
          task: string
          updated_at?: string
        }
        Update: {
          agent?: Database["public"]["Enums"]["sir_agent"]
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          findings_created?: number
          id?: string
          input_version?: number
          module?: string
          notes?: string | null
          output_version?: number
          retry_count?: number
          reviewer_action?: string | null
          revision?: number
          sequence?: number
          sources_found?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["sir_task_status"]
          task?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sir_agent_runs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "sir_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_assignments: {
        Row: {
          complexity_level: number
          composed_report: Json | null
          created_at: string
          executive_summary: string | null
          id: string
          internal_notes: string | null
          last_error: string | null
          project_brief: Json
          project_id: string | null
          qaqc_passed_at: string | null
          recommendation:
            | Database["public"]["Enums"]["sir_recommendation"]
            | null
          recommendation_basis: string | null
          released_at: string | null
          request_id: string | null
          research_completed_at: string | null
          research_plan: Json
          research_started_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          source_freshness_days: number
          status: Database["public"]["Enums"]["sir_workflow_status"]
          tier: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          complexity_level?: number
          composed_report?: Json | null
          created_at?: string
          executive_summary?: string | null
          id?: string
          internal_notes?: string | null
          last_error?: string | null
          project_brief?: Json
          project_id?: string | null
          qaqc_passed_at?: string | null
          recommendation?:
            | Database["public"]["Enums"]["sir_recommendation"]
            | null
          recommendation_basis?: string | null
          released_at?: string | null
          request_id?: string | null
          research_completed_at?: string | null
          research_plan?: Json
          research_started_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          source_freshness_days?: number
          status?: Database["public"]["Enums"]["sir_workflow_status"]
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          complexity_level?: number
          composed_report?: Json | null
          created_at?: string
          executive_summary?: string | null
          id?: string
          internal_notes?: string | null
          last_error?: string | null
          project_brief?: Json
          project_id?: string | null
          qaqc_passed_at?: string | null
          recommendation?:
            | Database["public"]["Enums"]["sir_recommendation"]
            | null
          recommendation_basis?: string | null
          released_at?: string | null
          request_id?: string | null
          research_completed_at?: string | null
          research_plan?: Json
          research_started_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          source_freshness_days?: number
          status?: Database["public"]["Enums"]["sir_workflow_status"]
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sir_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_assignments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "sir_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_conflicts: {
        Row: {
          affects_feasibility: boolean
          assigned_to: string
          assignment_id: string
          conflicting_sources: string | null
          created_at: string
          finding_a: string | null
          finding_b: string | null
          id: string
          module: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          affects_feasibility?: boolean
          assigned_to?: string
          assignment_id: string
          conflicting_sources?: string | null
          created_at?: string
          finding_a?: string | null
          finding_b?: string | null
          id?: string
          module: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          affects_feasibility?: boolean
          assigned_to?: string
          assignment_id?: string
          conflicting_sources?: string | null
          created_at?: string
          finding_a?: string | null
          finding_b?: string | null
          id?: string
          module?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sir_conflicts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "sir_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_conflicts_finding_a_fkey"
            columns: ["finding_a"]
            isOneToOne: false
            referencedRelation: "sir_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_conflicts_finding_b_fkey"
            columns: ["finding_b"]
            isOneToOne: false
            referencedRelation: "sir_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_finding_sources: {
        Row: {
          accessed_at: string
          assignment_id: string
          created_at: string
          document_id: string | null
          effective_date: string | null
          finding_id: string
          id: string
          link_ok: boolean | null
          locator: string | null
          publishing_authority: string | null
          source_name: string
          supports: string | null
          tier: Database["public"]["Enums"]["sir_source_tier"]
          url: string | null
        }
        Insert: {
          accessed_at?: string
          assignment_id: string
          created_at?: string
          document_id?: string | null
          effective_date?: string | null
          finding_id: string
          id?: string
          link_ok?: boolean | null
          locator?: string | null
          publishing_authority?: string | null
          source_name: string
          supports?: string | null
          tier?: Database["public"]["Enums"]["sir_source_tier"]
          url?: string | null
        }
        Update: {
          accessed_at?: string
          assignment_id?: string
          created_at?: string
          document_id?: string | null
          effective_date?: string | null
          finding_id?: string
          id?: string
          link_ok?: boolean | null
          locator?: string | null
          publishing_authority?: string | null
          source_name?: string
          supports?: string | null
          tier?: Database["public"]["Enums"]["sir_source_tier"]
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sir_finding_sources_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "sir_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_finding_sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_finding_sources_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "sir_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_findings: {
        Row: {
          agency: string | null
          agent: Database["public"]["Enums"]["sir_agent"]
          ai_confidence: Database["public"]["Enums"]["sir_confidence"]
          analysis: string | null
          applicability: string | null
          assignment_id: string
          client_visible: boolean
          confirmation_required: boolean
          cost_impact: string | null
          created_at: string
          effective_date: string | null
          finding: string
          geographic_applicability: string | null
          id: string
          internal_note: string | null
          module: string
          project_id: string | null
          recommended_action: string | null
          research_question: string
          reviewer_note: string | null
          reviewer_status: Database["public"]["Enums"]["sir_reviewer_status"]
          revision: number
          risk_level: string | null
          schedule_impact: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["sir_verification_status"]
        }
        Insert: {
          agency?: string | null
          agent: Database["public"]["Enums"]["sir_agent"]
          ai_confidence?: Database["public"]["Enums"]["sir_confidence"]
          analysis?: string | null
          applicability?: string | null
          assignment_id: string
          client_visible?: boolean
          confirmation_required?: boolean
          cost_impact?: string | null
          created_at?: string
          effective_date?: string | null
          finding: string
          geographic_applicability?: string | null
          id?: string
          internal_note?: string | null
          module: string
          project_id?: string | null
          recommended_action?: string | null
          research_question: string
          reviewer_note?: string | null
          reviewer_status?: Database["public"]["Enums"]["sir_reviewer_status"]
          revision?: number
          risk_level?: string | null
          schedule_impact?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["sir_verification_status"]
        }
        Update: {
          agency?: string | null
          agent?: Database["public"]["Enums"]["sir_agent"]
          ai_confidence?: Database["public"]["Enums"]["sir_confidence"]
          analysis?: string | null
          applicability?: string | null
          assignment_id?: string
          client_visible?: boolean
          confirmation_required?: boolean
          cost_impact?: string | null
          created_at?: string
          effective_date?: string | null
          finding?: string
          geographic_applicability?: string | null
          id?: string
          internal_note?: string | null
          module?: string
          project_id?: string | null
          recommended_action?: string | null
          research_question?: string
          reviewer_note?: string | null
          reviewer_status?: Database["public"]["Enums"]["sir_reviewer_status"]
          revision?: number
          risk_level?: string | null
          schedule_impact?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["sir_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sir_findings_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "sir_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_followups: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          assignment_id: string
          created_at: string
          id: string
          module: string
          question: string
          updated_at: string
          why_it_matters: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          assignment_id: string
          created_at?: string
          id?: string
          module: string
          question: string
          updated_at?: string
          why_it_matters?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          assignment_id?: string
          created_at?: string
          id?: string
          module?: string
          question?: string
          updated_at?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sir_followups_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "sir_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_qa_exceptions: {
        Row: {
          assignment_id: string
          blocking: boolean
          check_name: string
          created_at: string
          detail: string
          finding_id: string | null
          id: string
          resolved: boolean
          resolved_at: string | null
          revision: number
          severity: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          blocking?: boolean
          check_name: string
          created_at?: string
          detail: string
          finding_id?: string | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          revision?: number
          severity?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          blocking?: boolean
          check_name?: string
          created_at?: string
          detail?: string
          finding_id?: string | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          revision?: number
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sir_qa_exceptions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "sir_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sir_qa_exceptions_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "sir_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      sir_requests: {
        Row: {
          approx_size: string | null
          company: string | null
          compiled_at: string | null
          compiled_report: Json | null
          created_at: string
          email: string
          existing_building: string | null
          finding_reviews: Json
          id: string
          intended_use: string
          jurisdiction: string
          name: string
          notes: string | null
          parcel_apn: string | null
          phone: string | null
          project_stage: string | null
          qa_report: Json | null
          qa_status: string
          report_needed: string | null
          research: Json | null
          research_audit: Json | null
          research_error: string | null
          research_model: string | null
          research_sources: Json | null
          research_status: string
          researched_at: string | null
          resolved_jurisdiction: Json | null
          review_stage: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_credential: string | null
          reviewer_name: string | null
          reviewer_summary: string | null
          role: string | null
          site_address: string | null
          status: string
          submitted_for_review_at: string | null
          target_date: string | null
        }
        Insert: {
          approx_size?: string | null
          company?: string | null
          compiled_at?: string | null
          compiled_report?: Json | null
          created_at?: string
          email: string
          existing_building?: string | null
          finding_reviews?: Json
          id?: string
          intended_use: string
          jurisdiction: string
          name: string
          notes?: string | null
          parcel_apn?: string | null
          phone?: string | null
          project_stage?: string | null
          qa_report?: Json | null
          qa_status?: string
          report_needed?: string | null
          research?: Json | null
          research_audit?: Json | null
          research_error?: string | null
          research_model?: string | null
          research_sources?: Json | null
          research_status?: string
          researched_at?: string | null
          resolved_jurisdiction?: Json | null
          review_stage?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_credential?: string | null
          reviewer_name?: string | null
          reviewer_summary?: string | null
          role?: string | null
          site_address?: string | null
          status?: string
          submitted_for_review_at?: string | null
          target_date?: string | null
        }
        Update: {
          approx_size?: string | null
          company?: string | null
          compiled_at?: string | null
          compiled_report?: Json | null
          created_at?: string
          email?: string
          existing_building?: string | null
          finding_reviews?: Json
          id?: string
          intended_use?: string
          jurisdiction?: string
          name?: string
          notes?: string | null
          parcel_apn?: string | null
          phone?: string | null
          project_stage?: string | null
          qa_report?: Json | null
          qa_status?: string
          report_needed?: string | null
          research?: Json | null
          research_audit?: Json | null
          research_error?: string | null
          research_model?: string | null
          research_sources?: Json | null
          research_status?: string
          researched_at?: string | null
          resolved_jurisdiction?: Json | null
          review_stage?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_credential?: string | null
          reviewer_name?: string | null
          reviewer_summary?: string | null
          role?: string | null
          site_address?: string | null
          status?: string
          submitted_for_review_at?: string | null
          target_date?: string | null
        }
        Relationships: []
      }
      site_investigation_findings: {
        Row: {
          category: string
          classification: string
          created_at: string
          detail: string | null
          id: string
          impact: string | null
          investigation_id: string
          sort_order: number
          source_title: string | null
          source_url: string | null
          title: string
          user_id: string
          verification: string
        }
        Insert: {
          category?: string
          classification?: string
          created_at?: string
          detail?: string | null
          id?: string
          impact?: string | null
          investigation_id: string
          sort_order?: number
          source_title?: string | null
          source_url?: string | null
          title: string
          user_id: string
          verification?: string
        }
        Update: {
          category?: string
          classification?: string
          created_at?: string
          detail?: string | null
          id?: string
          impact?: string | null
          investigation_id?: string
          sort_order?: number
          source_title?: string | null
          source_url?: string | null
          title?: string
          user_id?: string
          verification?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_investigation_findings_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "site_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_investigation_parcels: {
        Row: {
          acreage: number | null
          address: string | null
          county: string | null
          created_at: string
          id: string
          investigation_id: string
          jurisdiction: string | null
          label: string | null
          land_use: string | null
          notes: string | null
          parcel_number: string | null
          phase: string | null
          sort_order: number
          state: string | null
          updated_at: string
          user_id: string
          verification: string
          zoning: string | null
        }
        Insert: {
          acreage?: number | null
          address?: string | null
          county?: string | null
          created_at?: string
          id?: string
          investigation_id: string
          jurisdiction?: string | null
          label?: string | null
          land_use?: string | null
          notes?: string | null
          parcel_number?: string | null
          phase?: string | null
          sort_order?: number
          state?: string | null
          updated_at?: string
          user_id: string
          verification?: string
          zoning?: string | null
        }
        Update: {
          acreage?: number | null
          address?: string | null
          county?: string | null
          created_at?: string
          id?: string
          investigation_id?: string
          jurisdiction?: string | null
          label?: string | null
          land_use?: string | null
          notes?: string | null
          parcel_number?: string | null
          phase?: string | null
          sort_order?: number
          state?: string | null
          updated_at?: string
          user_id?: string
          verification?: string
          zoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_investigation_parcels_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "site_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_investigation_permits: {
        Row: {
          agency: string | null
          approval: string
          concurrent: boolean
          created_at: string
          id: string
          investigation_id: string
          sequence_order: number
          source_url: string | null
          timeline_estimate: string | null
          trigger_condition: string | null
          user_id: string
          verification: string
          why_required: string | null
        }
        Insert: {
          agency?: string | null
          approval: string
          concurrent?: boolean
          created_at?: string
          id?: string
          investigation_id: string
          sequence_order?: number
          source_url?: string | null
          timeline_estimate?: string | null
          trigger_condition?: string | null
          user_id: string
          verification?: string
          why_required?: string | null
        }
        Update: {
          agency?: string | null
          approval?: string
          concurrent?: boolean
          created_at?: string
          id?: string
          investigation_id?: string
          sequence_order?: number
          source_url?: string | null
          timeline_estimate?: string | null
          trigger_condition?: string | null
          user_id?: string
          verification?: string
          why_required?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_investigation_permits_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "site_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_investigation_risks: {
        Row: {
          category: string
          created_at: string
          id: string
          investigation_id: string
          level: string
          mitigation: string | null
          parcel_label: string | null
          sort_order: number
          supporting_info: string | null
          updated_at: string
          user_id: string
          verification: string
          why: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          investigation_id: string
          level?: string
          mitigation?: string | null
          parcel_label?: string | null
          sort_order?: number
          supporting_info?: string | null
          updated_at?: string
          user_id: string
          verification?: string
          why?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          investigation_id?: string
          level?: string
          mitigation?: string | null
          parcel_label?: string | null
          sort_order?: number
          supporting_info?: string | null
          updated_at?: string
          user_id?: string
          verification?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_investigation_risks_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "site_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_investigations: {
        Row: {
          address: string
          assumptions: Json
          client_name: string | null
          complexity_label: string | null
          complexity_level: number
          created_at: string
          custom_quote_requested: boolean
          deal_killers: Json
          document_ids: string[]
          due_diligence: Json
          error: string | null
          executive_summary: string | null
          feasibility_rating: string
          feasibility_snapshot: Json
          followups: Json
          id: string
          investigation_plan: Json
          jurisdiction_snapshot: Json
          model: string | null
          modules: Json
          notes: string | null
          parcel_count: number
          parent_investigation_id: string | null
          prepared_date: string | null
          progress_step: string | null
          project_id: string
          project_type_id: string | null
          project_type_label: string | null
          prompt_version: string | null
          property_info: Json
          recommended_depth: string | null
          report: Json
          report_depth: string
          report_number: string | null
          site_acreage: number | null
          sources: Json
          status: string
          timeline: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          address: string
          assumptions?: Json
          client_name?: string | null
          complexity_label?: string | null
          complexity_level?: number
          created_at?: string
          custom_quote_requested?: boolean
          deal_killers?: Json
          document_ids?: string[]
          due_diligence?: Json
          error?: string | null
          executive_summary?: string | null
          feasibility_rating?: string
          feasibility_snapshot?: Json
          followups?: Json
          id?: string
          investigation_plan?: Json
          jurisdiction_snapshot?: Json
          model?: string | null
          modules?: Json
          notes?: string | null
          parcel_count?: number
          parent_investigation_id?: string | null
          prepared_date?: string | null
          progress_step?: string | null
          project_id: string
          project_type_id?: string | null
          project_type_label?: string | null
          prompt_version?: string | null
          property_info?: Json
          recommended_depth?: string | null
          report?: Json
          report_depth?: string
          report_number?: string | null
          site_acreage?: number | null
          sources?: Json
          status?: string
          timeline?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          address?: string
          assumptions?: Json
          client_name?: string | null
          complexity_label?: string | null
          complexity_level?: number
          created_at?: string
          custom_quote_requested?: boolean
          deal_killers?: Json
          document_ids?: string[]
          due_diligence?: Json
          error?: string | null
          executive_summary?: string | null
          feasibility_rating?: string
          feasibility_snapshot?: Json
          followups?: Json
          id?: string
          investigation_plan?: Json
          jurisdiction_snapshot?: Json
          model?: string | null
          modules?: Json
          notes?: string | null
          parcel_count?: number
          parent_investigation_id?: string | null
          prepared_date?: string | null
          progress_step?: string | null
          project_id?: string
          project_type_id?: string | null
          project_type_label?: string | null
          prompt_version?: string | null
          property_info?: Json
          recommended_depth?: string | null
          report?: Json
          report_depth?: string
          report_number?: string | null
          site_acreage?: number | null
          sources?: Json
          status?: string
          timeline?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_investigations_parent_investigation_id_fkey"
            columns: ["parent_investigation_id"]
            isOneToOne: false
            referencedRelation: "site_investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_investigations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_investigations_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
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
      user_settings: {
        Row: {
          brand_accent_color: string
          brand_address: string | null
          brand_company_name: string | null
          brand_contact_email: string | null
          brand_contact_phone: string | null
          brand_footer_note: string | null
          brand_license_number: string | null
          brand_logo_url: string | null
          company: string | null
          created_at: string
          digest_frequency: string
          full_name: string | null
          id: string
          job_title: string | null
          notify_corrections: boolean
          notify_deadlines: boolean
          notify_email_digest: boolean
          notify_inspections: boolean
          notify_permit_status: boolean
          phone: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_accent_color?: string
          brand_address?: string | null
          brand_company_name?: string | null
          brand_contact_email?: string | null
          brand_contact_phone?: string | null
          brand_footer_note?: string | null
          brand_license_number?: string | null
          brand_logo_url?: string | null
          company?: string | null
          created_at?: string
          digest_frequency?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          notify_corrections?: boolean
          notify_deadlines?: boolean
          notify_email_digest?: boolean
          notify_inspections?: boolean
          notify_permit_status?: boolean
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_accent_color?: string
          brand_address?: string | null
          brand_company_name?: string | null
          brand_contact_email?: string | null
          brand_contact_phone?: string | null
          brand_footer_note?: string | null
          brand_license_number?: string | null
          brand_logo_url?: string | null
          company?: string | null
          created_at?: string
          digest_frequency?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          notify_corrections?: boolean
          notify_deadlines?: boolean
          notify_email_digest?: boolean
          notify_inspections?: boolean
          notify_permit_status?: boolean
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_agent_run: { Args: { _run_id: string }; Returns: boolean }
      can_access_project: { Args: { _project_id: string }; Returns: boolean }
      can_write_project: { Args: { _project_id: string }; Returns: boolean }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["org_role"]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agent_reviewer: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
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
      authority_role:
        | "building"
        | "planning_zoning"
        | "fire"
        | "health"
        | "public_works"
        | "site_development"
        | "environmental"
        | "transportation_row"
        | "utility_water"
        | "utility_sewer"
        | "utility_electric"
        | "utility_gas"
        | "stormwater"
        | "historic"
        | "floodplain"
        | "other"
      code_discipline:
        | "building"
        | "residential"
        | "fire"
        | "accessibility"
        | "energy"
        | "plumbing"
        | "mechanical"
        | "electrical"
        | "health"
      jurisdiction_confirmation_status:
        | "unconfirmed"
        | "user_confirmed"
        | "pending_review"
        | "human_verified"
      org_kind: "client" | "professional" | "platform"
      org_role:
        | "client"
        | "client_admin"
        | "project_manager"
        | "permit_manager"
        | "researcher"
        | "qaqc_reviewer"
        | "authorized_reviewer"
        | "org_admin"
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
      permit_filing_status:
        | "draft"
        | "preflight"
        | "awaiting_approval"
        | "ready_to_submit"
        | "submitted"
        | "monitoring"
        | "issued"
        | "withdrawn"
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
      service_delivery_tier: "ai_assisted" | "professional_review"
      service_entitlement_status: "active" | "revoked" | "expired"
      service_entitlement_type:
        | "purchase"
        | "admin_grant"
        | "subscription"
        | "promotional"
        | "included"
      service_order_status:
        | "payment_required"
        | "paid"
        | "processing"
        | "waiting_client"
        | "ai_in_progress"
        | "professional_review"
        | "ready"
        | "delivered"
        | "cancelled"
        | "refunded"
      sir_agent:
        | "lead"
        | "intake_scope"
        | "property_jurisdiction"
        | "document_intelligence"
        | "zoning_entitlement"
        | "building_fire_health"
        | "utilities_infrastructure"
        | "transportation_access"
        | "environmental_constraints"
        | "fee_schedule"
        | "risk_feasibility"
        | "report_composition"
        | "qa_validation"
      sir_confidence: "high" | "medium" | "low"
      sir_recommendation:
        | "proceed"
        | "proceed_with_conditions"
        | "further_investigation_required"
        | "high_risk"
        | "not_recommended"
      sir_reviewer_status:
        | "unreviewed"
        | "approved"
        | "modified"
        | "requires_confirmation"
        | "suppressed"
        | "rejected"
      sir_source_tier:
        | "official_code"
        | "official_gis"
        | "official_map"
        | "official_instructions"
        | "official_fee_schedule"
        | "official_utility"
        | "agency_correspondence"
        | "client_document"
        | "secondary"
      sir_task_status:
        | "pending"
        | "running"
        | "complete"
        | "failed"
        | "skipped"
        | "integration_required"
      sir_verification_status:
        | "verified"
        | "preliminary_analysis"
        | "pending_confirmation"
        | "client_input_required"
        | "not_available"
        | "conflict_detected"
      sir_workflow_status:
        | "research_not_started"
        | "research_in_progress"
        | "research_complete"
        | "qaqc_failed"
        | "corrections_required"
        | "qaqc_passed"
        | "professional_review_pending"
        | "professionally_reviewed"
        | "approved_for_client_delivery"
      source_kind: "agency_site" | "code" | "ordinance" | "portal" | "other"
      timeline_basis:
        | "published"
        | "permivio_history"
        | "ai_estimate"
        | "unknown"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      authority_role: [
        "building",
        "planning_zoning",
        "fire",
        "health",
        "public_works",
        "site_development",
        "environmental",
        "transportation_row",
        "utility_water",
        "utility_sewer",
        "utility_electric",
        "utility_gas",
        "stormwater",
        "historic",
        "floodplain",
        "other",
      ],
      code_discipline: [
        "building",
        "residential",
        "fire",
        "accessibility",
        "energy",
        "plumbing",
        "mechanical",
        "electrical",
        "health",
      ],
      jurisdiction_confirmation_status: [
        "unconfirmed",
        "user_confirmed",
        "pending_review",
        "human_verified",
      ],
      org_kind: ["client", "professional", "platform"],
      org_role: [
        "client",
        "client_admin",
        "project_manager",
        "permit_manager",
        "researcher",
        "qaqc_reviewer",
        "authorized_reviewer",
        "org_admin",
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
      permit_filing_status: [
        "draft",
        "preflight",
        "awaiting_approval",
        "ready_to_submit",
        "submitted",
        "monitoring",
        "issued",
        "withdrawn",
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
      service_delivery_tier: ["ai_assisted", "professional_review"],
      service_entitlement_status: ["active", "revoked", "expired"],
      service_entitlement_type: [
        "purchase",
        "admin_grant",
        "subscription",
        "promotional",
        "included",
      ],
      service_order_status: [
        "payment_required",
        "paid",
        "processing",
        "waiting_client",
        "ai_in_progress",
        "professional_review",
        "ready",
        "delivered",
        "cancelled",
        "refunded",
      ],
      sir_agent: [
        "lead",
        "intake_scope",
        "property_jurisdiction",
        "document_intelligence",
        "zoning_entitlement",
        "building_fire_health",
        "utilities_infrastructure",
        "transportation_access",
        "environmental_constraints",
        "fee_schedule",
        "risk_feasibility",
        "report_composition",
        "qa_validation",
      ],
      sir_confidence: ["high", "medium", "low"],
      sir_recommendation: [
        "proceed",
        "proceed_with_conditions",
        "further_investigation_required",
        "high_risk",
        "not_recommended",
      ],
      sir_reviewer_status: [
        "unreviewed",
        "approved",
        "modified",
        "requires_confirmation",
        "suppressed",
        "rejected",
      ],
      sir_source_tier: [
        "official_code",
        "official_gis",
        "official_map",
        "official_instructions",
        "official_fee_schedule",
        "official_utility",
        "agency_correspondence",
        "client_document",
        "secondary",
      ],
      sir_task_status: [
        "pending",
        "running",
        "complete",
        "failed",
        "skipped",
        "integration_required",
      ],
      sir_verification_status: [
        "verified",
        "preliminary_analysis",
        "pending_confirmation",
        "client_input_required",
        "not_available",
        "conflict_detected",
      ],
      sir_workflow_status: [
        "research_not_started",
        "research_in_progress",
        "research_complete",
        "qaqc_failed",
        "corrections_required",
        "qaqc_passed",
        "professional_review_pending",
        "professionally_reviewed",
        "approved_for_client_delivery",
      ],
      source_kind: ["agency_site", "code", "ordinance", "portal", "other"],
      timeline_basis: [
        "published",
        "permivio_history",
        "ai_estimate",
        "unknown",
      ],
      verification_label: [
        "verified",
        "ai_assisted",
        "needs_agency_confirmation",
      ],
      verification_status: ["open", "in_review", "verified", "rejected"],
    },
  },
} as const
