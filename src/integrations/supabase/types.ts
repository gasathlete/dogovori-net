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
      download_quota: {
        Row: {
          analyses_used: number
          bonus_contracts: number
          contracts_used: number
          monthly_contracts_used: number
          monthly_reset_at: string
          monthly_templates_used: number
          plan: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used: number
          pro_period_start: string
          pro_until: string | null
          templates_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          analyses_used?: number
          bonus_contracts?: number
          contracts_used?: number
          monthly_contracts_used?: number
          monthly_reset_at?: string
          monthly_templates_used?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used?: number
          pro_period_start?: string
          pro_until?: string | null
          templates_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          analyses_used?: number
          bonus_contracts?: number
          contracts_used?: number
          monthly_contracts_used?: number
          monthly_reset_at?: string
          monthly_templates_used?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          pro_monthly_used?: number
          pro_period_start?: string
          pro_until?: string | null
          templates_used?: number
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
          ops_used: number
          period_start: string
          team_id: string
          updated_at: string
        }
        Insert: {
          ops_used?: number
          period_start?: string
          team_id: string
          updated_at?: string
        }
        Update: {
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
      consume_quota: { Args: { _kind: string }; Returns: Json }
      consume_team_quota: { Args: { _team_id: string }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
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
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      article_source: "user" | "admin"
      article_status: "pending" | "approved" | "rejected"
      blog_post_type: "core" | "user"
      contact_type: "individual" | "legal"
      document_kind: "contract" | "template"
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
      team_role: ["owner", "admin", "member"],
      user_plan: ["free", "pro"],
    },
  },
} as const
