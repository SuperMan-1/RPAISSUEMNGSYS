/**
 * Supabase 스키마 타입.
 *
 * supabase/migrations/0001_init.sql 과 1:1로 맞춰 손으로 작성했다.
 * 프로젝트를 만든 뒤에는 아래 명령으로 다시 생성할 수 있다.
 *
 *   npx supabase gen types typescript --project-id <프로젝트ID> > lib/database.types.ts
 */

export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type IssueStatus =
  | "RECEIVED"
  | "IN_PROGRESS"
  | "ACTION_DONE"
  | "CLOSED"
  | "ON_HOLD";
export type ActionResult = "RESOLVED" | "TEMPORARY" | "UNRESOLVED";
export type CheckResult = "OK" | "NG" | "NA";
export type RunStatus = "IN_PROGRESS" | "DONE";
export type UserRole = "ADMIN" | "USER";

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          name: string;
          email: string | null;
          /** email 에서 DB 가 계산한다. 쓰기 불가 */
          email_norm: string | null;
          company: string | null;
          dept: string | null;
          phone: string | null;
          role: UserRole;
          is_active: boolean;
          /** 임시비밀번호 상태. 새 비밀번호를 정하기 전까지 다른 화면을 쓸 수 없다 */
          must_change_password: boolean;
          password_reset_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: {
          id: string;
          username?: string;
          name?: string;
          email?: string | null;
          company?: string | null;
          dept?: string | null;
          phone?: string | null;
          role?: UserRole;
          is_active?: boolean;
          must_change_password?: boolean;
          password_reset_at?: Timestamp | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };

      sites: {
        Row: {
          id: number;
          code: string;
          name: string;
          note: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: never;
          code: string;
          name: string;
          note?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: Timestamp;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["sites"]["Insert"], "id">>;
        Relationships: [];
      };

      tasks: {
        Row: {
          id: number;
          site_id: number;
          code: string;
          name: string;
          note: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: never;
          site_id: number;
          code: string;
          name: string;
          note?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: Timestamp;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["tasks"]["Insert"], "id">>;
        Relationships: [];
      };

      issue_types: {
        Row: { id: number; name: string; is_active: boolean; sort_order: number };
        Insert: { id?: never; name: string; is_active?: boolean; sort_order?: number };
        Update: Partial<Omit<Database["public"]["Tables"]["issue_types"]["Insert"], "id">>;
        Relationships: [];
      };

      tags: {
        Row: { id: number; name: string };
        Insert: { id?: never; name: string };
        Update: Partial<Omit<Database["public"]["Tables"]["tags"]["Insert"], "id">>;
        Relationships: [];
      };

      issues: {
        Row: {
          id: number;
          no: string;
          site_id: number;
          task_id: number | null;
          type_id: number | null;
          title: string;
          symptom: string;
          severity: Severity;
          status: IssueStatus;
          occurred_at: Timestamp;
          closed_at: Timestamp | null;
          reporter_id: string;
          assignee_id: string | null;
          source_run_id: number | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: never;
          /** 비우면 트리거가 2026-0001 형식으로 채운다 */
          no?: string;
          site_id: number;
          task_id?: number | null;
          type_id?: number | null;
          title: string;
          symptom?: string;
          severity?: Severity;
          status?: IssueStatus;
          occurred_at?: Timestamp;
          closed_at?: Timestamp | null;
          reporter_id: string;
          assignee_id?: string | null;
          source_run_id?: number | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["issues"]["Insert"], "id">>;
        Relationships: [];
      };

      issue_tags: {
        Row: { issue_id: number; tag_id: number };
        Insert: { issue_id: number; tag_id: number };
        Update: Partial<{ issue_id: number; tag_id: number }>;
        Relationships: [];
      };

      /** 처리 이력 — 이슈 한 건에 날짜별로 여러 건 */
      actions: {
        Row: {
          id: number;
          issue_id: number;
          acted_at: Timestamp;
          actor_id: string;
          content: string;
          result: ActionResult;
          created_at: Timestamp;
        };
        Insert: {
          id?: never;
          issue_id: number;
          acted_at?: Timestamp;
          actor_id: string;
          content: string;
          result?: ActionResult;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["actions"]["Insert"], "id">>;
        Relationships: [];
      };

      attachments: {
        Row: {
          id: number;
          issue_id: number | null;
          action_id: number | null;
          run_id: number | null;
          file_name: string;
          storage_path: string;
          content_type: string;
          size: number;
          uploaded_by: string;
          created_at: Timestamp;
        };
        Insert: {
          id?: never;
          issue_id?: number | null;
          action_id?: number | null;
          run_id?: number | null;
          file_name: string;
          storage_path: string;
          content_type?: string;
          size?: number;
          uploaded_by: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["attachments"]["Insert"], "id">>;
        Relationships: [];
      };

      inspection_templates: {
        Row: {
          id: number;
          name: string;
          description: string | null;
          site_id: number | null;
          is_active: boolean;
          created_at: Timestamp;
        };
        Insert: {
          id?: never;
          name: string;
          description?: string | null;
          site_id?: number | null;
          is_active?: boolean;
        };
        Update: Partial<
          Omit<Database["public"]["Tables"]["inspection_templates"]["Insert"], "id">
        >;
        Relationships: [];
      };

      inspection_items: {
        Row: {
          id: number;
          template_id: number;
          seq: number;
          content: string;
          note: string | null;
        };
        Insert: {
          id?: never;
          template_id: number;
          seq?: number;
          content: string;
          note?: string | null;
        };
        Update: Partial<
          Omit<Database["public"]["Tables"]["inspection_items"]["Insert"], "id">
        >;
        Relationships: [];
      };

      inspection_runs: {
        Row: {
          id: number;
          template_id: number;
          site_id: number;
          task_id: number | null;
          inspected_at: Timestamp;
          inspector_id: string;
          status: RunStatus;
          note: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: never;
          template_id: number;
          site_id: number;
          task_id?: number | null;
          inspected_at?: Timestamp;
          inspector_id: string;
          status?: RunStatus;
          note?: string | null;
        };
        Update: Partial<
          Omit<Database["public"]["Tables"]["inspection_runs"]["Insert"], "id">
        >;
        Relationships: [];
      };

      inspection_results: {
        Row: {
          id: number;
          run_id: number;
          item_id: number | null;
          content: string;
          result: CheckResult;
          comment: string | null;
          issue_id: number | null;
          seq: number;
        };
        Insert: {
          id?: never;
          run_id: number;
          item_id?: number | null;
          content: string;
          result?: CheckResult;
          comment?: string | null;
          issue_id?: number | null;
          seq?: number;
        };
        Update: Partial<
          Omit<Database["public"]["Tables"]["inspection_results"]["Insert"], "id">
        >;
        Relationships: [];
      };

      issue_counters: {
        Row: { year: number; last_seq: number };
        Insert: { year: number; last_seq?: number };
        Update: Partial<{ year: number; last_seq: number }>;
        Relationships: [];
      };
    };

    Views: Record<never, never>;

    Functions: {
      /** 유사이슈 검색. 가중치는 prod.md 7.3 참고 */
      search_similar_issues: {
        Args: {
          p_tokens?: string[];
          p_tags?: string[];
          p_type_id?: number | null;
          p_site_id?: number | null;
          p_exclude_issue_id?: number | null;
          p_limit?: number;
        };
        Returns: SimilarIssue[];
      };
      /** 문장에서 검색어(토큰) 추출 */
      tokenize: { Args: { p_text: string }; Returns: string[] };
      next_issue_no: { Args: { p_when?: string }; Returns: string };
      is_admin: { Args: Record<never, never>; Returns: boolean };
      is_active_user: { Args: Record<never, never>; Returns: boolean };
      /** 가입 화면의 아이디 중복 확인. 쓰였는지 여부만 돌려준다 */
      username_taken: { Args: { p_username: string }; Returns: boolean };
      generate_username: { Args: { p_email: string }; Returns: string };
    };

    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/** search_similar_issues 가 돌려주는 한 건 */
export type SimilarIssue = {
  issue_id: number;
  issue_no: string;
  issue_title: string;
  site_name: string;
  task_name: string | null;
  type_name: string | null;
  issue_status: IssueStatus;
  issue_severity: Severity;
  occurred_at: Timestamp;
  score: number;
  action_count: number;
  last_action_content: string | null;
  last_action_result: ActionResult | null;
  last_action_at: Timestamp | null;
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
