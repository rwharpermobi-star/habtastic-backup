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
      accountability_partners: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          partner_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          partner_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          partner_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_challenges: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          difficulty: string | null
          expires_at: string | null
          id: string
          metadata: Json
          reward_coins: number
          reward_xp: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          reward_coins?: number
          reward_xp?: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          reward_coins?: number
          reward_xp?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_daily_coaching: {
        Row: {
          at_risk_habits: Json
          best_streak: number
          coaching_date: string
          completion_rate_7d: number
          created_at: string
          engagement_score: number | null
          id: string
          message: string
          metadata: Json
          model: string | null
          recommendations: Json
          suggested_challenge: Json | null
          tone: string | null
          user_id: string
        }
        Insert: {
          at_risk_habits?: Json
          best_streak?: number
          coaching_date: string
          completion_rate_7d?: number
          created_at?: string
          engagement_score?: number | null
          id?: string
          message: string
          metadata?: Json
          model?: string | null
          recommendations?: Json
          suggested_challenge?: Json | null
          tone?: string | null
          user_id: string
        }
        Update: {
          at_risk_habits?: Json
          best_streak?: number
          coaching_date?: string
          completion_rate_7d?: number
          created_at?: string
          engagement_score?: number | null
          id?: string
          message?: string
          metadata?: Json
          model?: string | null
          recommendations?: Json
          suggested_challenge?: Json | null
          tone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_weekly_reviews: {
        Row: {
          created_at: string
          highlights: Json
          id: string
          score: number | null
          suggestions: Json
          summary: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          highlights?: Json
          id?: string
          score?: number | null
          suggestions?: Json
          summary: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          highlights?: Json
          id?: string
          score?: number | null
          suggestions?: Json
          summary?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      avatar_generation_requests: {
        Row: {
          created_at: string
          preferences: Json
          request_id: string
          result: Json | null
          specification: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          preferences: Json
          request_id: string
          result?: Json | null
          specification?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          preferences?: Json
          request_id?: string
          result?: Json | null
          specification?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          completed_days: string[]
          created_at: string
          description: string
          duration: number
          emoji: string
          habit_name: string
          id: string
          reward_badge: string
          reward_xp: number
          start_date: string
          title: string
          user_id: string
        }
        Insert: {
          completed_days?: string[]
          created_at?: string
          description: string
          duration: number
          emoji: string
          habit_name: string
          id?: string
          reward_badge?: string
          reward_xp?: number
          start_date: string
          title: string
          user_id: string
        }
        Update: {
          completed_days?: string[]
          created_at?: string
          description?: string
          duration?: number
          emoji?: string
          habit_name?: string
          id?: string
          reward_badge?: string
          reward_xp?: number
          start_date?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          coach_id: string
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          coach_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          coach_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      client_telemetry_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      community_challenge_participants: {
        Row: {
          challenge_id: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          progress: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          progress?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          progress?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "community_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      community_challenges: {
        Row: {
          created_at: string
          description: string | null
          emoji: string | null
          end_at: string | null
          goal_value: number
          id: string
          is_active: boolean
          metadata: Json
          reward_coins: number
          reward_xp: number
          start_at: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          end_at?: string | null
          goal_value?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          reward_coins?: number
          reward_xp?: number
          start_at?: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          end_at?: string | null
          goal_value?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          reward_coins?: number
          reward_xp?: number
          start_at?: string
          title?: string
        }
        Relationships: []
      }
      community_clicks: {
        Row: {
          created_at: string
          destination: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          destination: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          destination?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      community_feed: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_hidden: boolean
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          is_hidden?: boolean
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_hidden?: boolean
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      community_feed_comments: {
        Row: {
          content: string
          created_at: string
          feed_id: string
          id: string
          is_hidden: boolean
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          feed_id: string
          id?: string
          is_hidden?: boolean
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          feed_id?: string
          id?: string
          is_hidden?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_feed_comments_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "community_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_feed_comments_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "community_trending_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      community_feed_reactions: {
        Row: {
          created_at: string
          emoji: string
          feed_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          feed_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          feed_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_feed_reactions_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "community_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_feed_reactions_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "community_trending_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      cosmetic_items: {
        Row: {
          asset_url: string | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          preview_url: string | null
          price_coins: number | null
          rarity: string
          unlock_rule: Json
        }
        Insert: {
          asset_url?: string | null
          category: string
          created_at?: string
          id: string
          is_active?: boolean
          name: string
          preview_url?: string | null
          price_coins?: number | null
          rarity: string
          unlock_rule?: Json
        }
        Update: {
          asset_url?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          preview_url?: string | null
          price_coins?: number | null
          rarity?: string
          unlock_rule?: Json
        }
        Relationships: []
      }
      daily_chests: {
        Row: {
          opened_at: string
          opened_on: string
          reward_type: string
          reward_value: number
          user_id: string
        }
        Insert: {
          opened_at?: string
          opened_on: string
          reward_type: string
          reward_value?: number
          user_id: string
        }
        Update: {
          opened_at?: string
          opened_on?: string
          reward_type?: string
          reward_value?: number
          user_id?: string
        }
        Relationships: []
      }
      daily_reflections: {
        Row: {
          coins_awarded: number
          created_at: string
          prompt: string
          reflection_date: string
          response: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          coins_awarded?: number
          created_at?: string
          prompt: string
          reflection_date: string
          response: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          coins_awarded?: number
          created_at?: string
          prompt?: string
          reflection_date?: string
          response?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diary_entries: {
        Row: {
          content: string
          created_at: string
          entry_at: string
          id: string
          mood: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          entry_at?: string
          id?: string
          mood?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_at?: string
          id?: string
          mood?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_enqueue_claims: {
        Row: {
          created_at: string
          idempotency_key: string
          message_id: string
          queue_message_id: number | null
          queue_name: string
        }
        Insert: {
          created_at?: string
          idempotency_key: string
          message_id: string
          queue_message_id?: number | null
          queue_name: string
        }
        Update: {
          created_at?: string
          idempotency_key?: string
          message_id?: string
          queue_message_id?: number | null
          queue_name?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: number
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: number
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: number
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
          visibility_timeout_seconds: number
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
          visibility_timeout_seconds?: number
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
          visibility_timeout_seconds?: number
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
      feedback: {
        Row: {
          category: string | null
          created_at: string
          id: string
          message: string
          metadata: Json
          status: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          status?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      friend_challenges: {
        Row: {
          code: string
          completed_at: string | null
          created_at: string
          creator_id: string
          creator_progress: number
          duration_days: number
          habit_name: string
          id: string
          opponent_id: string | null
          opponent_progress: number
          start_date: string
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          code: string
          completed_at?: string | null
          created_at?: string
          creator_id: string
          creator_progress?: number
          duration_days?: number
          habit_name: string
          id?: string
          opponent_id?: string | null
          opponent_progress?: number
          start_date?: string
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          code?: string
          completed_at?: string | null
          created_at?: string
          creator_id?: string
          creator_progress?: number
          duration_days?: number
          habit_name?: string
          id?: string
          opponent_id?: string | null
          opponent_progress?: number
          start_date?: string
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      friend_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gem_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_value: number | null
          deadline: string | null
          description: string | null
          frequency: string | null
          id: string
          status: string | null
          target_value: number | null
          title: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          status?: string | null
          target_value?: number | null
          title: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          status?: string | null
          target_value?: number | null
          title?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_play_revocations: {
        Row: {
          created_at: string
          granted_period_end: string | null
          id: string
          order_id: string
          premium_removed: boolean
          premium_until_after: string | null
          premium_until_before: string | null
          purchase_token: string
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_period_end?: string | null
          id?: string
          order_id: string
          premium_removed?: boolean
          premium_until_after?: string | null
          premium_until_before?: string | null
          purchase_token: string
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_period_end?: string | null
          id?: string
          order_id?: string
          premium_removed?: boolean
          premium_until_after?: string | null
          premium_until_before?: string | null
          purchase_token?: string
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_completion_operations: {
        Row: {
          completed: boolean
          created_at: string
          event_id: string
          habit_id: string
          local_date: string
          result: Json
          user_id: string
        }
        Insert: {
          completed: boolean
          created_at?: string
          event_id: string
          habit_id: string
          local_date: string
          result: Json
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          event_id?: string
          habit_id?: string
          local_date?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_completion_operations_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_completion_reward_claims: {
        Row: {
          created_at: string
          habit_id: string
          local_date: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          created_at?: string
          habit_id: string
          local_date: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          created_at?: string
          habit_id?: string
          local_date?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "habit_completion_reward_claims_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_verifications: {
        Row: {
          coins_awarded: number
          completed_date: string
          created_at: string
          habit_id: string
          question: string
          response: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          coins_awarded?: number
          completed_date: string
          created_at?: string
          habit_id: string
          question: string
          response: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          coins_awarded?: number
          completed_date?: string
          created_at?: string
          habit_id?: string
          question?: string
          response?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      habits: {
        Row: {
          category: string
          color: string
          completion_revision: number
          completions: string[]
          created_at: string
          custom_days: number[] | null
          difficulty: string
          emoji: string
          frequency: string
          id: string
          name: string
          reminder_enabled: boolean
          reminder_time: string | null
          reminder_tone: string
          sound_mode: string
          user_id: string
          verification_enabled: boolean
          verification_question: string | null
        }
        Insert: {
          category?: string
          color?: string
          completion_revision?: number
          completions?: string[]
          created_at?: string
          custom_days?: number[] | null
          difficulty?: string
          emoji?: string
          frequency?: string
          id?: string
          name: string
          reminder_enabled?: boolean
          reminder_time?: string | null
          reminder_tone?: string
          sound_mode?: string
          user_id: string
          verification_enabled?: boolean
          verification_question?: string | null
        }
        Update: {
          category?: string
          color?: string
          completion_revision?: number
          completions?: string[]
          created_at?: string
          custom_days?: number[] | null
          difficulty?: string
          emoji?: string
          frequency?: string
          id?: string
          name?: string
          reminder_enabled?: boolean
          reminder_time?: string | null
          reminder_tone?: string
          sound_mode?: string
          user_id?: string
          verification_enabled?: boolean
          verification_question?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          ai_feedback: string | null
          content: string
          created_at: string
          folder_id: string | null
          id: string
          is_voice: boolean
          mood: string
          mood_intensity: number
          topics: string[]
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          content: string
          created_at?: string
          folder_id?: string | null
          id?: string
          is_voice?: boolean
          mood?: string
          mood_intensity?: number
          topics?: string[]
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          content?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          is_voice?: boolean
          mood?: string
          mood_intensity?: number
          topics?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "journal_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_folders: {
        Row: {
          color: string
          created_at: string
          emoji: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_memories: {
        Row: {
          content: string
          created_at: string
          id: string
          memory_type: string
          relevance_score: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          memory_type?: string
          relevance_score?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          memory_type?: string
          relevance_score?: number
          user_id?: string
        }
        Relationships: []
      }
      journal_passcodes: {
        Row: {
          created_at: string
          id: string
          passcode_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          passcode_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          passcode_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_pin_state: {
        Row: {
          blocked_until: string | null
          failures: number
          unlocked_session: string | null
          unlocked_until: string | null
          user_id: string
        }
        Insert: {
          blocked_until?: string | null
          failures?: number
          unlocked_session?: string | null
          unlocked_until?: string | null
          user_id: string
        }
        Update: {
          blocked_until?: string | null
          failures?: number
          unlocked_session?: string | null
          unlocked_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leaderboard_crowns: {
        Row: {
          awarded_at: string
          period_start: string
          place: number
          user_id: string
        }
        Insert: {
          awarded_at?: string
          period_start: string
          place: number
          user_id: string
        }
        Update: {
          awarded_at?: string
          period_start?: string
          place?: number
          user_id?: string
        }
        Relationships: []
      }
      level_rewards_claimed: {
        Row: {
          claimed_at: string
          level: number
          rewards: Json
          user_id: string
        }
        Insert: {
          claimed_at?: string
          level: number
          rewards?: Json
          user_id: string
        }
        Update: {
          claimed_at?: string
          level?: number
          rewards?: Json
          user_id?: string
        }
        Relationships: []
      }
      mood_logs: {
        Row: {
          created_at: string
          date: string
          habit_id: string | null
          id: string
          intensity: number
          mood: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          habit_id?: string | null
          id?: string
          intensity?: number
          mood: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          habit_id?: string | null
          id?: string
          intensity?: number
          mood?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          body: string | null
          created_at: string
          dedup_key: string | null
          error: string | null
          habit_id: string | null
          id: string
          kind: string
          payload: Json
          sent_at: string
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          error?: string | null
          habit_id?: string | null
          id?: string
          kind: string
          payload?: Json
          sent_at?: string
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          error?: string | null
          habit_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          sent_at?: string
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          categories: Json
          comeback_enabled: boolean
          daily_reminder_time: string | null
          email_enabled: boolean
          missed_followups_enabled: boolean
          per_habit_enabled: boolean
          push_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          streak_pressure_enabled: boolean
          timezone: string
          updated_at: string
          user_id: string
          weekly_recap_dow: number
          weekly_recap_enabled: boolean
          weekly_recap_time: string
        }
        Insert: {
          categories?: Json
          comeback_enabled?: boolean
          daily_reminder_time?: string | null
          email_enabled?: boolean
          missed_followups_enabled?: boolean
          per_habit_enabled?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          streak_pressure_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_recap_dow?: number
          weekly_recap_enabled?: boolean
          weekly_recap_time?: string
        }
        Update: {
          categories?: Json
          comeback_enabled?: boolean
          daily_reminder_time?: string | null
          email_enabled?: boolean
          missed_followups_enabled?: boolean
          per_habit_enabled?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          streak_pressure_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_recap_dow?: number
          weekly_recap_enabled?: boolean
          weekly_recap_time?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_checkins: {
        Row: {
          created_at: string
          id: string
          message: string | null
          mood: string | null
          partnership_id: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          mood?: string | null
          partnership_id: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          mood?: string | null
          partnership_id?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_checkins_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "accountability_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount_cents: number
          bank_account_masked: string | null
          created_at: string
          currency: string
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          bank_account_masked?: string | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          bank_account_masked?: string | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      paystack_subscription_audit: {
        Row: {
          changed_fields: Json
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          changed_fields?: Json
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          changed_fields?: Json
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      paystack_webhook_events: {
        Row: {
          attempts: number
          duplicate_count: number
          error_message: string | null
          event_hash: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          next_retry_at: string | null
          payload: Json
          payload_summary: Json | null
          paystack_reference: string | null
          paystack_subscription_code: string | null
          processed_at: string | null
          raw_payload: Json | null
          received_at: string
          shop_order_id: string | null
          source: string | null
          status: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          duplicate_count?: number
          error_message?: string | null
          event_hash?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          next_retry_at?: string | null
          payload?: Json
          payload_summary?: Json | null
          paystack_reference?: string | null
          paystack_subscription_code?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          received_at?: string
          shop_order_id?: string | null
          source?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          duplicate_count?: number
          error_message?: string | null
          event_hash?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          next_retry_at?: string | null
          payload?: Json
          payload_summary?: Json | null
          paystack_reference?: string | null
          paystack_subscription_code?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          received_at?: string
          shop_order_id?: string | null
          source?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      premium_grants: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          days: number
          granted_by: string | null
          id: string
          kind: string
          metadata: Json
          paystack_event_id: string | null
          paystack_reference: string | null
          premium_until: string | null
          reason: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          days?: number
          granted_by?: string | null
          id?: string
          kind?: string
          metadata?: Json
          paystack_event_id?: string | null
          paystack_reference?: string | null
          premium_until?: string | null
          reason?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          days?: number
          granted_by?: string | null
          id?: string
          kind?: string
          metadata?: Json
          paystack_event_id?: string | null
          paystack_reference?: string | null
          premium_until?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_privacy: {
        Row: {
          allow_friend_requests: boolean
          profile_public: boolean
          show_on_leaderboard: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_friend_requests?: boolean
          profile_public?: boolean
          show_on_leaderboard?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_friend_requests?: boolean
          profile_public?: boolean
          show_on_leaderboard?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_avatar_credits_reset_at: string
          ai_avatar_credits_used: number
          avatar_url: string | null
          coach_gender: string | null
          coins: number
          created_at: string
          daily_ai_messages: number
          freeze_used_dates: string[]
          gems: number
          id: string
          is_premium: boolean
          last_ai_reset: string | null
          lifestyle_data: Json
          lifetime_premium: boolean
          name: string
          onboarding_complete: boolean
          premium_until: string | null
          streak_freezes: number
          suspended_until: string | null
          theme: string
          trial_started_at: string | null
          unlocked_effects: string[]
          unlocked_themes: string[]
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          ai_avatar_credits_reset_at?: string
          ai_avatar_credits_used?: number
          avatar_url?: string | null
          coach_gender?: string | null
          coins?: number
          created_at?: string
          daily_ai_messages?: number
          freeze_used_dates?: string[]
          gems?: number
          id?: string
          is_premium?: boolean
          last_ai_reset?: string | null
          lifestyle_data?: Json
          lifetime_premium?: boolean
          name?: string
          onboarding_complete?: boolean
          premium_until?: string | null
          streak_freezes?: number
          suspended_until?: string | null
          theme?: string
          trial_started_at?: string | null
          unlocked_effects?: string[]
          unlocked_themes?: string[]
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          ai_avatar_credits_reset_at?: string
          ai_avatar_credits_used?: number
          avatar_url?: string | null
          coach_gender?: string | null
          coins?: number
          created_at?: string
          daily_ai_messages?: number
          freeze_used_dates?: string[]
          gems?: number
          id?: string
          is_premium?: boolean
          last_ai_reset?: string | null
          lifestyle_data?: Json
          lifetime_premium?: boolean
          name?: string
          onboarding_complete?: boolean
          premium_until?: string | null
          streak_freezes?: number
          suspended_until?: string | null
          theme?: string
          trial_started_at?: string | null
          unlocked_effects?: string[]
          unlocked_themes?: string[]
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limits_ip: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_address: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_address: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      rate_limits_user: {
        Row: {
          action: string
          request_count: number
          user_id: string
          window_seconds: number
          window_start: string
        }
        Insert: {
          action: string
          request_count?: number
          user_id: string
          window_seconds: number
          window_start: string
        }
        Update: {
          action?: string
          request_count?: number
          user_id?: string
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      referral_points_ledger: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          milestone_count: number
          points_delta: number
          reason: string
          referral_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          milestone_count: number
          points_delta: number
          reason: string
          referral_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          milestone_count?: number
          points_delta?: number
          reason?: string
          referral_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_points_ledger_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_points_ledger_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_reward_milestones: {
        Row: {
          enabled: boolean
          lifetime: boolean
          milestone_count: number
          points_bonus: number
          premium_days: number
          updated_at: string
          xp_bonus: number
        }
        Insert: {
          enabled?: boolean
          lifetime?: boolean
          milestone_count: number
          points_bonus?: number
          premium_days?: number
          updated_at?: string
          xp_bonus?: number
        }
        Update: {
          enabled?: boolean
          lifetime?: boolean
          milestone_count?: number
          points_bonus?: number
          premium_days?: number
          updated_at?: string
          xp_bonus?: number
        }
        Relationships: []
      }
      referral_reward_program: {
        Row: {
          id: boolean
          new_user_claim_window_hours: number
          retention_xp_bonus: number
          signup_points_bonus: number
          signup_xp_bonus: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          new_user_claim_window_hours?: number
          retention_xp_bonus?: number
          signup_points_bonus?: number
          signup_xp_bonus?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          new_user_claim_window_hours?: number
          retention_xp_bonus?: number
          signup_points_bonus?: number
          signup_xp_bonus?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          granted_at: string
          id: string
          milestone: number
          premium_until_after: string | null
          qualified_count: number
          referrer_id: string
          reward_days: number
          reward_kind: string
        }
        Insert: {
          granted_at?: string
          id?: string
          milestone: number
          premium_until_after?: string | null
          qualified_count?: number
          referrer_id: string
          reward_days?: number
          reward_kind: string
        }
        Update: {
          granted_at?: string
          id?: string
          milestone?: number
          premium_until_after?: string | null
          qualified_count?: number
          referrer_id?: string
          reward_days?: number
          reward_kind?: string
        }
        Relationships: []
      }
      referral_signals: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          referral_id: string
          referred_id: string | null
          referrer_id: string
          signal_type: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          referral_id: string
          referred_id?: string | null
          referrer_id: string
          signal_type: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          referral_id?: string
          referred_id?: string | null
          referrer_id?: string
          signal_type?: string
          weight?: number
        }
        Relationships: []
      }
      referrals: {
        Row: {
          admin_notes: string | null
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          admin_status: string | null
          created_at: string
          device_fingerprint: string | null
          id: string
          joined_xp_awarded: boolean
          purchase_completed: boolean
          qualified_at: string | null
          qualifying_payment_reference: string | null
          qualifying_provider: string | null
          redeemed_at: string | null
          referral_code: string
          referred_id: string | null
          referrer_id: string
          retention_eligible_at: string | null
          retention_xp_awarded: boolean
          reward_days: number
          rewarded: boolean
          signup_ip: string | null
        }
        Insert: {
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          admin_status?: string | null
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          joined_xp_awarded?: boolean
          purchase_completed?: boolean
          qualified_at?: string | null
          qualifying_payment_reference?: string | null
          qualifying_provider?: string | null
          redeemed_at?: string | null
          referral_code: string
          referred_id?: string | null
          referrer_id: string
          retention_eligible_at?: string | null
          retention_xp_awarded?: boolean
          reward_days?: number
          rewarded?: boolean
          signup_ip?: string | null
        }
        Update: {
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          admin_status?: string | null
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          joined_xp_awarded?: boolean
          purchase_completed?: boolean
          qualified_at?: string | null
          qualifying_payment_reference?: string | null
          qualifying_provider?: string | null
          redeemed_at?: string | null
          referral_code?: string
          referred_id?: string | null
          referrer_id?: string
          retention_eligible_at?: string | null
          retention_xp_awarded?: boolean
          reward_days?: number
          rewarded?: boolean
          signup_ip?: string | null
        }
        Relationships: []
      }
      reward_claims: {
        Row: {
          action: string
          coins_awarded: number
          created_at: string
          gems_awarded: number
          source_key: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          action: string
          coins_awarded?: number
          created_at?: string
          gems_awarded?: number
          source_key: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          action?: string
          coins_awarded?: number
          created_at?: string
          gems_awarded?: number
          source_key?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      reward_eligibility: {
        Row: {
          consumed_at: string | null
          created_at: string
          id: number
          kind: string
          source_key: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          id?: number
          kind: string
          source_key: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          id?: number
          kind?: string
          source_key?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_rules: {
        Row: {
          action: string
          coin_reason: string | null
          coins: number
          created_at: string
          dedupe_daily: boolean
          gems: number
          updated_at: string
          xp: number
          xp_reason: string | null
        }
        Insert: {
          action: string
          coin_reason?: string | null
          coins?: number
          created_at?: string
          dedupe_daily?: boolean
          gems?: number
          updated_at?: string
          xp?: number
          xp_reason?: string | null
        }
        Update: {
          action?: string
          coin_reason?: string | null
          coins?: number
          created_at?: string
          dedupe_daily?: boolean
          gems?: number
          updated_at?: string
          xp?: number
          xp_reason?: string | null
        }
        Relationships: []
      }
      savings_challenges: {
        Row: {
          challenge_type: string
          completed_dates: string[]
          created_at: string
          currency: string
          end_date: string
          goal_id: string | null
          id: string
          start_date: string
          status: string
          target_amount: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_type: string
          completed_dates?: string[]
          created_at?: string
          currency: string
          end_date: string
          goal_id?: string | null
          id?: string
          start_date?: string
          status?: string
          target_amount?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_type?: string
          completed_dates?: string[]
          created_at?: string
          currency?: string
          end_date?: string
          goal_id?: string | null
          id?: string
          start_date?: string
          status?: string
          target_amount?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_challenges_goal_owner_fk"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      savings_entries: {
        Row: {
          amount: number
          created_at: string
          goal_id: string
          id: string
          note: string | null
          saved_at: string
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          goal_id: string
          id?: string
          note?: string | null
          saved_at?: string
          source?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          goal_id?: string
          id?: string
          note?: string | null
          saved_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_entries_goal_owner_fk"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          currency: string
          current_amount: number
          id: string
          name: string
          reason: string | null
          regular_saving_amount: number | null
          saving_frequency: string
          starting_amount: number
          status: string
          target_amount: number
          target_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          current_amount?: number
          id?: string
          name: string
          reason?: string | null
          regular_saving_amount?: number | null
          saving_frequency?: string
          starting_amount?: number
          status?: string
          target_amount: number
          target_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          current_amount?: number
          id?: string
          name?: string
          reason?: string | null
          regular_saving_amount?: number | null
          saving_frequency?: string
          starting_amount?: number
          status?: string
          target_amount?: number
          target_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_orders: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          fulfilled_at: string | null
          id: string
          metadata: Json
          paystack_reference: string | null
          product_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          fulfilled_at?: string | null
          id?: string
          metadata?: Json
          paystack_reference?: string | null
          product_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          fulfilled_at?: string | null
          id?: string
          metadata?: Json
          paystack_reference?: string | null
          product_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_products: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          metadata: Json
          name: string
          price_cents: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json
          name: string
          price_cents: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      shop_purchases: {
        Row: {
          id: string
          item_id: string
          item_type: string
          purchased_at: string
          user_id: string
        }
        Insert: {
          id?: string
          item_id: string
          item_type: string
          purchased_at?: string
          user_id: string
        }
        Update: {
          id?: string
          item_id?: string
          item_type?: string
          purchased_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          email_token: string | null
          environment: string | null
          id: string
          metadata: Json
          next_payment_date: string | null
          paystack_customer_code: string | null
          paystack_customer_id: number | null
          paystack_subscription_code: string | null
          paystack_subscription_id: number | null
          plan_code: string | null
          plan_interval: string | null
          provider: string
          provider_customer_id: string | null
          provider_subscription_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          email_token?: string | null
          environment?: string | null
          id?: string
          metadata?: Json
          next_payment_date?: string | null
          paystack_customer_code?: string | null
          paystack_customer_id?: number | null
          paystack_subscription_code?: string | null
          paystack_subscription_id?: number | null
          plan_code?: string | null
          plan_interval?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          email_token?: string | null
          environment?: string | null
          id?: string
          metadata?: Json
          next_payment_date?: string | null
          paystack_customer_code?: string | null
          paystack_customer_id?: number | null
          paystack_subscription_code?: string | null
          paystack_subscription_id?: number | null
          plan_code?: string | null
          plan_interval?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_code?: string | null
          status?: string
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_cosmetics: {
        Row: {
          acquired_at: string
          acquired_via: string
          item_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          acquired_via?: string
          item_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          acquired_via?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cosmetics_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cosmetic_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_equipped_cosmetics: {
        Row: {
          crown: string | null
          effect: string | null
          emote: string | null
          frame: string | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          crown?: string | null
          effect?: string | null
          emote?: string | null
          frame?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          crown?: string | null
          effect?: string | null
          emote?: string | null
          frame?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_mutes: {
        Row: {
          created_at: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          muter_id?: string
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
      weekly_scores: {
        Row: {
          avatar_url: string | null
          best_streak: number
          created_at: string
          display_name: string
          grade: string
          growth_score: number
          habits_completed: number
          id: string
          perfect_days: number
          rank: number | null
          score: number
          total_habits: number
          user_id: string
          week_start: string
        }
        Insert: {
          avatar_url?: string | null
          best_streak?: number
          created_at?: string
          display_name?: string
          grade?: string
          growth_score?: number
          habits_completed?: number
          id?: string
          perfect_days?: number
          rank?: number | null
          score?: number
          total_habits?: number
          user_id: string
          week_start: string
        }
        Update: {
          avatar_url?: string | null
          best_streak?: number
          created_at?: string
          display_name?: string
          grade?: string
          growth_score?: number
          habits_completed?: number
          id?: string
          perfect_days?: number
          rank?: number | null
          score?: number
          total_habits?: number
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_summaries: {
        Row: {
          created_at: string
          habits_completed: number | null
          id: string
          mood_trend: string | null
          summary: string
          top_streak: number | null
          total_habits: number | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          habits_completed?: number | null
          id?: string
          mood_trend?: string | null
          summary: string
          top_streak?: number | null
          total_habits?: number | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          habits_completed?: number | null
          id?: string
          mood_trend?: string | null
          summary?: string
          top_streak?: number | null
          total_habits?: number | null
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      winston_ad_reward_sessions: {
        Row: {
          ad_unit: string | null
          created_at: string
          expires_at: string
          granted_at: string | null
          nonce: string
          reject_reason: string | null
          reward_day: string | null
          reward_messages: number
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_unit?: string | null
          created_at?: string
          expires_at?: string
          granted_at?: string | null
          nonce?: string
          reject_reason?: string | null
          reward_day?: string | null
          reward_messages?: number
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_unit?: string | null
          created_at?: string
          expires_at?: string
          granted_at?: string | null
          nonce?: string
          reject_reason?: string | null
          reward_day?: string | null
          reward_messages?: number
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      winston_celebrations: {
        Row: {
          awarded_at: string
          coins_awarded: number
          key: string
          kind: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          awarded_at?: string
          coins_awarded?: number
          key: string
          kind: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          awarded_at?: string
          coins_awarded?: number
          key?: string
          kind?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      winston_challenges: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json
          reward_coins: number
          reward_xp: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          reward_coins?: number
          reward_xp?: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          reward_coins?: number
          reward_xp?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      winston_memory: {
        Row: {
          created_at: string
          id: string
          tag_type: string
          updated_at: string
          user_id: string
          value: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          tag_type: string
          updated_at?: string
          user_id: string
          value: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          tag_type?: string
          updated_at?: string
          user_id?: string
          value?: string
          weight?: number
        }
        Relationships: []
      }
      winston_money_actions: {
        Row: {
          action_type: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_transactions: {
        Row: {
          balance_after: number | null
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      community_trending_feed: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string | null
          payload: Json | null
          reaction_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          payload?: Json | null
          reaction_count?: never
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          payload?: Json | null
          reaction_count?: never
          user_id?: string | null
        }
        Relationships: []
      }
      paystack_webhook_events_safe: {
        Row: {
          attempts: number | null
          duplicate_count: number | null
          error_message: string | null
          event_hash: string | null
          event_type: string | null
          id: string | null
          idempotency_key: string | null
          last_attempt_at: string | null
          next_retry_at: string | null
          paystack_reference: string | null
          paystack_subscription_code: string | null
          processed_at: string | null
          received_at: string | null
          shop_order_id: string | null
          source: string | null
          status: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          duplicate_count?: number | null
          error_message?: string | null
          event_hash?: string | null
          event_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          last_attempt_at?: string | null
          next_retry_at?: string | null
          paystack_reference?: string | null
          paystack_subscription_code?: string | null
          processed_at?: string | null
          received_at?: string | null
          shop_order_id?: string | null
          source?: string | null
          status?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          duplicate_count?: number | null
          error_message?: string | null
          event_hash?: string | null
          event_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          last_attempt_at?: string | null
          next_retry_at?: string | null
          paystack_reference?: string | null
          paystack_subscription_code?: string | null
          processed_at?: string | null
          received_at?: string | null
          shop_order_id?: string | null
          source?: string | null
          status?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      referrals_safe: {
        Row: {
          created_at: string | null
          id: string | null
          purchase_completed: boolean | null
          qualified_at: string | null
          redeemed_at: string | null
          referral_code: string | null
          referred_id: string | null
          referrer_id: string | null
          reward_days: number | null
          rewarded: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          purchase_completed?: boolean | null
          qualified_at?: string | null
          redeemed_at?: string | null
          referral_code?: string | null
          referred_id?: string | null
          referrer_id?: string | null
          reward_days?: number | null
          rewarded?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          purchase_completed?: boolean | null
          qualified_at?: string | null
          redeemed_at?: string | null
          referral_code?: string | null
          referred_id?: string | null
          referrer_id?: string | null
          reward_days?: number | null
          rewarded?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_ai_challenge: { Args: { _challenge_id: string }; Returns: Json }
      accept_friend_challenge: { Args: { _code: string }; Returns: Json }
      add_feed_comment: {
        Args: { _content: string; _feed_id: string }
        Returns: string
      }
      adjust_gems_internal: {
        Args: {
          _delta: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      admin_hide_comment: { Args: { _comment_id: string }; Returns: boolean }
      admin_hide_feed: { Args: { _feed_id: string }; Returns: boolean }
      admin_list_referral_signals: {
        Args: { _limit?: number; _only_risky?: boolean }
        Returns: {
          admin_status: string
          metadata: Json
          purchase_completed: boolean
          referral_code: string
          referral_id: string
          referred_id: string
          referred_name: string
          referrer_id: string
          referrer_name: string
          risk_score: number
          signal_created_at: string
          signal_id: string
          signal_type: string
          weight: number
        }[]
      }
      admin_process_payout:
        | {
            Args: { _action: string; _note?: string; _payout_id: string }
            Returns: undefined
          }
        | { Args: { _payout_id: string; _status: string }; Returns: boolean }
      admin_resolve_report:
        | {
            Args: { _id: string; _notes?: string; _status: string }
            Returns: boolean
          }
        | {
            Args: { _report_id: string; _resolution?: string }
            Returns: boolean
          }
      admin_review_referral:
        | {
            Args: { _approve: boolean; _referral_id: string }
            Returns: boolean
          }
        | {
            Args: { _notes?: string; _referral_id: string; _status: string }
            Returns: undefined
          }
      admin_suspend_user: {
        Args: { _hours: number; _user_id: string }
        Returns: string
      }
      apply_google_play_revocation: {
        Args: {
          _order_id: string
          _purchase_token: string
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      apply_habit_completion: {
        Args: {
          _completed: boolean
          _event_id: string
          _expected_revision: number
          _habit_id: string
          _local_date: string
        }
        Returns: Json
      }
      apply_paystack_premium_grant: {
        Args: {
          _amount: number
          _currency: string
          _event_id: string
          _kind: string
          _premium_until: string
          _reference: string
          _user_id: string
        }
        Returns: boolean
      }
      apply_referral_milestones: {
        Args: { _referral_id?: string; _referrer_id: string }
        Returns: Json
      }
      auto_save_streak_day: { Args: { _date: string }; Returns: Json }
      award_celebration: {
        Args: { _coins?: number; _key: string; _kind: string; _xp?: number }
        Returns: Json
      }
      award_coins: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      award_referral_retention_xp: {
        Args: { _referral_id: string }
        Returns: boolean
      }
      award_referral_signup_rewards: {
        Args: { _referral_id: string; _referred_id: string }
        Returns: Json
      }
      award_xp: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      begin_avatar_generation: {
        Args: { _preferences: Json; _request_id: string; _user_id: string }
        Returns: Json
      }
      buy_streak_shield: { Args: never; Returns: Json }
      cancel_friend_request: { Args: { _request_id: string }; Returns: Json }
      challenge_reward_xp: { Args: { _duration: number }; Returns: number }
      claim_action_reward: {
        Args: { _action: string; _ref_id?: string; _ref_key?: string }
        Returns: Json
      }
      claim_community_challenge: {
        Args: { _challenge_id: string }
        Returns: Json
      }
      claim_community_explorer: { Args: never; Returns: Json }
      claim_level_rewards: { Args: never; Returns: Json }
      complete_ai_challenge: { Args: { _challenge_id: string }; Returns: Json }
      complete_user_challenge: {
        Args: { _challenge_id: string }
        Returns: Json
      }
      complete_winston_challenge: {
        Args: { _challenge_id: string }
        Returns: Json
      }
      consume_ai_message: { Args: never; Returns: Json }
      create_friend_challenge_code: {
        Args: { _message?: string }
        Returns: string
      }
      create_friend_habit_challenge: {
        Args: { _duration_days?: number; _friend_id: string; _title: string }
        Returns: Json
      }
      create_referral_code: { Args: never; Returns: string }
      create_savings_goal: {
        Args: {
          _already_saved: number
          _currency: string
          _name: string
          _reason?: string
          _regular_saving_amount?: number
          _saving_frequency?: string
          _target_amount: number
          _target_date: string
        }
        Returns: {
          created_at: string
          currency: string
          current_amount: number
          id: string
          name: string
          reason: string | null
          regular_saving_amount: number | null
          saving_frequency: string
          starting_amount: number
          status: string
          target_amount: number
          target_date: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_feed_comment: { Args: { _comment_id: string }; Returns: boolean }
      end_partnership: { Args: { _partnership_id: string }; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_friend_code_for: { Args: { _user_id: string }; Returns: string }
      equip_cosmetic: { Args: { _item_id: string }; Returns: undefined }
      finish_avatar_generation: {
        Args: {
          _blocked?: boolean
          _request_id: string
          _result: Json
          _specification: Json
          _success: boolean
          _user_id: string
        }
        Returns: Json
      }
      free_money_saver_goal_is_writable: {
        Args: { _goal_id: string; _user_id: string }
        Returns: boolean
      }
      get_admin_analytics: { Args: never; Returns: Json }
      get_community_top_members: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          level: number
          name: string
          stage: string
          stars: number
          user_id: string
          xp: number
        }[]
      }
      get_friend_display_profiles: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          name: string
          user_id: string
          xp: number
        }[]
      }
      get_my_bank_account_masked: { Args: never; Returns: Json }
      get_my_earnings_summary: { Args: never; Returns: Json }
      get_my_friend_code: { Args: never; Returns: string }
      get_notification_dispatcher_secret: { Args: never; Returns: string }
      get_progression_for_users: {
        Args: { _user_ids: string[] }
        Returns: {
          level: number
          stage: string
          stars: number
          user_id: string
        }[]
      }
      get_referral_program_bonuses: {
        Args: never
        Returns: {
          retention_xp_bonus: number
          signup_points_bonus: number
          signup_xp_bonus: number
        }[]
      }
      get_winston_ad_reward_status: { Args: { _nonce?: string }; Returns: Json }
      grant_winston_ad_reward: {
        Args: {
          _ad_unit: string
          _nonce: string
          _transaction_id: string
          _user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_leaderboard_visible: { Args: { _user_id: string }; Returns: boolean }
      is_service_caller: { Args: never; Returns: boolean }
      join_community_challenge: {
        Args: { _challenge_id: string }
        Returns: Json
      }
      journal_is_unlocked: { Args: { p_user_id: string }; Returns: boolean }
      journal_pin_lock: { Args: never; Returns: undefined }
      journal_pin_set: { Args: { p_pin: string }; Returns: boolean }
      journal_pin_status: { Args: never; Returns: boolean }
      journal_pin_verify: { Args: { p_pin: string }; Returns: boolean }
      level_from_xp: { Args: { _xp: number }; Returns: number }
      level_reward_config: {
        Args: never
        Returns: {
          badge: string
          coins: number
          cosmetic_id: string
          label: string
          level: number
          streak_savers: number
        }[]
      }
      list_paystack_webhook_events: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          duplicate_count: number
          error_message: string
          event_hash: string
          event_type: string
          id: string
          idempotency_key: string
          is_duplicate: boolean
          last_attempt_at: string
          next_retry_at: string
          paystack_reference: string
          paystack_subscription_code: string
          processed_at: string
          received_at: string
          shop_order_id: string
          source: string
          status: string
          subscription_id: string
          user_id: string
        }[]
      }
      lookup_friend_by_code: { Args: { _code: string }; Returns: string }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: boolean
      }
      my_best_habit_streak: { Args: never; Returns: number }
      notification_due_users: {
        Args: { _now?: string }
        Returns: {
          user_id: string
        }[]
      }
      notification_habit_snapshot: {
        Args: { _today: string; _user_id: string }
        Returns: {
          custom_days: number[]
          done_today: boolean
          emoji: string
          frequency: string
          id: string
          name: string
          reminder_enabled: boolean
          reminder_time: string
          reminder_tone: string
          streak: number
          week_count: number
        }[]
      }
      open_daily_chest: { Args: never; Returns: Json }
      paystack_events_due_for_retry: {
        Args: { _limit?: number; _max_attempts?: number }
        Returns: {
          attempts: number
          event_hash: string
          event_type: string
          id: string
          raw_payload: Json
          user_id: string
        }[]
      }
      prune_my_chat_messages: { Args: { _keep_last?: number }; Returns: number }
      purchase_cosmetic: { Args: { _item_id: string }; Returns: Json }
      qualify_referral_payment: {
        Args: {
          _environment?: string
          _provider?: string
          _reference: string
          _referred_id: string
        }
        Returns: Json
      }
      rate_limit_check: {
        Args: { _action: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      rate_limit_check_ip: {
        Args: {
          _endpoint: string
          _ip: string
          _max_requests: number
          _window_seconds: number
        }
        Returns: boolean
      }
      rate_limit_check_user: {
        Args: {
          _action: string
          _max: number
          _user_id: string
          _window_seconds: number
        }
        Returns: boolean
      }
      read_email_batch: {
        Args: {
          batch_size: number
          p_visibility_timeout: number
          queue_name: string
        }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      record_savings_entry: {
        Args: {
          _amount: number
          _goal_id: string
          _note?: string
          _source?: string
        }
        Returns: {
          created_at: string
          currency: string
          current_amount: number
          id: string
          name: string
          reason: string | null
          regular_saving_amount: number | null
          saving_frequency: string
          starting_amount: number
          status: string
          target_amount: number
          target_date: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_referral: { Args: { _code: string }; Returns: Json }
      referral_risk_score: { Args: { _referral_id: string }; Returns: number }
      refresh_my_friend_habit_challenges: { Args: never; Returns: Json }
      refresh_weekly_score_internal: { Args: { _uid: string }; Returns: Json }
      remove_friend: { Args: { _other_user_id: string }; Returns: Json }
      report_content: {
        Args: { _reason: string; _target_id: string; _target_type: string }
        Returns: string
      }
      request_payout:
        | { Args: { _amount_cents: number }; Returns: string }
        | {
            Args: { _amount_cents: number; _bank_masked: string }
            Returns: string
          }
      respond_friend_habit_challenge: {
        Args: { _accept: boolean; _challenge_id: string }
        Returns: Json
      }
      respond_friend_request: {
        Args: { _accept: boolean; _request_id: string }
        Returns: Json
      }
      respond_partner_request: {
        Args: { _accept: boolean; _partnership_id: string }
        Returns: Json
      }
      respond_winston_challenge: {
        Args: { _accept: boolean; _challenge_id: string }
        Returns: Json
      }
      reward_referrer: {
        Args: { _days: number; _referral_id: string }
        Returns: undefined
      }
      roll_surprise_reward: { Args: never; Returns: Json }
      send_friend_request: { Args: { _code: string }; Returns: Json }
      spend_coins: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: boolean
      }
      spend_my_coins: {
        Args: { _amount: number; _reason?: string }
        Returns: boolean
      }
      spend_my_gems: {
        Args: { _amount: number; _reason?: string }
        Returns: boolean
      }
      stage_from_level: { Args: { _level: number }; Returns: string }
      stars_from_level: { Args: { _level: number }; Returns: number }
      start_my_trial: { Args: never; Returns: Json }
      start_winston_ad_reward_for: { Args: { _uid: string }; Returns: Json }
      submit_daily_reflection: {
        Args: { _prompt: string; _response: string }
        Returns: Json
      }
      submit_habit_verification: {
        Args: {
          _completed_date: string
          _habit_id: string
          _question: string
          _response: string
        }
        Returns: Json
      }
      submit_weekly_score: { Args: never; Returns: Json }
      toggle_block: { Args: { _target_id: string }; Returns: boolean }
      toggle_feed_reaction: {
        Args: { _emoji: string; _feed_id: string }
        Returns: Json
      }
      toggle_mute: { Args: { _target_id: string }; Returns: boolean }
      top_referrers_this_month: {
        Args: never
        Returns: {
          referrals_count: number
          user_id: string
        }[]
      }
      unequip_cosmetic: { Args: { _slot: string }; Returns: Json }
      unlock_eligible_cosmetics: { Args: never; Returns: Json }
      update_community_challenge_progress: {
        Args: { _challenge_id: string; _delta: number }
        Returns: Json
      }
      update_my_profile_state: { Args: { _updates: Json }; Returns: undefined }
      update_profile_internal: {
        Args: { _updates: Json; _user_id: string }
        Returns: undefined
      }
      use_streak_shield: { Args: { _date?: string }; Returns: Json }
      user_is_premium: { Args: { _user_id: string }; Returns: boolean }
      validate_referral_code: { Args: { _code: string }; Returns: Json }
      winston_ad_bonus_today: { Args: { _uid: string }; Returns: number }
      winston_ad_reward_rules: { Args: never; Returns: Json }
      xp_award_duplicate_exists: {
        Args: { _metadata: Json; _reason: string; _user_id: string }
        Returns: boolean
      }
      xp_award_regression_check: {
        Args: { _amount: number; _metadata?: Json; _reason: string }
        Returns: Json
      }
      xp_sync_snapshot: {
        Args: { _user_id?: string }
        Returns: {
          discrepancy: number
          ledger_xp: number
          profile_xp: number
          txn_count: number
          user_id: string
        }[]
      }
      xp_to_next_level: { Args: { _level: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    },
  },
} as const
