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
      entradas: {
        Row: {
          created_at: string
          data: string
          fornecedor: string | null
          id: string
          nota_fiscal_url: string | null
          obra_id: string
          observacao: string | null
          produto_id: string
          quantidade: number
          valor_unitario: number | null
        }
        Insert: {
          created_at?: string
          data?: string
          fornecedor?: string | null
          id?: string
          nota_fiscal_url?: string | null
          obra_id: string
          observacao?: string | null
          produto_id: string
          quantidade: number
          valor_unitario?: number | null
        }
        Update: {
          created_at?: string
          data?: string
          fornecedor?: string | null
          id?: string
          nota_fiscal_url?: string | null
          obra_id?: string
          observacao?: string | null
          produto_id?: string
          quantidade?: number
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas: {
        Row: {
          codigo: string | null
          created_at: string
          data_devolucao: string | null
          data_retirada: string | null
          estado: string
          foto_url: string | null
          id: string
          nome: string
          obra_id: string
          observacoes: string | null
          responsavel_id: string | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          data_devolucao?: string | null
          data_retirada?: string | null
          estado?: string
          foto_url?: string | null
          id?: string
          nome: string
          obra_id: string
          observacoes?: string | null
          responsavel_id?: string | null
        }
        Update: {
          codigo?: string | null
          created_at?: string
          data_devolucao?: string | null
          data_retirada?: string | null
          estado?: string
          foto_url?: string | null
          id?: string
          nome?: string
          obra_id?: string
          observacoes?: string | null
          responsavel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          created_at: string
          endereco: string | null
          id: string
          nome: string
          responsavel: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          responsavel?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          responsavel?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pessoas: {
        Row: {
          created_at: string
          foto_url: string | null
          funcao: string | null
          id: string
          nome: string
          obra_id: string
          telefone: string | null
        }
        Insert: {
          created_at?: string
          foto_url?: string | null
          funcao?: string | null
          id?: string
          nome: string
          obra_id: string
          telefone?: string | null
        }
        Update: {
          created_at?: string
          foto_url?: string | null
          funcao?: string | null
          id?: string
          nome?: string
          obra_id?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string | null
          created_at: string
          custo_unitario: number | null
          estoque_atual: number
          estoque_minimo: number
          fornecedor: string | null
          foto_url: string | null
          id: string
          localizacao: string | null
          nome: string
          obra_id: string
          observacoes: string | null
          unidade: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          custo_unitario?: number | null
          estoque_atual?: number
          estoque_minimo?: number
          fornecedor?: string | null
          foto_url?: string | null
          id?: string
          localizacao?: string | null
          nome: string
          obra_id: string
          observacoes?: string | null
          unidade?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          custo_unitario?: number | null
          estoque_atual?: number
          estoque_minimo?: number
          fornecedor?: string | null
          foto_url?: string | null
          id?: string
          localizacao?: string | null
          nome?: string
          obra_id?: string
          observacoes?: string | null
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          email: string
          id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          email: string
          id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      saidas: {
        Row: {
          created_at: string
          data: string
          id: string
          obra_id: string
          observacao: string | null
          pessoa_id: string | null
          produto_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          obra_id: string
          observacao?: string | null
          pessoa_id?: string | null
          produto_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          obra_id?: string
          observacao?: string | null
          pessoa_id?: string | null
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "saidas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saidas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saidas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
    },
  },
} as const
