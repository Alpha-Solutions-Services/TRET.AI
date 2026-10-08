export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TruckClass = "legacy_owned" | "third_party";

export type TolsonPayableType = "percent_of_gross" | "fixed_weekly";

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
          google_sheet_url: string | null;
          tolson_payable_type: TolsonPayableType | null;
          tolson_payable_value: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          name: string;
          truck_class: TruckClass;
          owner_name?: string | null;
          google_sheet_url?: string | null;
          tolson_payable_type?: TolsonPayableType | null;
          tolson_payable_value?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          name?: string;
          truck_class?: TruckClass;
          owner_name?: string | null;
          google_sheet_url?: string | null;
          tolson_payable_type?: TolsonPayableType | null;
          tolson_payable_value?: number | null;
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
          /** After additive migration 20261007140000 (unapplied until go). */
          kind?: string | null;
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
          kind?: string;
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
          kind?: string;
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
          source_manifest_ref: string | null;
          pickup_date_kind: string | null;
          delivery_date_kind: string | null;
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
          source_manifest_ref?: string | null;
          pickup_date_kind?: string | null;
          delivery_date_kind?: string | null;
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
          source_manifest_ref?: string | null;
          pickup_date_kind?: string | null;
          delivery_date_kind?: string | null;
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
      vektor_fuel_staging: {
        Row: {
          id: string;
          import_run_id: string | null;
          vektor_transaction_id: string;
          raw: Json;
          promote_status: string;
          reject_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_run_id?: string | null;
          vektor_transaction_id: string;
          raw: Json;
          promote_status?: string;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_run_id?: string | null;
          vektor_transaction_id?: string;
          raw?: Json;
          promote_status?: string;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vektor_toll_staging: {
        Row: {
          id: string;
          import_run_id: string | null;
          vektor_transaction_id: string;
          raw: Json;
          promote_status: string;
          reject_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_run_id?: string | null;
          vektor_transaction_id: string;
          raw: Json;
          promote_status?: string;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_run_id?: string | null;
          vektor_transaction_id?: string;
          raw?: Json;
          promote_status?: string;
          reject_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      truck_fuel_cards: {
        Row: {
          id: string;
          truck_id: string;
          card_number: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          truck_id: string;
          card_number: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          truck_id?: string;
          card_number?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      truck_plates: {
        Row: {
          id: string;
          truck_id: string;
          plate: string;
          plate_state: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          truck_id: string;
          plate: string;
          plate_state?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          truck_id?: string;
          plate?: string;
          plate_state?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      truck_toll_tags: {
        Row: {
          id: string;
          truck_id: string;
          tag_number: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          truck_id: string;
          tag_number: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          truck_id?: string;
          tag_number?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      fuel_file_imports: {
        Row: {
          id: string;
          unit_number: string;
          invoice: string;
          item: string;
          qty_milli: number;
          amount_cents: number;
          transacted_date: string;
          location: string;
          load_id: string | null;
          trip_id: string | null;
          sheet_tab: string | null;
          sheet_row: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          invoice: string;
          item: string;
          qty_milli: number;
          amount_cents: number;
          transacted_date: string;
          location: string;
          load_id?: string | null;
          trip_id?: string | null;
          sheet_tab?: string | null;
          sheet_row?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          invoice?: string;
          item?: string;
          qty_milli?: number;
          amount_cents?: number;
          transacted_date?: string;
          location?: string;
          load_id?: string | null;
          trip_id?: string | null;
          sheet_tab?: string | null;
          sheet_row?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      toll_file_imports: {
        Row: {
          id: string;
          transaction_id: string;
          unit_number: string;
          load_id: string;
          amount_cents: number;
          transacted_at: string;
          location: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          unit_number: string;
          load_id: string;
          amount_cents: number;
          transacted_at: string;
          location?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          unit_number?: string;
          load_id?: string;
          amount_cents?: number;
          transacted_at?: string;
          location?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      file_import_queue: {
        Row: {
          id: string;
          dedupe_key: string;
          kind: string;
          status: string;
          reason: string;
          ai_suggested: boolean;
          unit_number: string | null;
          load_id: string | null;
          trip_id: string | null;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dedupe_key: string;
          kind: string;
          status?: string;
          reason: string;
          ai_suggested?: boolean;
          unit_number?: string | null;
          load_id?: string | null;
          trip_id?: string | null;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dedupe_key?: string;
          kind?: string;
          status?: string;
          reason?: string;
          ai_suggested?: boolean;
          unit_number?: string | null;
          load_id?: string | null;
          trip_id?: string | null;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fuel_transactions: {
        Row: {
          id: string;
          vektor_transaction_id: string;
          truck_id: string | null;
          unit_number: string | null;
          transacted_at: string;
          transacted_date: string;
          week_start: string;
          week_end: string;
          product: string;
          card: string | null;
          gallons_milli: number;
          amount_cents: number;
          retail_amount_cents: number | null;
          import_run_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vektor_transaction_id: string;
          truck_id?: string | null;
          unit_number?: string | null;
          transacted_at: string;
          transacted_date: string;
          week_start: string;
          week_end: string;
          product: string;
          card?: string | null;
          gallons_milli: number;
          amount_cents: number;
          retail_amount_cents?: number | null;
          import_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vektor_transaction_id?: string;
          truck_id?: string | null;
          unit_number?: string | null;
          transacted_at?: string;
          transacted_date?: string;
          week_start?: string;
          week_end?: string;
          product?: string;
          card?: string | null;
          gallons_milli?: number;
          amount_cents?: number;
          retail_amount_cents?: number | null;
          import_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      toll_transactions: {
        Row: {
          id: string;
          vektor_transaction_id: string;
          truck_id: string | null;
          vektor_truck_id: string | null;
          unit_number: string | null;
          transacted_at: string;
          transacted_date: string;
          week_start: string;
          week_end: string;
          amount_cents: number;
          card: string | null;
          location: string | null;
          import_run_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vektor_transaction_id: string;
          truck_id?: string | null;
          vektor_truck_id?: string | null;
          unit_number?: string | null;
          transacted_at: string;
          transacted_date: string;
          week_start: string;
          week_end: string;
          amount_cents: number;
          card?: string | null;
          location?: string | null;
          import_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vektor_transaction_id?: string;
          truck_id?: string | null;
          vektor_truck_id?: string | null;
          unit_number?: string | null;
          transacted_at?: string;
          transacted_date?: string;
          week_start?: string;
          week_end?: string;
          amount_cents?: number;
          card?: string | null;
          location?: string | null;
          import_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
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
      weekly_statements: {
        Row: {
          id: string;
          truck_id: string;
          unit_number: string;
          week_start: string;
          week_end: string;
          truck_class: TruckClass;
          status: string;
          contract_id: string | null;
          gross_cents: number;
          driver_pay_cents: number;
          management_fee_cents: number;
          tolson_payable_cents: number;
          legacy_retained_cents: number;
          dispatch_fee_cents: number;
          factoring_fee_cents: number;
          fuel_cents: number;
          tolls_cents: number;
          fixed_owner_cents: number;
          fixed_management_cents: number;
          net_cents: number;
          load_count: number;
          loaded_miles_hundredths: number;
          deadhead_miles_hundredths: number;
          closed_at: string;
        };
        Insert: {
          id?: string;
          truck_id: string;
          unit_number: string;
          week_start: string;
          week_end: string;
          truck_class: TruckClass;
          status?: string;
          contract_id?: string | null;
          gross_cents: number;
          driver_pay_cents: number;
          management_fee_cents: number;
          tolson_payable_cents: number;
          legacy_retained_cents: number;
          dispatch_fee_cents: number;
          factoring_fee_cents: number;
          fuel_cents: number;
          tolls_cents: number;
          fixed_owner_cents: number;
          fixed_management_cents: number;
          net_cents: number;
          load_count: number;
          loaded_miles_hundredths: number;
          deadhead_miles_hundredths: number;
          closed_at?: string;
        };
        Update: {
          id?: string;
          truck_id?: string;
          unit_number?: string;
          week_start?: string;
          week_end?: string;
          truck_class?: TruckClass;
          status?: string;
          contract_id?: string | null;
          gross_cents?: number;
          driver_pay_cents?: number;
          management_fee_cents?: number;
          tolson_payable_cents?: number;
          legacy_retained_cents?: number;
          dispatch_fee_cents?: number;
          factoring_fee_cents?: number;
          fuel_cents?: number;
          tolls_cents?: number;
          fixed_owner_cents?: number;
          fixed_management_cents?: number;
          net_cents?: number;
          load_count?: number;
          loaded_miles_hundredths?: number;
          deadhead_miles_hundredths?: number;
          closed_at?: string;
        };
        Relationships: [];
      };
      weekly_statement_lines: {
        Row: {
          id: string;
          statement_id: string;
          line_code: string;
          label: string;
          amount_cents: number;
          rate_bp: number | null;
          base_pct_bp: number | null;
          charged_to: ChargedTo | null;
          owner_visible: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          statement_id: string;
          line_code: string;
          label: string;
          amount_cents: number;
          rate_bp?: number | null;
          base_pct_bp?: number | null;
          charged_to?: ChargedTo | null;
          owner_visible: boolean;
          sort_order: number;
        };
        Update: {
          id?: string;
          statement_id?: string;
          line_code?: string;
          label?: string;
          amount_cents?: number;
          rate_bp?: number | null;
          base_pct_bp?: number | null;
          charged_to?: ChargedTo | null;
          owner_visible?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      week_closes: {
        Row: {
          id: string;
          week_start: string;
          week_end: string;
          status: string;
          gross_cents: number;
          net_cents: number;
          tolson_payable_cents: number;
          legacy_retained_cents: number;
          dispatch_fee_cents: number;
          fuel_cents: number;
          tolls_cents: number;
          load_count: number;
          unit_count: number;
          closed_by: string;
          closed_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          week_end: string;
          status?: string;
          gross_cents: number;
          net_cents: number;
          tolson_payable_cents: number;
          legacy_retained_cents: number;
          dispatch_fee_cents: number;
          fuel_cents: number;
          tolls_cents: number;
          load_count: number;
          unit_count: number;
          closed_by: string;
          closed_at?: string;
        };
        Update: {
          id?: string;
          week_start?: string;
          week_end?: string;
          status?: string;
          gross_cents?: number;
          net_cents?: number;
          tolson_payable_cents?: number;
          legacy_retained_cents?: number;
          dispatch_fee_cents?: number;
          fuel_cents?: number;
          tolls_cents?: number;
          load_count?: number;
          unit_count?: number;
          closed_by?: string;
          closed_at?: string;
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
          qbo_source_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_date: string;
          category: string;
          amount_cents: number;
          note?: string | null;
          qbo_source_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          expense_date?: string;
          category?: string;
          amount_cents?: number;
          note?: string | null;
          qbo_source_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      legacy_org_settings: {
        Row: {
          id: string;
          management_fee_bp: number;
          singleton: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          management_fee_bp?: number;
          singleton?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          management_fee_bp?: number;
          singleton?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      legacy_truck_week_fees: {
        Row: {
          id: string;
          unit_number: string;
          unit_key: string;
          week_start: string;
          fee_bp: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          unit_key: string;
          week_start: string;
          fee_bp: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          unit_key?: string;
          week_start?: string;
          fee_bp?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      legacy_load_fees: {
        Row: {
          id: string;
          unit_number: string;
          unit_key: string;
          load_id: string;
          load_key: string;
          week_start: string;
          fee_cents: number | null;
          fee_bp: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          unit_key: string;
          load_id: string;
          load_key: string;
          week_start: string;
          fee_cents?: number | null;
          fee_bp?: number | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          unit_key?: string;
          load_id?: string;
          load_key?: string;
          week_start?: string;
          fee_cents?: number | null;
          fee_bp?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      quickbooks_category_map: {
        Row: {
          id: string;
          source_kind: string;
          source_id: string;
          source_name: string;
          category: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_kind: string;
          source_id: string;
          source_name: string;
          category: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_kind?: string;
          source_id?: string;
          source_name?: string;
          category?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      quickbooks_posting_accounts: {
        Row: {
          id: number;
          fee_debit_account_id: string | null;
          fee_debit_account_name: string | null;
          fee_credit_account_id: string | null;
          fee_credit_account_name: string | null;
          tolson_debit_account_id: string | null;
          tolson_debit_account_name: string | null;
          tolson_credit_account_id: string | null;
          tolson_credit_account_name: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          fee_debit_account_id?: string | null;
          fee_debit_account_name?: string | null;
          fee_credit_account_id?: string | null;
          fee_credit_account_name?: string | null;
          tolson_debit_account_id?: string | null;
          tolson_debit_account_name?: string | null;
          tolson_credit_account_id?: string | null;
          tolson_credit_account_name?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          fee_debit_account_id?: string | null;
          fee_debit_account_name?: string | null;
          fee_credit_account_id?: string | null;
          fee_credit_account_name?: string | null;
          tolson_debit_account_id?: string | null;
          tolson_debit_account_name?: string | null;
          tolson_credit_account_id?: string | null;
          tolson_credit_account_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      quickbooks_push_log: {
        Row: {
          id: string;
          week_start: string;
          qbo_id: string;
          income_cents: number;
          tolson_cents: number;
          posted_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          qbo_id: string;
          income_cents: number;
          tolson_cents: number;
          posted_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          week_start?: string;
          qbo_id?: string;
          income_cents?: number;
          tolson_cents?: number;
          posted_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      load_field_decisions: {
        Row: {
          id: string;
          unit_number: string;
          load_id: string;
          load_key: string;
          field: string;
          choice: string;
          note: string;
          previous_value: string | null;
          new_value: string | null;
          actor_email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          load_id: string;
          load_key: string;
          field: string;
          choice: string;
          note: string;
          previous_value?: string | null;
          new_value?: string | null;
          actor_email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          load_id?: string;
          load_key?: string;
          field?: string;
          choice?: string;
          note?: string;
          previous_value?: string | null;
          new_value?: string | null;
          actor_email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      load_field_acceptances: {
        Row: {
          id: string;
          unit_number: string;
          load_key: string;
          field: string;
          accepted_value: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_number: string;
          load_key: string;
          field: string;
          accepted_value: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_number?: string;
          load_key?: string;
          field?: string;
          accepted_value?: string;
          updated_at?: string;
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
      update_mgmt_operating_expense: {
        Args: {
          p_id: string;
          p_expense_date: string;
          p_category: string;
          p_amount_cents: number;
          p_note: string | null;
        };
        Returns: string;
      };
      set_legacy_management_fee_bp: {
        Args: { p_fee_bp: number };
        Returns: string;
      };
      upsert_legacy_truck_week_fee: {
        Args: {
          p_unit_number: string;
          p_unit_key: string;
          p_week_start: string;
          p_fee_bp: number;
        };
        Returns: string;
      };
      delete_legacy_truck_week_fee: {
        Args: { p_unit_key: string; p_week_start: string };
        Returns: string;
      };
      upsert_legacy_load_fee: {
        Args: {
          p_unit_number: string;
          p_unit_key: string;
          p_load_id: string;
          p_load_key: string;
          p_week_start: string;
          p_fee_cents: number | null;
          p_fee_bp: number | null;
        };
        Returns: string;
      };
      delete_legacy_load_fee: {
        Args: { p_unit_key: string; p_load_key: string; p_week_start: string };
        Returns: string;
      };
      seed_legacy_load_fees: {
        Args: { p_week_start: string; p_rows: Json };
        Returns: number;
      };
      lock_week: {
        Args: { p_week_start: string; p_payload: Json };
        Returns: string;
      };
      resolve_issue: {
        Args: { p_issue_id: string };
        Returns: string;
      };
      quickbooks_public_status: {
        Args: Record<string, never>;
        Returns: Json;
      };
      quickbooks_read_connection: {
        Args: Record<string, never>;
        Returns: Json;
      };
      quickbooks_save_tokens: {
        Args: {
          p_realm_id: string;
          p_access_token_enc: string;
          p_refresh_token_enc: string;
          p_expires_at: string;
          p_refresh_expires_at: string;
          p_environment: string;
        };
        Returns: boolean;
      };
      quickbooks_try_begin_refresh: {
        Args: { p_lease_seconds: number };
        Returns: boolean;
      };
      quickbooks_release_refresh: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      quickbooks_mark_needs_sign_in: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      quickbooks_disconnect: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      quickbooks_oauth_save_pending: {
        Args: {
          p_state: string;
          p_redirect_uri: string;
          p_expires_at: string;
        };
        Returns: boolean;
      };
      quickbooks_oauth_take_pending: {
        Args: { p_state: string };
        Returns: Json;
      };
      quickbooks_existing_source_ids: {
        Args: { p_ids: string[] };
        Returns: string[];
      };
      import_quickbooks_operating_expense: {
        Args: {
          p_expense_date: string;
          p_category: string;
          p_amount_cents: number;
          p_note: string | null;
          p_qbo_source_id: string;
        };
        Returns: Json;
      };
      import_quickbooks_file_expense: {
        Args: {
          p_expense_date: string;
          p_category: string;
          p_amount_cents: number;
          p_note: string | null;
          p_qbo_source_id: string;
        };
        Returns: Json;
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
