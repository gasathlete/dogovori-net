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
          notes: string | null
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          function_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          function_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
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
          created_at: string
          function_name: string
          id: string
          ip_hash: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          ip_hash?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          ip_hash?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
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
          session_id: string
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          session_id?: string
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
      download_quota: {
        Row: {
          ai_messages_used: number
          analyses_used: number
          analysis_previews_used: number
          bilingual_previews_used: number
          bonus_contracts: number
          contracts_used: number
          features_reset_at: string
          monthly_contracts_used: number
          monthly_reset_at: string
          monthly_templates_used: number
          monthly_total_used: number
          plan: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used: number
          pro_period_start: string
          pro_until: string | null
          templates_used: number
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
          features_reset_at?: string
          monthly_contracts_used?: number
          monthly_reset_at?: string
          monthly_templates_used?: number
          monthly_total_used?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used?: number
          pro_period_start?: string
          pro_until?: string | null
          templates_used?: number
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
          features_reset_at?: string
          monthly_contracts_used?: number
          monthly_reset_at?: string
          monthly_templates_used?: number
          monthly_total_used?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used?: number
          pro_period_start?: string
          pro_until?: string | null
          templates_used?: number
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
      illegal_content_attempts: {
        Row: {
          category: string
          created_at: string
          function_name: string
          id: string
          ip_hash: string | null
          matched_term: string | null
          payload_excerpt: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          function_name: string
          id?: string
          ip_hash?: string | null
          matched_term?: string | null
          payload_excerpt?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          function_name?: string
          id?: string
          ip_hash?: string | null
          matched_term?: string | null
          payload_excerpt?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          display_name: string | null
          id: string
          signature_data_url: string | null
          signature_name: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          signature_data_url?: string | null
          signature_name?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          signature_data_url?: string | null
          signature_name?: string | null
          updated_at?: string
          vat_number?: string | null
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
      risk_analyses: {
        Row: {
          contract_type: string
          created_at: string
          id: string
          issues: Json
          missing_clauses: Json
          model: string
          score: number
          summary: string
          text_hash: string
          uploaded_contract_id: string
          user_id: string
        }
        Insert: {
          contract_type?: string
          created_at?: string
          id?: string
          issues?: Json
          missing_clauses?: Json
          model: string
          score: number
          summary?: string
          text_hash?: string
          uploaded_contract_id: string
          user_id: string
        }
        Update: {
          contract_type?: string
          created_at?: string
          id?: string
          issues?: Json
          missing_clauses?: Json
          model?: string
          score?: number
          summary?: string
          text_hash?: string
          uploaded_contract_id?: string
          user_id?: string
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
          folder_id: string | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          payload: Json
          source_id: string | null
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          payload: Json
          source_id?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          payload?: Json
          source_id?: string | null
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
          revoked_at: string | null
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
          revoked_at?: string | null
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
          revoked_at?: string | null
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
          email: string
          id: string
          name: string
          notified_at: string | null
          order_idx: number
          otp_attempts: number
          otp_code_hash: string | null
          otp_expires_at: string | null
          request_id: string
          role: string | null
          sign_token: string
          signature_data_url: string | null
          signature_name: string | null
          signed_at: string | null
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
          email: string
          id?: string
          name: string
          notified_at?: string | null
          order_idx?: number
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          request_id: string
          role?: string | null
          sign_token: string
          signature_data_url?: string | null
          signature_name?: string | null
          signed_at?: string | null
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
          email?: string
          id?: string
          name?: string
          notified_at?: string | null
          order_idx?: number
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          request_id?: string
          role?: string | null
          sign_token?: string
          signature_data_url?: string | null
          signature_name?: string | null
          signed_at?: string | null
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
            foreignKeyName: "signing_requests_saved_document_id_fkey"
            columns: ["saved_document_id"]
            isOneToOne: false
            referencedRelation: "saved_documents"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          letterhead_enabled: boolean
          logo_url: string | null
          name: string
          owner_id: string
          seat_count: number
          signature_data_url: string | null
          signature_name: string | null
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
          id?: string
          letterhead_enabled?: boolean
          logo_url?: string | null
          name: string
          owner_id: string
          seat_count?: number
          signature_data_url?: string | null
          signature_name?: string | null
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
          id?: string
          letterhead_enabled?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string
          seat_count?: number
          signature_data_url?: string | null
          signature_name?: string | null
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
      uploaded_contracts: {
        Row: {
          contact_id: string | null
          created_at: string
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
    }
    Views: {
      [_ in never]: never
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
          features_reset_at: string
          monthly_contracts_used: number
          monthly_reset_at: string
          monthly_templates_used: number
          monthly_total_used: number
          plan: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used: number
          pro_period_start: string
          pro_until: string | null
          templates_used: number
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
          plan: Database["public"]["Enums"]["user_plan"]
          pro_until: string
          user_id: string
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
      assemble_prompt_content: { Args: { _prompt_id: string }; Returns: string }
      award_team_loyalty: {
        Args: { _team_id: string; _total_ops: number }
        Returns: Json
      }
      award_user_loyalty: { Args: { _total_ops: number }; Returns: Json }
      bg_to_lat: { Args: { input: string }; Returns: string }
      can_use_kit_slot: { Args: never; Returns: Json }
      consume_ai_message: { Args: never; Returns: Json }
      consume_analysis_preview: { Args: never; Returns: Json }
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_active_prompt: { Args: { _function_name: string }; Returns: string }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_team_ids: { Args: never; Returns: string[] }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refund_quota: {
        Args: { _kind: string; _used_bonus?: boolean; _user_id: string }
        Returns: undefined
      }
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
      unaccent: { Args: { "": string }; Returns: string }
      unaccent_or_lower: { Args: { _t: string }; Returns: string }
      unread_notifications_count: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      article_source: "user" | "admin"
      article_status: "pending" | "approved" | "rejected"
      blog_post_type: "core" | "user"
      contact_type: "individual" | "legal"
      document_kind: "contract" | "template"
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
      user_plan: "free" | "pro"
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
      app_role: ["admin", "moderator", "user"],
      article_source: ["user", "admin"],
      article_status: ["pending", "approved", "rejected"],
      blog_post_type: ["core", "user"],
      contact_type: ["individual", "legal"],
      document_kind: ["contract", "template"],
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
      user_plan: ["free", "pro"],
    },
  },
} as const
