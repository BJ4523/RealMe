export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      avatars: {
        Row: {
          created_at: string
          error: string | null
          heygen_asset_id: string | null
          heygen_avatar_id: string | null
          id: string
          is_active: boolean
          name: string | null
          source_path: string | null
          status: Database["public"]["Enums"]["avatar_status"]
          updated_at: string
          user_id: string
          voice_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          heygen_asset_id?: string | null
          heygen_avatar_id?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          source_path?: string | null
          status?: Database["public"]["Enums"]["avatar_status"]
          updated_at?: string
          user_id: string
          voice_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          heygen_asset_id?: string | null
          heygen_avatar_id?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          source_path?: string | null
          status?: Database["public"]["Enums"]["avatar_status"]
          updated_at?: string
          user_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string
          baths: number | null
          beds: number | null
          city: string | null
          connection_id: string | null
          created_at: string
          description: string | null
          external_id: string | null
          features: string[]
          id: string
          lot_size: string | null
          photos: Json
          price: number | null
          property_type: string | null
          source: Database["public"]["Enums"]["listing_source"]
          source_url: string | null
          sqft: number | null
          state: string | null
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          user_id: string
          year_built: number | null
          zip: string | null
        }
        Insert: {
          address: string
          baths?: number | null
          beds?: number | null
          city?: string | null
          connection_id?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          features?: string[]
          id?: string
          lot_size?: string | null
          photos?: Json
          price?: number | null
          property_type?: string | null
          source?: Database["public"]["Enums"]["listing_source"]
          source_url?: string | null
          sqft?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          user_id: string
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          address?: string
          baths?: number | null
          beds?: number | null
          city?: string | null
          connection_id?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          features?: string[]
          id?: string
          lot_size?: string | null
          photos?: Json
          price?: number | null
          property_type?: string | null
          source?: Database["public"]["Enums"]["listing_source"]
          source_url?: string | null
          sqft?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          user_id?: string
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "mls_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_connections: {
        Row: {
          created_at: string
          credentials: Json
          id: string
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["connection_provider"]
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          id?: string
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["connection_provider"]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          id?: string
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["connection_provider"]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mls_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          brokerage: string | null
          created_at: string
          email: string | null
          full_name: string | null
          headshot_url: string | null
          id: string
          mls_agent_id: string | null
          onboarding_completed: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          brokerage?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          headshot_url?: string | null
          id: string
          mls_agent_id?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          brokerage?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          headshot_url?: string | null
          id?: string
          mls_agent_id?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          avatar_id: string | null
          cached_url: string | null
          created_at: string
          duration: number | null
          error: string | null
          heygen_video_id: string | null
          id: string
          listing_id: string
          script: string | null
          script_segments: Json
          status: Database["public"]["Enums"]["video_status"]
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          avatar_id?: string | null
          cached_url?: string | null
          created_at?: string
          duration?: number | null
          error?: string | null
          heygen_video_id?: string | null
          id?: string
          listing_id: string
          script?: string | null
          script_segments?: Json
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          avatar_id?: string | null
          cached_url?: string | null
          created_at?: string
          duration?: number | null
          error?: string | null
          heygen_video_id?: string | null
          id?: string
          listing_id?: string
          script?: string | null
          script_segments?: Json
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      avatar_status: "uploading" | "processing" | "ready" | "failed"
      connection_provider:
        | "manual"
        | "url_scrape"
        | "simplyrets"
        | "reso"
        | "mlsgrid"
      connection_status: "disconnected" | "connected" | "error"
      listing_source: "manual" | "url" | "simplyrets" | "reso" | "mlsgrid"
      listing_status: "draft" | "active"
      video_status:
        | "pending_script"
        | "script_ready"
        | "submitting"
        | "processing"
        | "completed"
        | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      avatar_status: ["uploading", "processing", "ready", "failed"],
      connection_provider: [
        "manual",
        "url_scrape",
        "simplyrets",
        "reso",
        "mlsgrid",
      ],
      connection_status: ["disconnected", "connected", "error"],
      listing_source: ["manual", "url", "simplyrets", "reso", "mlsgrid"],
      listing_status: ["draft", "active"],
      video_status: [
        "pending_script",
        "script_ready",
        "submitting",
        "processing",
        "completed",
        "failed",
      ],
    },
  },
} as const

