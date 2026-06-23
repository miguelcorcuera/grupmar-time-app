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
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          employee_id: string | null
          id: string
          message: string
          month: number | null
          related_attendance_event_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
          threshold: number | null
          title: string
          year: number | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          employee_id?: string | null
          id?: string
          message: string
          month?: number | null
          related_attendance_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: string
          status?: string
          threshold?: number | null
          title: string
          year?: number | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          message?: string
          month?: number | null
          related_attendance_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
          threshold?: number | null
          title?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "alerts_related_attendance_event_id_fkey"
            columns: ["related_attendance_event_id"]
            isOneToOne: false
            referencedRelation: "attendance_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          browser_info: string | null
          connection_location_status: string | null
          created_at: string
          created_by: string | null
          device_info: string | null
          employee_id: string
          event_date: string
          event_time: string
          event_type: string
          id: string
          ip_address: string | null
          is_company_network: boolean
          lunch_window_status: string | null
          notes: string | null
          requires_admin_review: boolean | null
          security_flag: boolean
          security_notes: string | null
          source: string | null
          status: string
          user_agent: string | null
        }
        Insert: {
          browser_info?: string | null
          connection_location_status?: string | null
          created_at?: string
          created_by?: string | null
          device_info?: string | null
          employee_id: string
          event_date?: string
          event_time?: string
          event_type: string
          id?: string
          ip_address?: string | null
          is_company_network?: boolean
          lunch_window_status?: string | null
          notes?: string | null
          requires_admin_review?: boolean | null
          security_flag?: boolean
          security_notes?: string | null
          source?: string | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          browser_info?: string | null
          connection_location_status?: string | null
          created_at?: string
          created_by?: string | null
          device_info?: string | null
          employee_id?: string
          event_date?: string
          event_time?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          is_company_network?: boolean
          lunch_window_status?: string | null
          notes?: string | null
          requires_admin_review?: boolean | null
          security_flag?: boolean
          security_notes?: string | null
          source?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "attendance_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      daily_attendance_summary: {
        Row: {
          actual_entry_time: string | null
          actual_exit_time: string | null
          attendance_date: string
          connection_location_status: string | null
          created_at: string
          employee_id: string
          expected_entry_time: string | null
          expected_exit_time: string | null
          has_extra_exit: boolean | null
          has_permission: boolean | null
          has_security_flag: boolean | null
          has_tardiness: boolean | null
          id: string
          ip_address: string | null
          is_absent: boolean | null
          is_justified: boolean | null
          late_minutes_after_tolerance: number | null
          late_minutes_total: number | null
          lunch_end: string | null
          lunch_start: string | null
          shift_id: string | null
          status: string | null
          total_lunch_minutes: number | null
          updated_at: string
        }
        Insert: {
          actual_entry_time?: string | null
          actual_exit_time?: string | null
          attendance_date: string
          connection_location_status?: string | null
          created_at?: string
          employee_id: string
          expected_entry_time?: string | null
          expected_exit_time?: string | null
          has_extra_exit?: boolean | null
          has_permission?: boolean | null
          has_security_flag?: boolean | null
          has_tardiness?: boolean | null
          id?: string
          ip_address?: string | null
          is_absent?: boolean | null
          is_justified?: boolean | null
          late_minutes_after_tolerance?: number | null
          late_minutes_total?: number | null
          lunch_end?: string | null
          lunch_start?: string | null
          shift_id?: string | null
          status?: string | null
          total_lunch_minutes?: number | null
          updated_at?: string
        }
        Update: {
          actual_entry_time?: string | null
          actual_exit_time?: string | null
          attendance_date?: string
          connection_location_status?: string | null
          created_at?: string
          employee_id?: string
          expected_entry_time?: string | null
          expected_exit_time?: string | null
          has_extra_exit?: boolean | null
          has_permission?: boolean | null
          has_security_flag?: boolean | null
          has_tardiness?: boolean | null
          id?: string
          ip_address?: string | null
          is_absent?: boolean | null
          is_justified?: boolean | null
          late_minutes_after_tolerance?: number | null
          late_minutes_total?: number | null
          lunch_end?: string | null
          lunch_start?: string | null
          shift_id?: string | null
          status?: string | null
          total_lunch_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "daily_attendance_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "daily_attendance_summary_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      disciplinary_letters: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          employee_id: string
          generated_at: string
          id: string
          letter_type: string
          month: number
          pdf_url: string | null
          status: string
          tardiness_count: number | null
          threshold: number | null
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          employee_id: string
          generated_at?: string
          id?: string
          letter_type: string
          month: number
          pdf_url?: string | null
          status?: string
          tardiness_count?: number | null
          threshold?: number | null
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          employee_id?: string
          generated_at?: string
          id?: string
          letter_type?: string
          month?: number
          pdf_url?: string | null
          status?: string
          tardiness_count?: number | null
          threshold?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_letters_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_letters_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "disciplinary_letters_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "disciplinary_letters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_letters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "disciplinary_letters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      employee_shift_assignments: {
        Row: {
          active: boolean
          created_at: string
          employee_id: string
          end_date: string | null
          id: string
          shift_id: string
          start_date: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_id: string
          end_date?: string | null
          id?: string
          shift_id: string
          start_date: string
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_id?: string
          end_date?: string | null
          id?: string
          shift_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      justifications: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          attendance_event_id: string | null
          created_at: string
          employee_id: string
          id: string
          justification_type: string | null
          reason: string
          status: string
          tardiness_record_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          attendance_event_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          justification_type?: string | null
          reason: string
          status?: string
          tardiness_record_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          attendance_event_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          justification_type?: string | null
          reason?: string
          status?: string
          tardiness_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "justifications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justifications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "justifications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "justifications_attendance_event_id_fkey"
            columns: ["attendance_event_id"]
            isOneToOne: false
            referencedRelation: "attendance_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "justifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "justifications_tardiness_record_id_fkey"
            columns: ["tardiness_record_id"]
            isOneToOne: false
            referencedRelation: "tardiness_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          department_id: string | null
          document_number: string | null
          email: string
          employee_code: string | null
          full_name: string
          id: string
          updated_at: string
          work_center_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          document_number?: string | null
          email: string
          employee_code?: string | null
          full_name: string
          id: string
          updated_at?: string
          work_center_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          document_number?: string | null
          email?: string
          employee_code?: string | null
          full_name?: string
          id?: string
          updated_at?: string
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          attendance_event_id: string | null
          browser_info: string | null
          connection_location_status: string | null
          created_at: string
          device_info: string | null
          employee_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          is_company_network: boolean | null
          message: string | null
          risk_level: string | null
          user_agent: string | null
        }
        Insert: {
          attendance_event_id?: string | null
          browser_info?: string | null
          connection_location_status?: string | null
          created_at?: string
          device_info?: string | null
          employee_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          is_company_network?: boolean | null
          message?: string | null
          risk_level?: string | null
          user_agent?: string | null
        }
        Update: {
          attendance_event_id?: string | null
          browser_info?: string | null
          connection_location_status?: string | null
          created_at?: string
          device_info?: string | null
          employee_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          is_company_network?: boolean | null
          message?: string | null
          risk_level?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_logs_attendance_event_id_fkey"
            columns: ["attendance_event_id"]
            isOneToOne: false
            referencedRelation: "attendance_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "security_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      shifts: {
        Row: {
          active: boolean
          allow_early_clockin_without_approval: boolean | null
          allow_overtime_without_approval: boolean | null
          created_at: string
          days_applicable: number[]
          early_clockin_window_minutes: number | null
          end_time: string
          exit_grace_minutes: number | null
          id: string
          lunch_end_time: string | null
          lunch_minutes: number
          lunch_start_time: string | null
          max_lunch_minutes: number | null
          name: string
          require_admin_approval_for_overtime: boolean | null
          start_time: string
          tolerance_minutes: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_early_clockin_without_approval?: boolean | null
          allow_overtime_without_approval?: boolean | null
          created_at?: string
          days_applicable?: number[]
          early_clockin_window_minutes?: number | null
          end_time: string
          exit_grace_minutes?: number | null
          id?: string
          lunch_end_time?: string | null
          lunch_minutes?: number
          lunch_start_time?: string | null
          max_lunch_minutes?: number | null
          name: string
          require_admin_approval_for_overtime?: boolean | null
          start_time: string
          tolerance_minutes?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_early_clockin_without_approval?: boolean | null
          allow_overtime_without_approval?: boolean | null
          created_at?: string
          days_applicable?: number[]
          early_clockin_window_minutes?: number | null
          end_time?: string
          exit_grace_minutes?: number | null
          id?: string
          lunch_end_time?: string | null
          lunch_minutes?: number
          lunch_start_time?: string | null
          max_lunch_minutes?: number | null
          name?: string
          require_admin_approval_for_overtime?: boolean | null
          start_time?: string
          tolerance_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      tardiness_records: {
        Row: {
          actual_time: string | null
          attendance_date: string
          counts_for_discipline: boolean | null
          created_at: string
          employee_id: string
          expected_time: string | null
          id: string
          justified: boolean | null
          late_minutes: number | null
          month: number
          sanctionable_late_minutes: number | null
          tolerance_minutes: number | null
          year: number
        }
        Insert: {
          actual_time?: string | null
          attendance_date: string
          counts_for_discipline?: boolean | null
          created_at?: string
          employee_id: string
          expected_time?: string | null
          id?: string
          justified?: boolean | null
          late_minutes?: number | null
          month: number
          sanctionable_late_minutes?: number | null
          tolerance_minutes?: number | null
          year: number
        }
        Update: {
          actual_time?: string | null
          attendance_date?: string
          counts_for_discipline?: boolean | null
          created_at?: string
          employee_id?: string
          expected_time?: string | null
          id?: string
          justified?: boolean | null
          late_minutes?: number | null
          month?: number
          sanctionable_late_minutes?: number | null
          tolerance_minutes?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tardiness_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tardiness_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tardiness_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
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
      work_centers: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_daily_attendance_admin: {
        Row: {
          actual_entry_time: string | null
          actual_exit_time: string | null
          attendance_date: string | null
          connection_location_status: string | null
          department: string | null
          employee_id: string | null
          expected_entry_time: string | null
          expected_exit_time: string | null
          full_name: string | null
          has_extra_exit: boolean | null
          has_permission: boolean | null
          has_tardiness: boolean | null
          ip_address: string | null
          is_absent: boolean | null
          is_company_network: boolean | null
          is_justified: boolean | null
          late_minutes_after_tolerance: number | null
          late_minutes_total: number | null
          lunch_end: string | null
          lunch_start: string | null
          security_flag: boolean | null
          shift: string | null
          status: string | null
          total_lunch_minutes: number | null
          work_center: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "daily_attendance_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_employee_attendance_stats: {
        Row: {
          accumulated_late_minutes: number | null
          average_entry_time: string | null
          current_month_tardiness: number | null
          employee_id: string | null
          full_name: string | null
          total_absences: number | null
          total_extra_exits: number | null
          total_outside_company_clockings: number | null
          total_permissions: number | null
          total_tardiness: number | null
          total_unknown_ip_clockings: number | null
          total_worked_days: number | null
        }
        Insert: {
          accumulated_late_minutes?: never
          average_entry_time?: never
          current_month_tardiness?: never
          employee_id?: string | null
          full_name?: string | null
          total_absences?: never
          total_extra_exits?: never
          total_outside_company_clockings?: never
          total_permissions?: never
          total_tardiness?: never
          total_unknown_ip_clockings?: never
          total_worked_days?: never
        }
        Update: {
          accumulated_late_minutes?: never
          average_entry_time?: never
          current_month_tardiness?: never
          employee_id?: string | null
          full_name?: string | null
          total_absences?: never
          total_extra_exits?: never
          total_outside_company_clockings?: never
          total_permissions?: never
          total_tardiness?: never
          total_unknown_ip_clockings?: never
          total_worked_days?: never
        }
        Relationships: []
      }
      v_monthly_tardiness_summary: {
        Row: {
          accumulated_late_minutes: number | null
          alert_level: string | null
          employee_id: string | null
          full_name: string | null
          generated_letters_count: number | null
          justified_tardiness: number | null
          month: number | null
          sanctionable_tardiness: number | null
          total_tardiness: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tardiness_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tardiness_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_attendance_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tardiness_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_security_clocking_summary"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_security_clocking_summary: {
        Row: {
          company_network_clockings: number | null
          employee_id: string | null
          full_name: string | null
          last_clocking_at: string | null
          last_connection_location_status: string | null
          last_ip_address: string | null
          outside_company_clockings: number | null
          total_clockings: number | null
          unknown_ip_clockings: number | null
        }
        Insert: {
          company_network_clockings?: never
          employee_id?: string | null
          full_name?: string | null
          last_clocking_at?: never
          last_connection_location_status?: never
          last_ip_address?: never
          outside_company_clockings?: never
          total_clockings?: never
          unknown_ip_clockings?: never
        }
        Update: {
          company_network_clockings?: never
          employee_id?: string | null
          full_name?: string | null
          last_clocking_at?: never
          last_connection_location_status?: never
          last_ip_address?: never
          outside_company_clockings?: never
          total_clockings?: never
          unknown_ip_clockings?: never
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_tardiness: {
        Args: { p_date: string; p_employee: string }
        Returns: {
          actual_time: string
          expected_time: string
          is_late: boolean
          late_minutes_after_tolerance: number
          late_minutes_total: number
          tolerance_minutes: number
        }[]
      }
      check_monthly_tardiness_alerts: {
        Args: { p_employee: string; p_month: number; p_year: number }
        Returns: undefined
      }
      create_security_alert_if_needed: {
        Args: {
          p_employee: string
          p_event_id: string
          p_ip: string
          p_status: string
        }
        Returns: undefined
      }
      detect_daily_absences: { Args: { p_date: string }; Returns: number }
      generate_disciplinary_letter: {
        Args: {
          p_employee: string
          p_month: number
          p_threshold: number
          p_year: number
        }
        Returns: string
      }
      get_setting: { Args: { p_key: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      justify_tardiness: {
        Args: { p_reason: string; p_tardiness: string; p_type: string }
        Returns: Json
      }
      register_attendance_event: {
        Args: {
          client_ip?: string
          p_browser?: string
          p_device?: string
          p_event_type: string
          p_notes?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      register_entry_on_login: {
        Args: {
          client_ip: string
          p_browser?: string
          p_device?: string
          p_user_agent: string
        }
        Returns: Json
      }
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
