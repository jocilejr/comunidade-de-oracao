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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      avatar_gallery: {
        Row: {
          created_at: string
          data_url: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_url: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_url?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      funnel_preview_images: {
        Row: {
          created_at: string
          data_url: string
          funnel_id: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          data_url: string
          funnel_id: string
          id?: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          data_url?: string
          funnel_id?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_preview_images_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_session_events: {
        Row: {
          block_id: string | null
          content: string | null
          created_at: string
          event_type: string
          group_title: string | null
          id: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          block_id?: string | null
          content?: string | null
          created_at?: string
          event_type: string
          group_title?: string | null
          id?: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          block_id?: string | null
          content?: string | null
          created_at?: string
          event_type?: string
          group_title?: string | null
          id?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "funnel_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_sessions: {
        Row: {
          completed: boolean
          ended_at: string | null
          funnel_id: string
          id: string
          last_block_id: string | null
          last_group_title: string | null
          started_at: string
          variables: Json | null
        }
        Insert: {
          completed?: boolean
          ended_at?: string | null
          funnel_id: string
          id?: string
          last_block_id?: string | null
          last_group_title?: string | null
          started_at?: string
          variables?: Json | null
        }
        Update: {
          completed?: boolean
          ended_at?: string | null
          funnel_id?: string
          id?: string
          last_block_id?: string | null
          last_group_title?: string | null
          started_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_sessions_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          bot_avatar: string | null
          bot_name: string | null
          created_at: string
          flow: Json
          id: string
          name: string
          page_description: string | null
          page_title: string | null
          preview_image: string | null
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_avatar?: string | null
          bot_name?: string | null
          created_at?: string
          flow: Json
          id?: string
          name: string
          page_description?: string | null
          page_title?: string | null
          preview_image?: string | null
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_avatar?: string | null
          bot_name?: string | null
          created_at?: string
          flow?: Json
          id?: string
          name?: string
          page_description?: string | null
          page_title?: string | null
          preview_image?: string | null
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          openai_api_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          openai_api_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          openai_api_key?: string | null
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
      [_ in never]: never
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
