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
      ai_audit_log: {
        Row: {
          contains_personal_data: boolean
          contains_special_category_data: boolean
          created_at: string
          error_code: string | null
          fallback_model: string | null
          fallback_used: boolean
          id: string
          model: string
          operation: string
          redaction_applied: boolean
          risk_level: string
          status: string
          team_id: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          contains_personal_data?: boolean
          contains_special_category_data?: boolean
          created_at?: string
          error_code?: string | null
          fallback_model?: string | null
          fallback_used?: boolean
          id?: string
          model: string
          operation: string
          redaction_applied?: boolean
          risk_level: string
          status: string
          team_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          contains_personal_data?: boolean
          contains_special_category_data?: boolean
          created_at?: string
          error_code?: string | null
          fallback_model?: string | null
          fallback_used?: boolean
          id?: string
          model?: string
          operation?: string
          redaction_applied?: boolean
          risk_level?: string
          status?: string
          team_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_parse_failures: {
        Row: {
          attempts: number | null
          break_context: string | null
          break_kind: string | null
          break_offset: number | null
          correlation_id: string | null
          created_at: string
          error_message: string | null
          fn: string
          id: string
          missing_closers: string | null
          model: string | null
          raw_length: number | null
          raw_tail: string | null
          repair_attempted: boolean
          stage: string
          suggestion: string | null
        }
        Insert: {
          attempts?: number | null
          break_context?: string | null
          break_kind?: string | null
          break_offset?: number | null
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          fn: string
          id?: string
          missing_closers?: string | null
          model?: string | null
          raw_length?: number | null
          raw_tail?: string | null
          repair_attempted?: boolean
          stage?: string
          suggestion?: string | null
        }
        Update: {
          attempts?: number | null
          break_context?: string | null
          break_kind?: string | null
          break_offset?: number | null
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          fn?: string
          id?: string
          missing_closers?: string | null
          model?: string | null
          raw_length?: number | null
          raw_tail?: string | null
          repair_attempted?: boolean
          stage?: string
          suggestion?: string | null
        }
        Relationships: []
      }
      ai_post_market_metrics: {
        Row: {
          blocked_count: number
          created_at: string
          date: string
          fallback_count: number
          id: string
          notes: string | null
          operation: string
          redaction_count: number
          special_category_blocks: number
          total_calls: number
          updated_at: string
          user_complaints: number
        }
        Insert: {
          blocked_count?: number
          created_at?: string
          date: string
          fallback_count?: number
          id?: string
          notes?: string | null
          operation: string
          redaction_count?: number
          special_category_blocks?: number
          total_calls?: number
          updated_at?: string
          user_complaints?: number
        }
        Update: {
          blocked_count?: number
          created_at?: string
          date?: string
          fallback_count?: number
          id?: string
          notes?: string | null
          operation?: string
          redaction_count?: number
          special_category_blocks?: number
          total_calls?: number
          updated_at?: string
          user_complaints?: number
        }
        Relationships: []
      }
      ai_prompt_sections: {
        Row: {
          content: string
          created_at: string
          enabled: boolean
          id: string
          order_idx: number
          prompt_id: string
          section_key: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          order_idx?: number
          prompt_id: string
          section_key: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          order_idx?: number
          prompt_id?: string
          section_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_sections_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          function_name: string
          id: string
          is_active: boolean
          model: string | null
          notes: string | null
          premium_model: string | null
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          function_name: string
          id?: string
          is_active?: boolean
          model?: string | null
          notes?: string | null
          premium_model?: string | null
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          function_name?: string
          id?: string
          is_active?: boolean
          model?: string | null
          notes?: string | null
          premium_model?: string | null
          version?: number
        }
        Relationships: []
      }
      ai_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          function_name: string
          id: string
          rule_text: string
          severity: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          function_name: string
          id?: string
          rule_text: string
          severity?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          function_name?: string
          id?: string
          rule_text?: string
          severity?: string
        }
        Relationships: []
      }
      ai_simulation_patches: {
        Row: {
          applied_prompt_id: string | null
          created_at: string
          current_content: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          patch_content: string
          patch_description: string
          regression_passed: boolean | null
          regression_result: Json | null
          section_key: string
          section_title: string | null
          session_id: string
          status: string
        }
        Insert: {
          applied_prompt_id?: string | null
          created_at?: string
          current_content?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          patch_content: string
          patch_description: string
          regression_passed?: boolean | null
          regression_result?: Json | null
          section_key: string
          section_title?: string | null
          session_id: string
          status?: string
        }
        Update: {
          applied_prompt_id?: string | null
          created_at?: string
          current_content?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          patch_content?: string
          patch_description?: string
          regression_passed?: boolean | null
          regression_result?: Json | null
          section_key?: string
          section_title?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_simulation_patches_applied_prompt_id_fkey"
            columns: ["applied_prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_simulation_patches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_simulation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_simulation_scenarios: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          expected_behavior: string | null
          id: string
          scenario_text: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          expected_behavior?: string | null
          id?: string
          scenario_text: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          expected_behavior?: string | null
          id?: string
          scenario_text?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_simulation_sessions: {
        Row: {
          avg_score: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          dogovary_model: string | null
          error_message: string | null
          function_name: string
          id: string
          lawyer_model: string
          max_turns: number
          prompt_version_id: string | null
          scenario: string | null
          scenario_id: string | null
          status: string
          turn_count: number
        }
        Insert: {
          avg_score?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dogovary_model?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          lawyer_model: string
          max_turns?: number
          prompt_version_id?: string | null
          scenario?: string | null
          scenario_id?: string | null
          status?: string
          turn_count?: number
        }
        Update: {
          avg_score?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dogovary_model?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          lawyer_model?: string
          max_turns?: number
          prompt_version_id?: string | null
          scenario?: string | null
          scenario_id?: string | null
          status?: string
          turn_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_simulation_sessions_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "ai_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_simulation_sessions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "ai_simulation_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_simulation_settings: {
        Row: {
          id: boolean
          max_cost_multiplier: number
          model_prices: Json
          router_enabled: boolean
          router_long_turns_threshold: number
          rubric_min_uplift_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          max_cost_multiplier?: number
          model_prices?: Json
          router_enabled?: boolean
          router_long_turns_threshold?: number
          rubric_min_uplift_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          max_cost_multiplier?: number
          model_prices?: Json
          router_enabled?: boolean
          router_long_turns_threshold?: number
          rubric_min_uplift_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_simulation_turns: {
        Row: {
          created_at: string
          dogovary_response: string
          dogovary_tools: Json
          id: string
          issues: Json
          lawyer_verdict: string
          score: number | null
          scores_breakdown: Json | null
          session_id: string
          turn_index: number
          user_message: string
        }
        Insert: {
          created_at?: string
          dogovary_response?: string
          dogovary_tools?: Json
          id?: string
          issues?: Json
          lawyer_verdict?: string
          score?: number | null
          scores_breakdown?: Json | null
          session_id: string
          turn_index: number
          user_message: string
        }
        Update: {
          created_at?: string
          dogovary_response?: string
          dogovary_tools?: Json
          id?: string
          issues?: Json
          lawyer_verdict?: string
          score?: number | null
          scores_breakdown?: Json | null
          session_id?: string
          turn_index?: number
          user_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_simulation_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_simulation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_examples: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          expected_output: string
          function_name: string
          id: string
          input_context: string
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          expected_output: string
          function_name: string
          id?: string
          input_context: string
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          expected_output?: string
          function_name?: string
          id?: string
          input_context?: string
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          cost_eur: number | null
          created_at: string
          function_name: string
          id: string
          ip_hash: string | null
          model: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          cost_eur?: number | null
          created_at?: string
          function_name: string
          id?: string
          ip_hash?: string | null
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          cost_eur?: number | null
          created_at?: string
          function_name?: string
          id?: string
          ip_hash?: string | null
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      anonymous_drafts: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          doc_key: string | null
          expires_at: string
          flow: string
          has_result: boolean
          id: string
          payload: Json
          route: string
          saved_doc_id: string | null
          step_idx: number
          token_hash: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_key?: string | null
          expires_at: string
          flow: string
          has_result?: boolean
          id?: string
          payload?: Json
          route: string
          saved_doc_id?: string | null
          step_idx?: number
          token_hash: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_key?: string | null
          expires_at?: string
          flow?: string
          has_result?: boolean
          id?: string
          payload?: Json
          route?: string
          saved_doc_id?: string | null
          step_idx?: number
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      assistant_edit_proposals: {
        Row: {
          after_text: string
          applied_at: string | null
          applied_updated_at: string | null
          base_context_version: string
          base_updated_at: string
          before_text: string
          created_at: string
          decided_at: string | null
          id: string
          reason: string | null
          reverted_at: string | null
          reverted_updated_at: string | null
          saved_document_id: string
          status: string
          target_path: string
          thread_id: string
          user_id: string
        }
        Insert: {
          after_text: string
          applied_at?: string | null
          applied_updated_at?: string | null
          base_context_version: string
          base_updated_at: string
          before_text: string
          created_at?: string
          decided_at?: string | null
          id?: string
          reason?: string | null
          reverted_at?: string | null
          reverted_updated_at?: string | null
          saved_document_id: string
          status?: string
          target_path: string
          thread_id: string
          user_id: string
        }
        Update: {
          after_text?: string
          applied_at?: string | null
          applied_updated_at?: string | null
          base_context_version?: string
          base_updated_at?: string
          before_text?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          reason?: string | null
          reverted_at?: string | null
          reverted_updated_at?: string | null
          saved_document_id?: string
          status?: string
          target_path?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_edit_proposals_saved_document_id_fkey"
            columns: ["saved_document_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_edit_proposals_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_threads: {
        Row: {
          context_entity_id: string | null
          context_kind: string | null
          context_title: string | null
          context_version: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_entity_id?: string | null
          context_kind?: string | null
          context_title?: string | null
          context_version?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_entity_id?: string | null
          context_kind?: string | null
          context_title?: string | null
          context_version?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blog_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_slug: string
          post_type: Database["public"]["Enums"]["blog_post_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_slug: string
          post_type: Database["public"]["Enums"]["blog_post_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_slug?: string
          post_type?: Database["public"]["Enums"]["blog_post_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blog_ratings: {
        Row: {
          created_at: string
          id: string
          post_slug: string
          post_type: Database["public"]["Enums"]["blog_post_type"]
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_slug: string
          post_type: Database["public"]["Enums"]["blog_post_type"]
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_slug?: string
          post_type?: Database["public"]["Enums"]["blog_post_type"]
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      branding_profiles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      branding_unlocks: {
        Row: {
          amount_eur: number | null
          environment: string | null
          source: string
          stripe_session_id: string | null
          unlocked_at: string
          user_id: string
        }
        Insert: {
          amount_eur?: number | null
          environment?: string | null
          source?: string
          stripe_session_id?: string | null
          unlocked_at?: string
          user_id: string
        }
        Update: {
          amount_eur?: number | null
          environment?: string | null
          source?: string
          stripe_session_id?: string | null
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      breach_incidents: {
        Row: {
          affected_subjects_count: number
          category: string
          closed_at: string | null
          created_at: string
          data_categories: string[]
          description: string
          detected_at: string
          id: string
          kzld_notified_at: string | null
          kzld_reference: string | null
          remediation: string | null
          reported_by: string | null
          risk_assessment: string | null
          root_cause: string | null
          severity: string
          status: string
          subjects_notified_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_subjects_count?: number
          category: string
          closed_at?: string | null
          created_at?: string
          data_categories?: string[]
          description: string
          detected_at: string
          id?: string
          kzld_notified_at?: string | null
          kzld_reference?: string | null
          remediation?: string | null
          reported_by?: string | null
          risk_assessment?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          subjects_notified_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_subjects_count?: number
          category?: string
          closed_at?: string | null
          created_at?: string
          data_categories?: string[]
          description?: string
          detected_at?: string
          id?: string
          kzld_notified_at?: string | null
          kzld_reference?: string | null
          remediation?: string | null
          reported_by?: string | null
          risk_assessment?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          subjects_notified_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      compliance_items: {
        Row: {
          control_ref: string
          created_at: string
          description: string | null
          due_date: string | null
          evidence_notes: string | null
          evidence_url: string | null
          framework: string
          id: string
          last_reviewed_at: string | null
          owner_role: string | null
          owner_user: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          control_ref: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          evidence_notes?: string | null
          evidence_url?: string | null
          framework: string
          id?: string
          last_reviewed_at?: string | null
          owner_role?: string | null
          owner_user?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          control_ref?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          evidence_notes?: string | null
          evidence_url?: string | null
          framework?: string
          id?: string
          last_reviewed_at?: string | null
          owner_role?: string | null
          owner_user?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          egn: string | null
          eik: string | null
          email: string | null
          id: string
          mol: string | null
          name: string
          notes: string | null
          phone: string | null
          team_id: string | null
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          user_id: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          egn?: string | null
          eik?: string | null
          email?: string | null
          id?: string
          mol?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          team_id?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          user_id: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          egn?: string | null
          eik?: string | null
          email?: string | null
          id?: string
          mol?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          team_id?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          user_id?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      contract_question_bank: {
        Row: {
          active: boolean
          contract_type: string | null
          created_at: string
          created_by: string | null
          field_type: string
          id: string
          importance: number
          options: Json | null
          question_text: string
          sector_id: string | null
          trigger_conditions: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          field_type?: string
          id?: string
          importance?: number
          options?: Json | null
          question_text: string
          sector_id?: string | null
          trigger_conditions?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          field_type?: string
          id?: string
          importance?: number
          options?: Json | null
          question_text?: string
          sector_id?: string | null
          trigger_conditions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      corrections_batch_charges: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          ops_charged: number
          session_id: string | null
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          ops_charged?: number
          session_id?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          ops_charged?: number
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      custom_contract_blanks: {
        Row: {
          blank_payload: Json
          category: string
          category_sector_id: string | null
          created_at: string
          id: string
          name: string
          occurrences: number
          published_document_name: string | null
          published_sector_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_user_id: string | null
          status: string
          text_hash: string
          updated_at: string
        }
        Insert: {
          blank_payload: Json
          category: string
          category_sector_id?: string | null
          created_at?: string
          id?: string
          name: string
          occurrences?: number
          published_document_name?: string | null
          published_sector_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_user_id?: string | null
          status?: string
          text_hash: string
          updated_at?: string
        }
        Update: {
          blank_payload?: Json
          category?: string
          category_sector_id?: string | null
          created_at?: string
          id?: string
          name?: string
          occurrences?: number
          published_document_name?: string | null
          published_sector_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_user_id?: string | null
          status?: string
          text_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          amount_eur: number | null
          counterparty: string | null
          counterparty_email: string | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          pinned: boolean
          status: Database["public"]["Enums"]["deal_status"]
          tags: string[]
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_eur?: number | null
          counterparty?: string | null
          counterparty_email?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          pinned?: boolean
          status?: Database["public"]["Enums"]["deal_status"]
          tags?: string[]
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_eur?: number | null
          counterparty?: string | null
          counterparty_email?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          pinned?: boolean
          status?: Database["public"]["Enums"]["deal_status"]
          tags?: string[]
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      document_blanks: {
        Row: {
          created_at: string
          document_name: string
          id: string
          sector_id: string
          storage_path: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          document_name: string
          id?: string
          sector_id: string
          storage_path: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          document_name?: string
          id?: string
          sector_id?: string
          storage_path?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      document_kit_items: {
        Row: {
          created_at: string
          id: string
          kit_id: string
          planned_doc_name: string | null
          position: number
          ref_label: string
          role: string
          saved_id: string | null
          uploaded_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kit_id: string
          planned_doc_name?: string | null
          position?: number
          ref_label: string
          role: string
          saved_id?: string | null
          uploaded_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kit_id?: string
          planned_doc_name?: string | null
          position?: number
          ref_label?: string
          role?: string
          saved_id?: string | null
          uploaded_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "document_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      document_kits: {
        Row: {
          created_at: string
          id: string
          source_kit_id: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_kit_id?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_kit_id?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_links: {
        Row: {
          child_saved_id: string | null
          child_uploaded_id: string | null
          created_at: string
          id: string
          parent_saved_id: string | null
          parent_uploaded_id: string | null
          ref_label: string
          ref_number: number | null
          ref_type: string
          superseded_by: string | null
          team_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          child_saved_id?: string | null
          child_uploaded_id?: string | null
          created_at?: string
          id?: string
          parent_saved_id?: string | null
          parent_uploaded_id?: string | null
          ref_label: string
          ref_number?: number | null
          ref_type: string
          superseded_by?: string | null
          team_id?: string | null
          user_id: string
          version?: number
        }
        Update: {
          child_saved_id?: string | null
          child_uploaded_id?: string | null
          created_at?: string
          id?: string
          parent_saved_id?: string | null
          parent_uploaded_id?: string | null
          ref_label?: string
          ref_number?: number | null
          ref_type?: string
          superseded_by?: string | null
          team_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_links_child_saved_id_fkey"
            columns: ["child_saved_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_child_uploaded_id_fkey"
            columns: ["child_uploaded_id"]
            isOneToOne: false
            referencedRelation: "uploaded_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_parent_saved_id_fkey"
            columns: ["parent_saved_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_parent_uploaded_id_fkey"
            columns: ["parent_uploaded_id"]
            isOneToOne: false
            referencedRelation: "uploaded_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "document_links"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reminders: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          kind: string
          note: string | null
          notified_at: string | null
          remind_at: string
          saved_document_id: string | null
          uploaded_contract_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          notified_at?: string | null
          remind_at: string
          saved_document_id?: string | null
          uploaded_contract_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          notified_at?: string | null
          remind_at?: string
          saved_document_id?: string | null
          uploaded_contract_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reminders_saved_document_id_fkey"
            columns: ["saved_document_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reminders_uploaded_contract_id_fkey"
            columns: ["uploaded_contract_id"]
            isOneToOne: false
            referencedRelation: "uploaded_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          id: string
          payload: Json
          saved_document_id: string
          title: string
          user_id: string
          version_no: number
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          saved_document_id: string
          title: string
          user_id: string
          version_no: number
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          saved_document_id?: string
          title?: string
          user_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_saved_document_id_fkey"
            columns: ["saved_document_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      download_quota: {
        Row: {
          ai_messages_used: number
          analyses_used: number
          analysis_previews_used: number
          bilingual_previews_used: number
          bonus_contracts: number
          contracts_used: number
          corrections_free_used: boolean
          corrections_free_used_count: number
          features_reset_at: string
          free_signing_used: boolean
          monthly_contracts_used: number
          monthly_reset_at: string
          monthly_templates_used: number
          monthly_total_used: number
          plan: Database["public"]["Enums"]["user_plan"]
          plan_ops_cap: number | null
          pro_monthly_used: number
          pro_period_start: string
          pro_until: string | null
          signup_at: string
          templates_used: number
          topup_ops_balance: number
          total_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_messages_used?: number
          analyses_used?: number
          analysis_previews_used?: number
          bilingual_previews_used?: number
          bonus_contracts?: number
          contracts_used?: number
          corrections_free_used?: boolean
          corrections_free_used_count?: number
          features_reset_at?: string
          free_signing_used?: boolean
          monthly_contracts_used?: number
          monthly_reset_at?: string
          monthly_templates_used?: number
          monthly_total_used?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          plan_ops_cap?: number | null
          pro_monthly_used?: number
          pro_period_start?: string
          pro_until?: string | null
          signup_at?: string
          templates_used?: number
          topup_ops_balance?: number
          total_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_messages_used?: number
          analyses_used?: number
          analysis_previews_used?: number
          bilingual_previews_used?: number
          bonus_contracts?: number
          contracts_used?: number
          corrections_free_used?: boolean
          corrections_free_used_count?: number
          features_reset_at?: string
          free_signing_used?: boolean
          monthly_contracts_used?: number
          monthly_reset_at?: string
          monthly_templates_used?: number
          monthly_total_used?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          plan_ops_cap?: number | null
          pro_monthly_used?: number
          pro_period_start?: string
          pro_until?: string | null
          signup_at?: string
          templates_used?: number
          topup_ops_balance?: number
          total_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feedback_submissions: {
        Row: {
          admin_notes: string | null
          body: string
          category: Database["public"]["Enums"]["feedback_category"]
          created_at: string
          email: string | null
          id: string
          rating: number | null
          source_context: Json
          source_page: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          body: string
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          email?: string | null
          id?: string
          rating?: number | null
          source_context?: Json
          source_page?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          body?: string
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          email?: string | null
          id?: string
          rating?: number | null
          source_context?: Json
          source_page?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_favorites: boolean
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_favorites?: boolean
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_favorites?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          created_at: string
          id: string
          name: string
          path: string | null
          props: Json
          session_id: string
          step: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          path?: string | null
          props?: Json
          session_id: string
          step?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          path?: string | null
          props?: Json
          session_id?: string
          step?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          error_code: string | null
          http_status: number | null
          id: string
          idempotency_key: string | null
          result: Json | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          idempotency_key?: string | null
          result?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          idempotency_key?: string | null
          result?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      glossary_terms: {
        Row: {
          body_md: string
          created_at: string
          created_by: string | null
          id: string
          published: boolean
          related_template_slugs: string[]
          seo_description: string | null
          seo_title: string | null
          short_definition: string
          slug: string
          term: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published?: boolean
          related_template_slugs?: string[]
          seo_description?: string | null
          seo_title?: string | null
          short_definition: string
          slug: string
          term: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published?: boolean
          related_template_slugs?: string[]
          seo_description?: string | null
          seo_title?: string | null
          short_definition?: string
          slug?: string
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      growth_briefs: {
        Row: {
          created_at: string
          headline: string | null
          id: string
          model: string | null
          period: Database["public"]["Enums"]["growth_period"]
          prompt_md: string | null
          reasoning: string | null
          snapshot: Json
          source: string
          top_actions: Json
          window_from: string
          window_to: string
        }
        Insert: {
          created_at?: string
          headline?: string | null
          id?: string
          model?: string | null
          period: Database["public"]["Enums"]["growth_period"]
          prompt_md?: string | null
          reasoning?: string | null
          snapshot?: Json
          source?: string
          top_actions?: Json
          window_from: string
          window_to: string
        }
        Update: {
          created_at?: string
          headline?: string | null
          id?: string
          model?: string | null
          period?: Database["public"]["Enums"]["growth_period"]
          prompt_md?: string | null
          reasoning?: string | null
          snapshot?: Json
          source?: string
          top_actions?: Json
          window_from?: string
          window_to?: string
        }
        Relationships: []
      }
      home_testimonials: {
        Row: {
          about: string | null
          consent_public: boolean
          created_at: string
          id: string
          is_admin_added: boolean
          is_approved: boolean
          is_verified_customer: boolean
          name: string
          order_ref: string | null
          photo_url: string
          position: number
          quote: string
          rating: number
          rejection_reason: string | null
          reviewed_at: string | null
          role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          about?: string | null
          consent_public?: boolean
          created_at?: string
          id?: string
          is_admin_added?: boolean
          is_approved?: boolean
          is_verified_customer?: boolean
          name: string
          order_ref?: string | null
          photo_url: string
          position?: number
          quote: string
          rating?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          about?: string | null
          consent_public?: boolean
          created_at?: string
          id?: string
          is_admin_added?: boolean
          is_approved?: boolean
          is_verified_customer?: boolean
          name?: string
          order_ref?: string | null
          photo_url?: string
          position?: number
          quote?: string
          rating?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lead_magnet_subscribers: {
        Row: {
          consent_at: string | null
          consent_version: string | null
          created_at: string
          email: string
          id: string
          magnet_slug: string
          marketing_consent: boolean
          name: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          consent_at?: string | null
          consent_version?: string | null
          created_at?: string
          email: string
          id?: string
          magnet_slug: string
          marketing_consent?: boolean
          name?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          consent_at?: string | null
          consent_version?: string | null
          created_at?: string
          email?: string
          id?: string
          magnet_slug?: string
          marketing_consent?: boolean
          name?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      legal_change_candidates: {
        Row: {
          celex: string | null
          created_at: string
          diff_metadata: Json
          effective_date: string | null
          gazette_issue: string | null
          id: string
          item_key: string
          lifecycle: string
          official_identifier: string | null
          publication_date: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          snapshot_id: string
          source_key: string
          summary: string | null
          superseded_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          celex?: string | null
          created_at?: string
          diff_metadata?: Json
          effective_date?: string | null
          gazette_issue?: string | null
          id?: string
          item_key: string
          lifecycle: string
          official_identifier?: string | null
          publication_date?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          snapshot_id: string
          source_key: string
          summary?: string | null
          superseded_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          celex?: string | null
          created_at?: string
          diff_metadata?: Json
          effective_date?: string | null
          gazette_issue?: string | null
          id?: string
          item_key?: string
          lifecycle?: string
          official_identifier?: string | null
          publication_date?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          snapshot_id?: string
          source_key?: string
          summary?: string | null
          superseded_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_change_candidates_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "legal_source_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_change_candidates_source_key_fkey"
            columns: ["source_key"]
            isOneToOne: false
            referencedRelation: "legal_source_registry"
            referencedColumns: ["source_key"]
          },
          {
            foreignKeyName: "legal_change_candidates_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "legal_change_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_chunks: {
        Row: {
          article_no: string | null
          chunk_index: number
          citation_label: string
          content: string
          content_tsv: unknown
          created_at: string
          document_id: string
          embedding: string | null
          heading_path: Json
          id: string
          paragraph_no: string | null
          source_id: string
          token_count: number | null
        }
        Insert: {
          article_no?: string | null
          chunk_index?: number
          citation_label: string
          content: string
          content_tsv?: unknown
          created_at?: string
          document_id: string
          embedding?: string | null
          heading_path?: Json
          id?: string
          paragraph_no?: string | null
          source_id: string
          token_count?: number | null
        }
        Update: {
          article_no?: string | null
          chunk_index?: number
          citation_label?: string
          content?: string
          content_tsv?: unknown
          created_at?: string
          document_id?: string
          embedding?: string | null
          heading_path?: Json
          id?: string
          paragraph_no?: string | null
          source_id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "legal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          checksum: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          language: string
          raw_text: string
          source_id: string
          token_count: number | null
          version: string
        }
        Insert: {
          checksum: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          language?: string
          raw_text: string
          source_id: string
          token_count?: number | null
          version: string
        }
        Update: {
          checksum?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          language?: string
          raw_text?: string
          source_id?: string
          token_count?: number | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "legal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_ingestion_runs: {
        Row: {
          byte_count: number | null
          changed_count: number
          content_type: string | null
          created_at: string
          discovered_count: number
          error_code: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          outcome: string
          source_key: string
          started_at: string
          trigger: string
        }
        Insert: {
          byte_count?: number | null
          changed_count?: number
          content_type?: string | null
          created_at?: string
          discovered_count?: number
          error_code?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          outcome: string
          source_key: string
          started_at?: string
          trigger: string
        }
        Update: {
          byte_count?: number | null
          changed_count?: number
          content_type?: string | null
          created_at?: string
          discovered_count?: number
          error_code?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          outcome?: string
          source_key?: string
          started_at?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_ingestion_runs_source_key_fkey"
            columns: ["source_key"]
            isOneToOne: false
            referencedRelation: "legal_source_registry"
            referencedColumns: ["source_key"]
          },
        ]
      }
      legal_source_registry: {
        Row: {
          access_method: string
          authority_tier: string
          created_at: string
          enabled: boolean
          entry_path: string
          expected_cadence: string
          freshness_state: string
          id: string
          jurisdiction: string
          last_attempt_at: string | null
          last_change_at: string | null
          last_success_at: string | null
          origin: string
          owner: string | null
          parser_version: string
          review_notes: string | null
          review_status: string
          source_key: string
          title: string
          updated_at: string
          watch_only: boolean
        }
        Insert: {
          access_method: string
          authority_tier: string
          created_at?: string
          enabled?: boolean
          entry_path: string
          expected_cadence?: string
          freshness_state?: string
          id?: string
          jurisdiction: string
          last_attempt_at?: string | null
          last_change_at?: string | null
          last_success_at?: string | null
          origin: string
          owner?: string | null
          parser_version?: string
          review_notes?: string | null
          review_status?: string
          source_key: string
          title: string
          updated_at?: string
          watch_only?: boolean
        }
        Update: {
          access_method?: string
          authority_tier?: string
          created_at?: string
          enabled?: boolean
          entry_path?: string
          expected_cadence?: string
          freshness_state?: string
          id?: string
          jurisdiction?: string
          last_attempt_at?: string | null
          last_change_at?: string | null
          last_success_at?: string | null
          origin?: string
          owner?: string | null
          parser_version?: string
          review_notes?: string | null
          review_status?: string
          source_key?: string
          title?: string
          updated_at?: string
          watch_only?: boolean
        }
        Relationships: []
      }
      legal_source_snapshots: {
        Row: {
          byte_count: number
          canonical_url: string
          checksum: string
          content_type: string
          created_at: string
          id: string
          parser_version: string
          raw_payload: string | null
          retrieved_at: string
          source_key: string
          storage_ref: string | null
        }
        Insert: {
          byte_count: number
          canonical_url: string
          checksum: string
          content_type: string
          created_at?: string
          id?: string
          parser_version: string
          raw_payload?: string | null
          retrieved_at?: string
          source_key: string
          storage_ref?: string | null
        }
        Update: {
          byte_count?: number
          canonical_url?: string
          checksum?: string
          content_type?: string
          created_at?: string
          id?: string
          parser_version?: string
          raw_payload?: string | null
          retrieved_at?: string
          source_key?: string
          storage_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_source_snapshots_source_key_fkey"
            columns: ["source_key"]
            isOneToOne: false
            referencedRelation: "legal_source_registry"
            referencedColumns: ["source_key"]
          },
        ]
      }
      legal_sources: {
        Row: {
          active: boolean
          created_at: string
          current_version: string | null
          id: string
          issuer: string | null
          jurisdiction: string
          language: string
          last_indexed_at: string | null
          metadata: Json
          official_url: string | null
          published_at: string | null
          short_code: string
          source_type: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          current_version?: string | null
          id?: string
          issuer?: string | null
          jurisdiction: string
          language?: string
          last_indexed_at?: string | null
          metadata?: Json
          official_url?: string | null
          published_at?: string | null
          short_code: string
          source_type: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          current_version?: string | null
          id?: string
          issuer?: string | null
          jurisdiction?: string
          language?: string
          last_indexed_at?: string | null
          metadata?: Json
          official_url?: string | null
          published_at?: string | null
          short_code?: string
          source_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_versions: {
        Row: {
          changelog_md: string | null
          created_at: string
          doc_key: string
          effective_at: string
          id: string
          material_change: boolean
          published_at: string
          summary: string
          version: string
        }
        Insert: {
          changelog_md?: string | null
          created_at?: string
          doc_key: string
          effective_at: string
          id?: string
          material_change?: boolean
          published_at?: string
          summary: string
          version: string
        }
        Update: {
          changelog_md?: string | null
          created_at?: string
          doc_key?: string
          effective_at?: string
          id?: string
          material_change?: boolean
          published_at?: string
          summary?: string
          version?: string
        }
        Relationships: []
      }
      loyalty_unlocks: {
        Row: {
          id: string
          subject_id: string
          subject_type: string
          tier_id: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          subject_id: string
          subject_type: string
          tier_id: string
          unlocked_at?: string
        }
        Update: {
          id?: string
          subject_id?: string
          subject_type?: string
          tier_id?: string
          unlocked_at?: string
        }
        Relationships: []
      }
      marketing_documents: {
        Row: {
          contact_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          payload: Json
          template_key: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          payload?: Json
          template_key: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          payload?: Json
          template_key?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          link: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_snapshots: {
        Row: {
          ai_ack_accepted: boolean
          billing_period: string | null
          created_at: string
          currency: string
          dpa_version: string | null
          environment: string
          id: string
          ip: unknown
          payment_status: string
          plan_name: string
          price_amount: number
          privacy_version: string
          purchase_kind: string
          refund_version: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          terms_version: string
          user_agent: string | null
          user_id: string
          vat_included: boolean
          vat_rate: number
          withdrawal_version: string
        }
        Insert: {
          ai_ack_accepted?: boolean
          billing_period?: string | null
          created_at?: string
          currency?: string
          dpa_version?: string | null
          environment?: string
          id?: string
          ip?: unknown
          payment_status?: string
          plan_name: string
          price_amount: number
          privacy_version: string
          purchase_kind?: string
          refund_version: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          terms_version: string
          user_agent?: string | null
          user_id: string
          vat_included?: boolean
          vat_rate?: number
          withdrawal_version: string
        }
        Update: {
          ai_ack_accepted?: boolean
          billing_period?: string | null
          created_at?: string
          currency?: string
          dpa_version?: string | null
          environment?: string
          id?: string
          ip?: unknown
          payment_status?: string
          plan_name?: string
          price_amount?: number
          privacy_version?: string
          purchase_kind?: string
          refund_version?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          terms_version?: string
          user_agent?: string | null
          user_id?: string
          vat_included?: boolean
          vat_rate?: number
          withdrawal_version?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          browser: string | null
          country: string | null
          created_at: string
          device: string | null
          duration_ms: number | null
          event: string
          id: string
          is_bounce: boolean
          os: string | null
          path: string
          referrer_host: string | null
          session_id: string
          user_id: string | null
          utm_source: string | null
          visitor_day_hash: string
        }
        Insert: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          duration_ms?: number | null
          event?: string
          id?: string
          is_bounce?: boolean
          os?: string | null
          path: string
          referrer_host?: string | null
          session_id: string
          user_id?: string | null
          utm_source?: string | null
          visitor_day_hash: string
        }
        Update: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          duration_ms?: number | null
          event?: string
          id?: string
          is_bounce?: boolean
          os?: string | null
          path?: string
          referrer_host?: string | null
          session_id?: string
          user_id?: string | null
          utm_source?: string | null
          visitor_day_hash?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          display_order: number
          id: string
          logo_url: string
          name: string
          status: string
          submitted_by: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_order?: number
          id?: string
          logo_url: string
          name: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_order?: number
          id?: string
          logo_url?: string
          name?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      pentest_plans: {
        Row: {
          checklist: Json
          created_at: string
          created_by: string | null
          evidence_url: string | null
          executed_date: string | null
          findings_high: number
          findings_low: number
          findings_medium: number
          id: string
          notes: string | null
          planned_date: string | null
          remediated: boolean
          reminder_at: string | null
          scope: string
          status: string
          updated_at: string
          vendor: string | null
          year: number
        }
        Insert: {
          checklist?: Json
          created_at?: string
          created_by?: string | null
          evidence_url?: string | null
          executed_date?: string | null
          findings_high?: number
          findings_low?: number
          findings_medium?: number
          id?: string
          notes?: string | null
          planned_date?: string | null
          remediated?: boolean
          reminder_at?: string | null
          scope: string
          status?: string
          updated_at?: string
          vendor?: string | null
          year: number
        }
        Update: {
          checklist?: Json
          created_at?: string
          created_by?: string | null
          evidence_url?: string | null
          executed_date?: string | null
          findings_high?: number
          findings_low?: number
          findings_medium?: number
          id?: string
          notes?: string | null
          planned_date?: string | null
          remediated?: boolean
          reminder_at?: string | null
          scope?: string
          status?: string
          updated_at?: string
          vendor?: string | null
          year?: number
        }
        Relationships: []
      }
      plan_comparison_rows: {
        Row: {
          active: boolean
          created_at: string
          entrepreneur_value: string
          free_value: string
          id: string
          label: string
          professional_value: string
          sort_order: number
          team_value: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          entrepreneur_value?: string
          free_value?: string
          id?: string
          label: string
          professional_value?: string
          sort_order?: number
          team_value?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          entrepreneur_value?: string
          free_value?: string
          id?: string
          label?: string
          professional_value?: string
          sort_order?: number
          team_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          active: boolean
          created_at: string
          feature: string
          id: string
          plan_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          feature: string
          id?: string
          plan_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          feature?: string
          id?: string
          plan_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          badge: string | null
          created_at: string
          highlight: boolean
          id: string
          monthly_price: number | null
          monthly_suffix: string | null
          name: string
          ops_cap_monthly: number | null
          seat_min: number | null
          sort_order: number
          tagline: string | null
          updated_at: string
          yearly_note: string | null
          yearly_price: number | null
          yearly_suffix: string | null
        }
        Insert: {
          active?: boolean
          badge?: string | null
          created_at?: string
          highlight?: boolean
          id: string
          monthly_price?: number | null
          monthly_suffix?: string | null
          name: string
          ops_cap_monthly?: number | null
          seat_min?: number | null
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          yearly_note?: string | null
          yearly_price?: number | null
          yearly_suffix?: string | null
        }
        Update: {
          active?: boolean
          badge?: string | null
          created_at?: string
          highlight?: boolean
          id?: string
          monthly_price?: number | null
          monthly_suffix?: string | null
          name?: string
          ops_cap_monthly?: number | null
          seat_min?: number | null
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          yearly_note?: string | null
          yearly_price?: number | null
          yearly_suffix?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allow_third_country_ai: boolean
          assistant_messages_used: number
          assistant_quota_reset_at: string
          avatar_url: string | null
          company: string | null
          created_at: string
          display_name: string | null
          id: string
          plan_welcome_plan: string | null
          plan_welcome_seen_at: string | null
          signature_data_url: string | null
          signature_name: string | null
          tutorial_seen_at: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          allow_third_country_ai?: boolean
          assistant_messages_used?: number
          assistant_quota_reset_at?: string
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          plan_welcome_plan?: string | null
          plan_welcome_seen_at?: string | null
          signature_data_url?: string | null
          signature_name?: string | null
          tutorial_seen_at?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          allow_third_country_ai?: boolean
          assistant_messages_used?: number
          assistant_quota_reset_at?: string
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          plan_welcome_plan?: string | null
          plan_welcome_seen_at?: string | null
          signature_data_url?: string | null
          signature_name?: string | null
          tutorial_seen_at?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      qa_bot_actions: {
        Row: {
          action: string
          bot_id: string
          created_at: string
          detail: Json
          duration_ms: number | null
          error_message: string | null
          error_stack: string | null
          http_status: number | null
          id: string
          run_id: string
          seq: number
          status: string
          target: string | null
        }
        Insert: {
          action: string
          bot_id: string
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          http_status?: number | null
          id?: string
          run_id: string
          seq?: number
          status?: string
          target?: string | null
        }
        Update: {
          action?: string
          bot_id?: string
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          http_status?: number | null
          id?: string
          run_id?: string
          seq?: number
          status?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_bot_actions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "qa_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_bot_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "qa_bot_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_bot_runs: {
        Row: {
          bot_id: string
          correlation_id: string | null
          failures: number
          finished_at: string | null
          id: string
          notes: string | null
          ops_done: number
          ops_planned: number
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          bot_id: string
          correlation_id?: string | null
          failures?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          ops_done?: number
          ops_planned?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          bot_id?: string
          correlation_id?: string | null
          failures?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          ops_done?: number
          ops_planned?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_bot_runs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "qa_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_bots: {
        Row: {
          consecutive_failures: number
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          max_ops_per_day: number
          name: string
          paused_reason: string | null
          paused_until: string | null
          safe_mode: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          max_ops_per_day?: number
          name: string
          paused_reason?: string | null
          paused_until?: string | null
          safe_mode?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          max_ops_per_day?: number
          name?: string
          paused_reason?: string | null
          paused_until?: string | null
          safe_mode?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      quota_session_charges: {
        Row: {
          created_at: string
          doc_key: string
          id: string
          kind: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_key: string
          id?: string
          kind: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_key?: string
          id?: string
          kind?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          count: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      restore_drills: {
        Row: {
          created_at: string
          evidence_url: string | null
          executed_at: string | null
          executor: string | null
          id: string
          issues: string | null
          outcome: string | null
          remediation: string | null
          rpo_measured_minutes: number | null
          rpo_target_minutes: number
          rto_measured_minutes: number | null
          rto_target_minutes: number
          scenario: string | null
          scheduled_at: string
          source_backup: string | null
          steps: Json
          tabletop_exercise: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_url?: string | null
          executed_at?: string | null
          executor?: string | null
          id?: string
          issues?: string | null
          outcome?: string | null
          remediation?: string | null
          rpo_measured_minutes?: number | null
          rpo_target_minutes?: number
          rto_measured_minutes?: number | null
          rto_target_minutes?: number
          scenario?: string | null
          scheduled_at: string
          source_backup?: string | null
          steps?: Json
          tabletop_exercise?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_url?: string | null
          executed_at?: string | null
          executor?: string | null
          id?: string
          issues?: string | null
          outcome?: string | null
          remediation?: string | null
          rpo_measured_minutes?: number | null
          rpo_target_minutes?: number
          rto_measured_minutes?: number | null
          rto_target_minutes?: number
          scenario?: string | null
          scheduled_at?: string
          source_backup?: string | null
          steps?: Json
          tabletop_exercise?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      restricted_processing_events: {
        Row: {
          action: string
          category: string
          created_at: string
          event_type: string
          function_name: string
          id: string
          ip_hash: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action?: string
          category: string
          created_at?: string
          event_type?: string
          function_name: string
          id?: string
          ip_hash?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          event_type?: string
          function_name?: string
          id?: string
          ip_hash?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      risk_analyses: {
        Row: {
          contract_type: string
          created_at: string
          id: string
          issues: Json
          missing_clauses: Json
          model: string
          negotiation_generated_at: string | null
          negotiation_strategy: Json | null
          score: number
          summary: string
          text_hash: string
          uploaded_contract_id: string
          user_id: string
          verification: Json | null
        }
        Insert: {
          contract_type?: string
          created_at?: string
          id?: string
          issues?: Json
          missing_clauses?: Json
          model: string
          negotiation_generated_at?: string | null
          negotiation_strategy?: Json | null
          score: number
          summary?: string
          text_hash?: string
          uploaded_contract_id: string
          user_id: string
          verification?: Json | null
        }
        Update: {
          contract_type?: string
          created_at?: string
          id?: string
          issues?: Json
          missing_clauses?: Json
          model?: string
          negotiation_generated_at?: string | null
          negotiation_strategy?: Json | null
          score?: number
          summary?: string
          text_hash?: string
          uploaded_contract_id?: string
          user_id?: string
          verification?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_analyses_uploaded_contract_fk"
            columns: ["uploaded_contract_id"]
            isOneToOne: false
            referencedRelation: "uploaded_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_analyses_uploaded_contract_id_fkey"
            columns: ["uploaded_contract_id"]
            isOneToOne: false
            referencedRelation: "uploaded_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_documents: {
        Row: {
          contact_id: string | null
          created_at: string
          deal_id: string | null
          folder_id: string | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          payload: Json
          source_id: string | null
          tags: string[]
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          folder_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          payload: Json
          source_id?: string | null
          tags?: string[]
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          folder_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          payload?: Json
          source_id?: string | null
          tags?: string[]
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_documents_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_documents_folder_fk"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_links: {
        Row: {
          created_at: string
          document_id: string | null
          expires_at: string
          id: string
          owner_id: string
          owner_signature: string | null
          owner_signed_at: string | null
          owner_signer_name: string | null
          password_hash: string | null
          password_salt: string | null
          qes_file_mime: string | null
          qes_file_name: string | null
          qes_file_path: string | null
          qes_file_size: number | null
          revoked_at: string | null
          signature_method: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signed_signature: string | null
          signer_ip_hash: string | null
          signer_name: string | null
          token: string
          uploaded_contract_id: string | null
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          expires_at: string
          id?: string
          owner_id: string
          owner_signature?: string | null
          owner_signed_at?: string | null
          owner_signer_name?: string | null
          password_hash?: string | null
          password_salt?: string | null
          qes_file_mime?: string | null
          qes_file_name?: string | null
          qes_file_path?: string | null
          qes_file_size?: number | null
          revoked_at?: string | null
          signature_method?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signed_signature?: string | null
          signer_ip_hash?: string | null
          signer_name?: string | null
          token: string
          uploaded_contract_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          expires_at?: string
          id?: string
          owner_id?: string
          owner_signature?: string | null
          owner_signed_at?: string | null
          owner_signer_name?: string | null
          password_hash?: string | null
          password_salt?: string | null
          qes_file_mime?: string | null
          qes_file_name?: string | null
          qes_file_path?: string | null
          qes_file_size?: number | null
          revoked_at?: string | null
          signature_method?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signed_signature?: string | null
          signer_ip_hash?: string | null
          signer_name?: string | null
          token?: string
          uploaded_contract_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_links_document_fk"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_audit_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          request_id: string
          signer_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id: string
          signer_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string
          signer_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signing_audit_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "signing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_audit_events_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "signing_request_signers"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_request_signers: {
        Row: {
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          document_hash_at_sign: string | null
          email: string
          id: string
          name: string
          notified_at: string | null
          order_idx: number
          otp_attempts: number
          otp_code_hash: string | null
          otp_expires_at: string | null
          qes_file_mime: string | null
          qes_file_name: string | null
          qes_file_path: string | null
          qes_file_size: number | null
          representative_declaration: boolean
          request_id: string
          role: string | null
          ses_equivalence_accepted: boolean
          ses_equivalence_text_version: string | null
          sign_token: string
          signature_data_url: string | null
          signature_method: string
          signature_name: string | null
          signed_at: string | null
          signer_capacity: string | null
          signer_eik: string | null
          signer_ip_hash: string | null
          signer_user_agent: string | null
          status: Database["public"]["Enums"]["signer_status"]
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          document_hash_at_sign?: string | null
          email: string
          id?: string
          name: string
          notified_at?: string | null
          order_idx?: number
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          qes_file_mime?: string | null
          qes_file_name?: string | null
          qes_file_path?: string | null
          qes_file_size?: number | null
          representative_declaration?: boolean
          request_id: string
          role?: string | null
          ses_equivalence_accepted?: boolean
          ses_equivalence_text_version?: string | null
          sign_token: string
          signature_data_url?: string | null
          signature_method?: string
          signature_name?: string | null
          signed_at?: string | null
          signer_capacity?: string | null
          signer_eik?: string | null
          signer_ip_hash?: string | null
          signer_user_agent?: string | null
          status?: Database["public"]["Enums"]["signer_status"]
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          document_hash_at_sign?: string | null
          email?: string
          id?: string
          name?: string
          notified_at?: string | null
          order_idx?: number
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          qes_file_mime?: string | null
          qes_file_name?: string | null
          qes_file_path?: string | null
          qes_file_size?: number | null
          representative_declaration?: boolean
          request_id?: string
          role?: string | null
          ses_equivalence_accepted?: boolean
          ses_equivalence_text_version?: string | null
          sign_token?: string
          signature_data_url?: string | null
          signature_method?: string
          signature_name?: string | null
          signed_at?: string | null
          signer_capacity?: string | null
          signer_eik?: string | null
          signer_ip_hash?: string | null
          signer_user_agent?: string | null
          status?: Database["public"]["Enums"]["signer_status"]
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signing_request_signers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "signing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          deal_id: string | null
          document_snapshot: Json
          expires_at: string | null
          id: string
          metadata: Json
          order_mode: Database["public"]["Enums"]["signing_order_mode"]
          owner_id: string
          saved_document_id: string | null
          status: Database["public"]["Enums"]["signing_status"]
          team_id: string | null
          title: string
          updated_at: string
          uploaded_contract_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          document_snapshot: Json
          expires_at?: string | null
          id?: string
          metadata?: Json
          order_mode?: Database["public"]["Enums"]["signing_order_mode"]
          owner_id: string
          saved_document_id?: string | null
          status?: Database["public"]["Enums"]["signing_status"]
          team_id?: string | null
          title: string
          updated_at?: string
          uploaded_contract_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          document_snapshot?: Json
          expires_at?: string | null
          id?: string
          metadata?: Json
          order_mode?: Database["public"]["Enums"]["signing_order_mode"]
          owner_id?: string
          saved_document_id?: string | null
          status?: Database["public"]["Enums"]["signing_status"]
          team_id?: string | null
          title?: string
          updated_at?: string
          uploaded_contract_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signing_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_saved_document_id_fkey"
            columns: ["saved_document_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_training: {
        Row: {
          acknowledged_at: string
          document_key: string
          document_version: string
          id: string
          ip: unknown
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          document_key: string
          document_version: string
          id?: string
          ip?: unknown
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          document_key?: string
          document_version?: string
          id?: string
          ip?: unknown
          user_id?: string
        }
        Relationships: []
      }
      strict_doc_unlocks: {
        Row: {
          created_at: string
          doc_key: string
          doc_name: string | null
          environment: string
          expires_at: string
          id: string
          paid_price_eur: number
          sector_id: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_key: string
          doc_name?: string | null
          environment?: string
          expires_at?: string
          id?: string
          paid_price_eur?: number
          sector_id?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          doc_key?: string
          doc_name?: string | null
          environment?: string
          expires_at?: string
          id?: string
          paid_price_eur?: number
          sector_id?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string | null
          product_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string | null
          product_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string | null
          product_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          team_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          team_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          team_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          invited_at: string
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_usage: {
        Row: {
          lifetime_ops: number
          ops_used: number
          period_start: string
          team_id: string
          updated_at: string
        }
        Insert: {
          lifetime_ops?: number
          ops_used?: number
          period_start?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          lifetime_ops?: number
          ops_used?: number
          period_start?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_usage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          brand_color: string | null
          company_address: string | null
          company_eik: string | null
          company_email: string | null
          company_mol: string | null
          company_phone: string | null
          company_vat: string | null
          company_website: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          eu_only_ai: boolean
          id: string
          letterhead_enabled: boolean
          logo_url: string | null
          name: string
          owner_id: string
          seat_count: number
          signature_data_url: string | null
          signature_name: string | null
          sso_config: Json
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          vat_data: Json | null
        }
        Insert: {
          brand_color?: string | null
          company_address?: string | null
          company_eik?: string | null
          company_email?: string | null
          company_mol?: string | null
          company_phone?: string | null
          company_vat?: string | null
          company_website?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          eu_only_ai?: boolean
          id?: string
          letterhead_enabled?: boolean
          logo_url?: string | null
          name: string
          owner_id: string
          seat_count?: number
          signature_data_url?: string | null
          signature_name?: string | null
          sso_config?: Json
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          vat_data?: Json | null
        }
        Update: {
          brand_color?: string | null
          company_address?: string | null
          company_eik?: string | null
          company_email?: string | null
          company_mol?: string | null
          company_phone?: string | null
          company_vat?: string | null
          company_website?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          eu_only_ai?: boolean
          id?: string
          letterhead_enabled?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string
          seat_count?: number
          signature_data_url?: string | null
          signature_name?: string | null
          sso_config?: Json
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          vat_data?: Json | null
        }
        Relationships: []
      }
      template_cache: {
        Row: {
          created_at: string
          hash: string
          payload: Json
        }
        Insert: {
          created_at?: string
          hash: string
          payload: Json
        }
        Update: {
          created_at?: string
          hash?: string
          payload?: Json
        }
        Relationships: []
      }
      template_clauses: {
        Row: {
          active: boolean
          body_md: string
          clause_id: string
          created_at: string
          created_by: string | null
          id: string
          include_when: string | null
          locale: string
          notes: string | null
          order: number
          severity: string
          template_slug: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_md: string
          clause_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          include_when?: string | null
          locale?: string
          notes?: string | null
          order?: number
          severity?: string
          template_slug: string
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_md?: string
          clause_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          include_when?: string | null
          locale?: string
          notes?: string | null
          order?: number
          severity?: string
          template_slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_download_counts: {
        Row: {
          count: number
          last_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          count?: number
          last_at?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          count?: number
          last_at?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_search_index: {
        Row: {
          bilingual: boolean
          category_id: string
          category_title: string
          created_at: string
          document_type: string | null
          has_dynamic_wizard: boolean
          key_clause: string
          lawyer_reviewed: boolean
          locale: string
          name: string
          purpose: string
          search_tsv: unknown
          slug: string
          updated_at: string
        }
        Insert: {
          bilingual?: boolean
          category_id: string
          category_title: string
          created_at?: string
          document_type?: string | null
          has_dynamic_wizard?: boolean
          key_clause?: string
          lawyer_reviewed?: boolean
          locale?: string
          name: string
          purpose?: string
          search_tsv?: unknown
          slug: string
          updated_at?: string
        }
        Update: {
          bilingual?: boolean
          category_id?: string
          category_title?: string
          created_at?: string
          document_type?: string | null
          has_dynamic_wizard?: boolean
          key_clause?: string
          lawyer_reviewed?: boolean
          locale?: string
          name?: string
          purpose?: string
          search_tsv?: unknown
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      topup_purchases: {
        Row: {
          amount_eur: number | null
          created_at: string
          environment: string
          id: string
          ops_added: number
          price_id: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_eur?: number | null
          created_at?: string
          environment?: string
          id?: string
          ops_added: number
          price_id: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_eur?: number | null
          created_at?: string
          environment?: string
          id?: string
          ops_added?: number
          price_id?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      uploaded_contracts: {
        Row: {
          contact_id: string | null
          created_at: string
          deal_id: string | null
          extracted_text: string
          folder_id: string | null
          id: string
          mime_type: string | null
          original_filename: string | null
          size_bytes: number | null
          source: string
          storage_path: string | null
          team_id: string | null
          text_hash: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          extracted_text?: string
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          source: string
          storage_path?: string | null
          team_id?: string | null
          text_hash?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          extracted_text?: string
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          team_id?: string | null
          text_hash?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_contracts_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_contracts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_contracts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_contracts_folder_fk"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_contracts_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_contracts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_articles: {
        Row: {
          category: string
          created_at: string
          faq: Json
          id: string
          image_url: string
          intro: string
          meta_description: string
          published_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sections: Json
          slug: string
          source: Database["public"]["Enums"]["article_source"]
          status: Database["public"]["Enums"]["article_status"]
          summary: string
          takeaways: Json
          title: string
          updated_at: string
          user_id: string
          word_count: number
        }
        Insert: {
          category: string
          created_at?: string
          faq?: Json
          id?: string
          image_url: string
          intro: string
          meta_description?: string
          published_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sections?: Json
          slug: string
          source?: Database["public"]["Enums"]["article_source"]
          status?: Database["public"]["Enums"]["article_status"]
          summary?: string
          takeaways?: Json
          title: string
          updated_at?: string
          user_id: string
          word_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          faq?: Json
          id?: string
          image_url?: string
          intro?: string
          meta_description?: string
          published_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sections?: Json
          slug?: string
          source?: Database["public"]["Enums"]["article_source"]
          status?: Database["public"]["Enums"]["article_status"]
          summary?: string
          takeaways?: Json
          title?: string
          updated_at?: string
          user_id?: string
          word_count?: number
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          consent_type: string
          created_at: string
          document_version: string
          granted: boolean
          granted_at: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_type: string
          created_at?: string
          document_version: string
          granted?: boolean
          granted_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_type?: string
          created_at?: string
          document_version?: string
          granted?: boolean
          granted_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          revoked_at?: string | null
          user_agent?: string | null
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
      vendor_assessments: {
        Row: {
          category: string
          country: string | null
          created_at: string
          dpa_url: string | null
          id: string
          iso27001: boolean
          last_reviewed_at: string | null
          next_review_at: string | null
          notes: string | null
          risk_level: string
          role: string
          scc_module: string | null
          scc_signed: boolean
          security_contact: string | null
          soc2_url: string | null
          status: string
          updated_at: string
          vendor_name: string
        }
        Insert: {
          category: string
          country?: string | null
          created_at?: string
          dpa_url?: string | null
          id?: string
          iso27001?: boolean
          last_reviewed_at?: string | null
          next_review_at?: string | null
          notes?: string | null
          risk_level?: string
          role: string
          scc_module?: string | null
          scc_signed?: boolean
          security_contact?: string | null
          soc2_url?: string | null
          status?: string
          updated_at?: string
          vendor_name: string
        }
        Update: {
          category?: string
          country?: string | null
          created_at?: string
          dpa_url?: string | null
          id?: string
          iso27001?: boolean
          last_reviewed_at?: string | null
          next_review_at?: string | null
          notes?: string | null
          risk_level?: string
          role?: string
          scc_module?: string | null
          scc_signed?: boolean
          security_contact?: string | null
          soc2_url?: string | null
          status?: string
          updated_at?: string
          vendor_name?: string
        }
        Relationships: []
      }
      web_vitals_daily: {
        Row: {
          created_at: string
          day: string
          device_class: string
          metric: string
          navigation_type: string
          rating: string
          route_group: string
          sample_count: number
          updated_at: string
          value_max: number
          value_min: number
          value_sum: number
        }
        Insert: {
          created_at?: string
          day?: string
          device_class: string
          metric: string
          navigation_type: string
          rating: string
          route_group: string
          sample_count?: number
          updated_at?: string
          value_max?: number
          value_min?: number
          value_sum?: number
        }
        Update: {
          created_at?: string
          day?: string
          device_class?: string
          metric?: string
          navigation_type?: string
          rating?: string
          route_group?: string
          sample_count?: number
          updated_at?: string
          value_max?: number
          value_min?: number
          value_sum?: number
        }
        Relationships: []
      }
    }
    Views: {
      blog_comments_public: {
        Row: {
          author_name: string | null
          content: string | null
          created_at: string | null
          id: string | null
          is_mine: boolean | null
          post_slug: string | null
          post_type: Database["public"]["Enums"]["blog_post_type"] | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _roll_feature_counters: {
        Args: { _uid: string }
        Returns: {
          ai_messages_used: number
          analyses_used: number
          analysis_previews_used: number
          bilingual_previews_used: number
          bonus_contracts: number
          contracts_used: number
          corrections_free_used: boolean
          corrections_free_used_count: number
          features_reset_at: string
          free_signing_used: boolean
          monthly_contracts_used: number
          monthly_reset_at: string
          monthly_templates_used: number
          monthly_total_used: number
          plan: Database["public"]["Enums"]["user_plan"]
          plan_ops_cap: number | null
          pro_monthly_used: number
          pro_period_start: string
          pro_until: string | null
          signup_at: string
          templates_used: number
          topup_ops_balance: number
          total_used: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "download_quota"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_add_bonus_contracts: {
        Args: { _count: number; _user_id: string }
        Returns: undefined
      }
      admin_financial_audit: {
        Args: { _months?: number }
        Returns: {
          active_paid: number
          active_teams: number
          ai_calls: number
          ai_cost_eur: number
          ai_tokens_in: number
          ai_tokens_out: number
          month: string
          new_signups: number
          ops_analysis: number
          ops_contract: number
          ops_corrections: number
          ops_template: number
          ops_total: number
          team_seats: number
        }[]
      }
      admin_list_ai_disclaimer_consents: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          display_name: string
          document_version: string
          email: string
          granted_at: string
          metadata: Json
          path: string
          session_id: string
          user_agent: string
          user_id: string
        }[]
      }
      admin_list_subscriptions: {
        Args: {
          _env?: string
          _limit?: number
          _search?: string
          _status?: string
        }
        Returns: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          display_name: string
          email: string
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_list_teams: {
        Args: {
          _env?: string
          _limit?: number
          _search?: string
          _status?: string
        }
        Returns: {
          created_at: string
          current_period_end: string
          current_period_start: string
          environment: string
          id: string
          lifetime_ops: number
          member_count: number
          name: string
          ops_used: number
          owner_email: string
          owner_id: string
          seat_count: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
        }[]
      }
      admin_list_users: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          analyses_used: number
          bonus_contracts: number
          contracts_used: number
          created_at: string
          display_name: string
          email: string
          is_admin: boolean
          is_moderator: boolean
          ops_monthly: number
          ops_total: number
          plan: Database["public"]["Enums"]["user_plan"]
          pro_until: string
          user_id: string
        }[]
      }
      admin_privacy_breakdown: {
        Args: { _dim: string; _from: string; _to: string }
        Returns: {
          count: number
          label: string
        }[]
      }
      admin_privacy_kpis: {
        Args: { _from: string; _to: string }
        Returns: {
          blocked_calls: number
          distinct_users: number
          fallback_used: number
          redacted_calls: number
          redaction_applied: number
          restricted_events: number
          special_category_calls: number
          tokens_in_sum: number
          tokens_out_sum: number
          total_calls: number
        }[]
      }
      admin_privacy_timeseries: {
        Args: { _bucket: string; _from: string; _to: string }
        Returns: {
          blocked: number
          bucket: string
          pii: number
          special: number
          total: number
        }[]
      }
      admin_revoke_pro: { Args: { _user_id: string }; Returns: undefined }
      admin_set_pro: {
        Args: { _months: number; _user_id: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_update_subscription: {
        Args: {
          _cancel_at_period_end?: boolean
          _current_period_end?: string
          _current_period_start?: string
          _environment?: string
          _id: string
          _price_id?: string
          _status?: string
        }
        Returns: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string | null
          product_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_team: {
        Args: {
          _current_period_end?: string
          _current_period_start?: string
          _environment?: string
          _id: string
          _seat_count?: number
          _status?: string
        }
        Returns: {
          brand_color: string | null
          company_address: string | null
          company_eik: string | null
          company_email: string | null
          company_mol: string | null
          company_phone: string | null
          company_vat: string | null
          company_website: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          eu_only_ai: boolean
          id: string
          letterhead_enabled: boolean
          logo_url: string | null
          name: string
          owner_id: string
          seat_count: number
          signature_data_url: string | null
          signature_name: string | null
          sso_config: Json
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          vat_data: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      analytics_app_kpis: {
        Args: { _from: string; _to: string }
        Returns: {
          conversion_rate: number
          ops: number
          paid_conversions: number
          signups: number
        }[]
      }
      analytics_kpis: {
        Args: { _from: string; _to: string }
        Returns: {
          avg_duration_ms: number
          bounce_rate: number
          pageviews: number
          visitors: number
        }[]
      }
      analytics_timeseries: {
        Args: { _bucket: string; _from: string; _to: string }
        Returns: {
          bucket: string
          pageviews: number
          visitors: number
        }[]
      }
      analytics_top: {
        Args: { _dim: string; _from: string; _limit: number; _to: string }
        Returns: {
          label: string
          pageviews: number
          visitors: number
        }[]
      }
      assemble_prompt_content: { Args: { _prompt_id: string }; Returns: string }
      assistant_edit_payload_path: {
        Args: { _path: string }
        Returns: string[]
      }
      assistant_edit_proposal_action: {
        Args: { _action: string; _proposal_id: string }
        Returns: Json
      }
      award_team_loyalty: {
        Args: { _team_id: string; _total_ops: number }
        Returns: Json
      }
      award_user_loyalty: { Args: { _total_ops: number }; Returns: Json }
      bg_to_lat: { Args: { input: string }; Returns: string }
      can_access_saved_document: {
        Args: { _document_id: string; _user_id: string }
        Returns: boolean
      }
      can_use_kit_slot: { Args: never; Returns: Json }
      charge_corrections_wave: {
        Args: { p_batch_id: string; p_count: number; p_user_id: string }
        Returns: Json
      }
      check_compliance_reminders: { Args: never; Returns: Json }
      cleanup_anonymous_drafts: { Args: never; Returns: number }
      consume_ai_message: { Args: never; Returns: Json }
      consume_analysis_preview: { Args: never; Returns: Json }
      consume_assistant_message: {
        Args: { _limit?: number; _user_id: string }
        Returns: Json
      }
      consume_bilingual_preview: { Args: never; Returns: Json }
      consume_corrections_batch: {
        Args: { _batch_id: string; _session_id: string }
        Returns: Json
      }
      consume_quota: { Args: { _kind: string }; Returns: Json }
      consume_quota_session: {
        Args: { _doc_key: string; _kind: string; _session_id: string }
        Returns: Json
      }
      consume_team_quota: { Args: { _team_id: string }; Returns: Json }
      credit_topup_ops: {
        Args: {
          p_amount: number
          p_environment: string
          p_ops: number
          p_price_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      free_ops_cap: { Args: { _user_id: string }; Returns: number }
      get_active_prompt: { Args: { _function_name: string }; Returns: string }
      get_first100_remaining: { Args: never; Returns: number }
      get_first90_remaining: { Args: never; Returns: number }
      get_my_activation_funnel: {
        Args: { _days?: number }
        Returns: {
          events: number
          sessions: number
          stage: string
        }[]
      }
      get_post_rating: {
        Args: {
          _post_slug: string
          _post_type: Database["public"]["Enums"]["blog_post_type"]
        }
        Returns: {
          avg_rating: number
          rating_count: number
        }[]
      }
      get_registered_users_count: { Args: never; Returns: number }
      growth_snapshot: { Args: { _from: string; _to: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_team_admin: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      match_legal_chunks: {
        Args: {
          jurisdictions?: string[]
          match_count?: number
          query_embedding: string
          query_text?: string
          source_types?: string[]
        }
        Returns: {
          article_no: string
          chunk_id: string
          citation_label: string
          content: string
          document_id: string
          jurisdiction: string
          official_url: string
          paragraph_no: string
          score: number
          similarity: number
          source_id: string
          source_short_code: string
          source_title: string
          text_rank: number
        }[]
      }
      metrics_event_timeseries: {
        Args: { _bucket: string; _from: string; _to: string }
        Returns: {
          bucket: string
          checkouts: number
          downloads: number
          starts: number
          upgrades: number
        }[]
      }
      metrics_overview: { Args: { _from: string; _to: string }; Returns: Json }
      my_team_ids: { Args: never; Returns: string[] }
      owner_scorecard: { Args: { _from: string; _to: string }; Returns: Json }
      purge_old_funnel_events: { Args: never; Returns: undefined }
      rate_limit_check: {
        Args: { _key: string; _max: number; _window_s: number }
        Returns: Json
      }
      record_web_vital_aggregate: {
        Args: {
          _device_class: string
          _metric: string
          _navigation_type: string
          _rating: string
          _route_group: string
          _value: number
        }
        Returns: undefined
      }
      refund_quota: {
        Args: { _kind: string; _used_bonus?: boolean; _user_id: string }
        Returns: undefined
      }
      render_plans_section_content: { Args: never; Returns: string }
      search_templates: {
        Args: {
          p_bilingual_only?: boolean
          p_category?: string
          p_document_type?: string
          p_dynamic_only?: boolean
          p_limit?: number
          p_offset?: number
          p_sort?: string
          q?: string
        }
        Returns: {
          bilingual: boolean
          category_id: string
          category_title: string
          document_type: string
          downloads: number
          has_dynamic_wizard: boolean
          key_clause: string
          lawyer_reviewed: boolean
          name: string
          purpose: string
          rank: number
          slug: string
          total: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_wizard_feedback: {
        Args: {
          _body: string
          _rating: number
          _source_context?: Json
          _subject?: string
        }
        Returns: Json
      }
      subscribe_lead_magnet: {
        Args: {
          _email: string
          _magnet_slug: string
          _marketing_consent: boolean
          _source_group: string
        }
        Returns: boolean
      }
      sync_plans_into_prompts: { Args: never; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
      unaccent_or_lower: { Args: { _t: string }; Returns: string }
      unread_notifications_count: { Args: never; Returns: number }
      verify_cron_secret: { Args: { _secret: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      article_source: "user" | "admin"
      article_status: "pending" | "approved" | "rejected"
      blog_post_type: "core" | "user"
      contact_type: "individual" | "legal"
      deal_status:
        | "draft"
        | "negotiating"
        | "signing"
        | "active"
        | "closed"
        | "archived"
      document_kind: "contract" | "template"
      feedback_category: "bug" | "idea" | "template_request" | "ui" | "other"
      feedback_status: "new" | "triaged" | "done" | "wontfix"
      growth_period: "daily" | "weekly" | "monthly" | "yearly"
      signer_status:
        | "pending"
        | "notified"
        | "viewed"
        | "otp_sent"
        | "signed"
        | "declined"
      signing_order_mode: "sequential" | "parallel"
      signing_status:
        | "draft"
        | "pending"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "expired"
        | "declined"
      team_role: "owner" | "admin" | "member"
      user_plan: "free" | "pro" | "professional" | "entrepreneur"
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
      app_role: ["admin", "moderator", "user"],
      article_source: ["user", "admin"],
      article_status: ["pending", "approved", "rejected"],
      blog_post_type: ["core", "user"],
      contact_type: ["individual", "legal"],
      deal_status: [
        "draft",
        "negotiating",
        "signing",
        "active",
        "closed",
        "archived",
      ],
      document_kind: ["contract", "template"],
      feedback_category: ["bug", "idea", "template_request", "ui", "other"],
      feedback_status: ["new", "triaged", "done", "wontfix"],
      growth_period: ["daily", "weekly", "monthly", "yearly"],
      signer_status: [
        "pending",
        "notified",
        "viewed",
        "otp_sent",
        "signed",
        "declined",
      ],
      signing_order_mode: ["sequential", "parallel"],
      signing_status: [
        "draft",
        "pending",
        "in_progress",
        "completed",
        "cancelled",
        "expired",
        "declined",
      ],
      team_role: ["owner", "admin", "member"],
      user_plan: ["free", "pro", "professional", "entrepreneur"],
    },
  },
} as const
