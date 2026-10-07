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

export type FixedExpenseKind =
  | "MAINTENANCE_ESCROW_WEEKLY"
  | "ELD_FEE"
  | "YARD_FEE"
  | "GPS_TRACKER"
  | "INSURANCE"
  | "TRUCK_PAYMENTS"
  | "TRAILER_PAYMENTS"
  | "TOLL_PASS"
  | "PERMITS"
  | "MISC";

export type ChargedTo = "owner" | "management";

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
      import_settings: {
        Row: {
          key: string;
          value_int: number | null;
          value_text: string | null;
          note: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value_int?: number | null;
          value_text?: string | null;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value_int?: number | null;
          value_text?: string | null;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      import_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          /** After additive migration 20261007100000 (unapplied until go). */
          source?: string | null;
          range_from: string;
          range_to: string;
          rows_fetched: number;
          rows_promoted: number;
          rows_rejected: number;
          rows_updated: number;
          error_summary: string | null;
          meta: Json | null;
        };
        Insert: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status: string;
          source?: string | null;
          range_from: string;
          range_to: string;
          rows_fetched?: number;
          rows_promoted?: number;
          rows_rejected?: number;
          rows_updated?: number;
          error_summary?: string | null;
          meta?: Json | null;
        };
        Update: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: string;
          source?: string | null;
          range_from?: string;
          range_to?: string;
          rows_fetched?: number;
          rows_promoted?: number;
          rows_rejected?: number;
          rows_updated?: number;
          error_summary?: string | null;
          meta?: Json | null;
        };
        Relationships: [];
      };
      vektor_loads_staging: {
        Row: {
          id: string;
          import_run_id: string | null;
          manifest_id: string;
          /** After additive migration 20261007100000 (unapplied until go). */
          manifest_friendly_id?: string | null;
          order_ids: string[];
          raw: Json;
          promote_status: string;
          reject_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_run_id?: string | null;
          manifest_id: string;
          manifest_friendly_id?: string | null;
          order_ids?: string[];
          raw: Json;
          promote_status?: string;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_run_id?: string | null;
          manifest_id?: string;
          manifest_friendly_id?: string | null;
          order_ids?: string[];
          raw?: Json;
          promote_status?: string;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      loads: {
        Row: {
          id: string;
          manifest_id: string;
          order_ids: string[];
          load_id: string | null;
          manifest_friendly_id: string | null;
          pickup_date: string | null;
          delivery_date: string;
          week_start: string;
          week_end: string;
          month_key: string;
          driver_id: string | null;
          driver_name: string | null;
          broker_id: string | null;
          broker_name: string | null;
          customer_id: string | null;
          customer_name: string | null;
          origin_city: string | null;
          origin_state: string | null;
          destination_city: string | null;
          destination_state: string | null;
          loaded_distance_mi: number | null;
          empty_distance_mi: number | null;
          auto_loaded_distance_mi: number | null;
          auto_empty_distance_mi: number | null;
          deadhead_miles: number | null;
          rate_cents: number;
          truck_unit_number: string | null;
          truck_id: string | null;
          vektor_status: string;
          lineage_root_manifest_id: string | null;
          lineage_parent_manifest_id: string | null;
          lineage_related_manifest_id: string | null;
          lineage_relation: string | null;
          trip_group_id: string | null;
          primary_load: boolean | null;
          import_run_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          manifest_id: string;
          order_ids?: string[];
          load_id?: string | null;
          manifest_friendly_id?: string | null;
          pickup_date?: string | null;
          delivery_date: string;
          week_start: string;
          week_end: string;
          month_key: string;
          driver_id?: string | null;
          driver_name?: string | null;
          broker_id?: string | null;
          broker_name?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          origin_city?: string | null;
          origin_state?: string | null;
          destination_city?: string | null;
          destination_state?: string | null;
          loaded_distance_mi?: number | null;
          empty_distance_mi?: number | null;
          auto_loaded_distance_mi?: number | null;
          auto_empty_distance_mi?: number | null;
          deadhead_miles?: number | null;
          rate_cents: number;
          truck_unit_number?: string | null;
          truck_id?: string | null;
          vektor_status: string;
          lineage_root_manifest_id?: string | null;
          lineage_parent_manifest_id?: string | null;
          lineage_related_manifest_id?: string | null;
          lineage_relation?: string | null;
          trip_group_id?: string | null;
          primary_load?: boolean | null;
          import_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          manifest_id?: string;
          order_ids?: string[];
          load_id?: string | null;
          manifest_friendly_id?: string | null;
          pickup_date?: string | null;
          delivery_date?: string;
          week_start?: string;
          week_end?: string;
          month_key?: string;
          driver_id?: string | null;
          driver_name?: string | null;
          broker_id?: string | null;
          broker_name?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          origin_city?: string | null;
          origin_state?: string | null;
          destination_city?: string | null;
          destination_state?: string | null;
          loaded_distance_mi?: number | null;
          empty_distance_mi?: number | null;
          auto_loaded_distance_mi?: number | null;
          auto_empty_distance_mi?: number | null;
          deadhead_miles?: number | null;
          rate_cents?: number;
          truck_unit_number?: string | null;
          truck_id?: string | null;
          vektor_status?: string;
          lineage_root_manifest_id?: string | null;
          lineage_parent_manifest_id?: string | null;
          lineage_related_manifest_id?: string | null;
          lineage_relation?: string | null;
          trip_group_id?: string | null;
          primary_load?: boolean | null;
          import_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      issues: {
        Row: {
          id: string;
          severity: string;
          rule: string;
          message: string;
          ref: string | null;
          status: string;
          import_run_id: string | null;
          manifest_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          severity: string;
          rule: string;
          message: string;
          ref?: string | null;
          status?: string;
          import_run_id?: string | null;
          manifest_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          severity?: string;
          rule?: string;
          message?: string;
          ref?: string | null;
          status?: string;
          import_run_id?: string | null;
          manifest_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      truck_fixed_expenses: {
        Row: {
          id: string;
          truck_id: string;
          kind: FixedExpenseKind;
          weekly_amount_cents: number;
          charged_to: ChargedTo;
          effective_from: string;
          effective_to: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          truck_id: string;
          kind: FixedExpenseKind;
          weekly_amount_cents: number;
          charged_to?: ChargedTo;
          effective_from: string;
          effective_to?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          truck_id?: string;
          kind?: FixedExpenseKind;
          weekly_amount_cents?: number;
          charged_to?: ChargedTo;
          effective_from?: string;
          effective_to?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      truck_fixed_expense_overrides: {
        Row: {
          id: string;
          truck_id: string;
          kind: FixedExpenseKind;
          week_start: string;
          amount_cents: number;
          charged_to: ChargedTo;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          truck_id: string;
          kind: FixedExpenseKind;
          week_start: string;
          amount_cents: number;
          charged_to?: ChargedTo;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          truck_id?: string;
          kind?: FixedExpenseKind;
          week_start?: string;
          amount_cents?: number;
          charged_to?: ChargedTo;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      mgmt_operating_expenses: {
        Row: {
          id: string;
          expense_date: string;
          category: string;
          amount_cents: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_date: string;
          category: string;
          amount_cents: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          expense_date?: string;
          category?: string;
          amount_cents?: number;
          note?: string | null;
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
      create_fixed_expense_version: {
        Args: {
          p_truck_id: string;
          p_kind: string;
          p_effective_from: string;
          p_weekly_amount_cents: number;
          p_charged_to: string;
          p_note: string | null;
        };
        Returns: string;
      };
      delete_latest_fixed_expense_version: {
        Args: { p_truck_id: string; p_kind: string };
        Returns: string;
      };
      upsert_fixed_expense_override: {
        Args: {
          p_truck_id: string;
          p_kind: string;
          p_week_start: string;
          p_amount_cents: number;
          p_charged_to: string;
          p_note: string | null;
        };
        Returns: string;
      };
      delete_fixed_expense_override: {
        Args: { p_truck_id: string; p_kind: string; p_week_start: string };
        Returns: string;
      };
      create_mgmt_operating_expense: {
        Args: {
          p_expense_date: string;
          p_category: string;
          p_amount_cents: number;
          p_note: string | null;
        };
        Returns: string;
      };
      delete_mgmt_operating_expense: {
        Args: { p_id: string };
        Returns: string;
      };
    };
    Enums: {
      truck_class: TruckClass;
      fee_rule_kind: FeeRuleKind;
      fixed_expense_kind: FixedExpenseKind;
      charged_to: ChargedTo;
    };
    CompositeTypes: Record<string, never>;
  };
};
