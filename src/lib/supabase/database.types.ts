export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TruckClass = "legacy_owned" | "third_party";

export type FeeRuleKind =
  | "DRIVER_PAY"
  | "MANAGEMENT_FEE"
  | "DISPATCH_FEE"
  | "FACTORING_FEE"
  | "TOLSON_PAYABLE"
  | "LEGACY_RETAINED";

export type Database = {
  public: {
    Tables: {
      allowed_users: {
        Row: {
          email: string;
          role: string;
          created_at: string;
        };
        Insert: {
          email: string;
          role: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      trucks: {
        Row: {
          id: string;
          unit_number: string;
          name: string;
          truck_class: TruckClass;
          owner_name: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          name: string;
          truck_class: TruckClass;
          owner_name?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          name?: string;
          truck_class?: TruckClass;
          owner_name?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      fee_contracts: {
        Row: {
          id: string;
          truck_id: string;
          effective_from: string;
          effective_to: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          truck_id: string;
          effective_from: string;
          effective_to?: string | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          truck_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          note?: string | null;
        };
        Relationships: [];
      };
      fee_rules: {
        Row: {
          id: string;
          contract_id: string;
          kind: FeeRuleKind;
          rate_bp: number;
          base_pct_bp: number;
        };
        Insert: {
          id?: string;
          contract_id: string;
          kind: FeeRuleKind;
          rate_bp: number;
          base_pct_bp: number;
        };
        Update: {
          id?: string;
          contract_id?: string;
          kind?: FeeRuleKind;
          rate_bp?: number;
          base_pct_bp?: number;
        };
        Relationships: [];
      };
      change_log: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor_email: string;
          before_data: Json | null;
          after_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor_email: string;
          before_data?: Json | null;
          after_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: string;
          actor_email?: string;
          before_data?: Json | null;
          after_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_fee_rate_version: {
        Args: {
          p_truck_id: string;
          p_effective_from: string;
          p_note: string | null;
          p_rules: Json;
        };
        Returns: string;
      };
      delete_latest_fee_rate_version: {
        Args: { p_truck_id: string };
        Returns: string;
      };
      truck_has_weekly_statements: {
        Args: { p_truck_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      truck_class: TruckClass;
      fee_rule_kind: FeeRuleKind;
    };
    CompositeTypes: Record<string, never>;
  };
};
