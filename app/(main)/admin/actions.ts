"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/StateForm";
import {
  emailKey,
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from "@/lib/account";
import { requireAdmin } from "@/lib/auth";
import type { UserRole } from "@/lib/database.types";
import { hasSupabaseSecretKey } from "@/lib/supabase/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(formData: FormData, key: string, fallback = 0): number {
  const n = Number(str(formData, key));
  return Number.isFinite(n) ? n : fallback;
}

function bool(formData: FormData, key: string): boolean {
  return str(formData, key) === "1";
}

function id(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type DbError = { code?: string; message: string };

/** Postgres 오류 코드를 사람이 읽을 말로 바꾼다 */
function friendly(error: DbError, fallback: string): string {
  if (error.code === "23505") return "같은 코드(또는 이름)가 이미 있습니다.";
  if (error.code === "23503") {
    return "이미 이슈나 점검에서 쓰고 있어 삭제할 수 없습니다. 대신 '사용'을 해제해 목록에서 숨기세요.";
  }
  return `${fallback} (${error.message})`;
}

// ---------------------------------------------------------------------------
// 사이트
// ---------------------------------------------------------------------------

export async function createSite(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!code) return { error: "코드를 입력하세요." };
  if (!name) return { error: "이름을 입력하세요." };

  const { error } = await supabase.from("sites").insert({
    code,
    name,
    note: str(formData, "note") || null,
    sort_order: num(formData, "sort_order"),
  });

  if (error) return { error: friendly(error, "사이트 등록에 실패했습니다.") };

  revalidatePath("/admin/sites");
  redirect("/admin/sites");
}

export async function updateSite(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const siteId = id(formData, "site_id");
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!siteId) return { error: "사이트를 찾을 수 없습니다." };
  if (!code) return { error: "코드를 입력하세요." };
  if (!name) return { error: "이름을 입력하세요." };

  const { error } = await supabase
    .from("sites")
    .update({
      code,
      name,
      note: str(formData, "note") || null,
      sort_order: num(formData, "sort_order"),
      is_active: bool(formData, "is_active"),
    })
    .eq("id", siteId);

  if (error) return { error: friendly(error, "저장에 실패했습니다.") };

  revalidatePath("/admin/sites");
  revalidatePath(`/admin/sites/${siteId}`);
  return { error: null, ok: "저장했습니다." };
}

export async function deleteSite(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const siteId = id(formData, "site_id");
  if (!siteId) throw new Error("사이트를 찾을 수 없습니다.");

  const { error } = await supabase.from("sites").delete().eq("id", siteId);
  if (error) throw new Error(friendly(error, "삭제에 실패했습니다."));

  revalidatePath("/admin/sites");
  redirect("/admin/sites");
}

// ---------------------------------------------------------------------------
// 과제
// ---------------------------------------------------------------------------

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const siteId = id(formData, "site_id");
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!siteId) return { error: "사이트를 찾을 수 없습니다." };
  if (!code) return { error: "코드를 입력하세요." };
  if (!name) return { error: "이름을 입력하세요." };

  const { error } = await supabase.from("tasks").insert({
    site_id: siteId,
    code,
    name,
    note: str(formData, "note") || null,
    sort_order: num(formData, "sort_order"),
  });

  if (error) return { error: friendly(error, "과제 등록에 실패했습니다.") };

  revalidatePath(`/admin/sites/${siteId}`);
  redirect(`/admin/sites/${siteId}`);
}

export async function updateTask(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const taskId = id(formData, "task_id");
  const siteId = id(formData, "site_id");
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!taskId) throw new Error("과제를 찾을 수 없습니다.");
  if (!code || !name) throw new Error("코드와 이름은 비울 수 없습니다.");

  const { error } = await supabase
    .from("tasks")
    .update({
      code,
      name,
      sort_order: num(formData, "sort_order"),
      is_active: bool(formData, "is_active"),
    })
    .eq("id", taskId);

  if (error) throw new Error(friendly(error, "저장에 실패했습니다."));

  if (siteId) revalidatePath(`/admin/sites/${siteId}`);
}

export async function deleteTask(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const taskId = id(formData, "task_id");
  const siteId = id(formData, "site_id");
  if (!taskId) throw new Error("과제를 찾을 수 없습니다.");

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw new Error(friendly(error, "삭제에 실패했습니다."));

  if (siteId) revalidatePath(`/admin/sites/${siteId}`);
}

// ---------------------------------------------------------------------------
// 이슈 유형
// ---------------------------------------------------------------------------

export async function createIssueType(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const name = str(formData, "name");
  if (!name) return { error: "이름을 입력하세요." };

  const { error } = await supabase
    .from("issue_types")
    .insert({ name, sort_order: num(formData, "sort_order") });

  if (error) return { error: friendly(error, "유형 등록에 실패했습니다.") };

  revalidatePath("/admin/types");
  redirect("/admin/types");
}

export async function updateIssueType(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const typeId = id(formData, "type_id");
  const name = str(formData, "name");
  if (!typeId) throw new Error("유형을 찾을 수 없습니다.");
  if (!name) throw new Error("이름은 비울 수 없습니다.");

  const { error } = await supabase
    .from("issue_types")
    .update({
      name,
      sort_order: num(formData, "sort_order"),
      is_active: bool(formData, "is_active"),
    })
    .eq("id", typeId);

  if (error) throw new Error(friendly(error, "저장에 실패했습니다."));

  revalidatePath("/admin/types");
}

export async function deleteIssueType(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const typeId = id(formData, "type_id");
  if (!typeId) throw new Error("유형을 찾을 수 없습니다.");

  const { error } = await supabase.from("issue_types").delete().eq("id", typeId);
  if (error) throw new Error(friendly(error, "삭제에 실패했습니다."));

  revalidatePath("/admin/types");
}

// ---------------------------------------------------------------------------
// 점검 템플릿
// ---------------------------------------------------------------------------

export async function createTemplate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const name = str(formData, "name");
  if (!name) return { error: "이름을 입력하세요." };

  const { data, error } = await supabase
    .from("inspection_templates")
    .insert({
      name,
      description: str(formData, "description") || null,
      site_id: id(formData, "site_id"),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendly(error ?? { message: "알 수 없는 오류" }, "템플릿 등록에 실패했습니다.") };
  }

  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${data.id}`);
}

export async function updateTemplate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const templateId = id(formData, "template_id");
  const name = str(formData, "name");
  if (!templateId) return { error: "템플릿을 찾을 수 없습니다." };
  if (!name) return { error: "이름을 입력하세요." };

  const { error } = await supabase
    .from("inspection_templates")
    .update({
      name,
      description: str(formData, "description") || null,
      site_id: id(formData, "site_id"),
      is_active: bool(formData, "is_active"),
    })
    .eq("id", templateId);

  if (error) return { error: friendly(error, "저장에 실패했습니다.") };

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  return { error: null, ok: "저장했습니다." };
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const templateId = id(formData, "template_id");
  if (!templateId) throw new Error("템플릿을 찾을 수 없습니다.");

  // 이 템플릿으로 수행한 점검이 있으면 DB 가 삭제를 거부한다(외래키).
  // 템플릿을 지우면 과거 점검 기록이 함께 사라지므로 일부러 막아 둔 것이다.
  // 다만 예외를 던지면 운영 환경에서는 메시지가 가려져 "그냥 안 되는" 것처럼 보인다.
  // 왜 안 되는지 화면에서 읽을 수 있도록 되돌려 보낸다.
  const { count } = await supabase
    .from("inspection_runs")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);

  if (count && count > 0) {
    redirect(`/admin/templates/${templateId}?blocked=${count}`);
  }

  const { error } = await supabase
    .from("inspection_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw new Error(friendly(error, "삭제에 실패했습니다."));

  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}

export async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const templateId = id(formData, "template_id");
  const content = str(formData, "content");
  if (!templateId) return { error: "템플릿을 찾을 수 없습니다." };
  if (!content) return { error: "점검 내용을 입력하세요." };

  const { error } = await supabase.from("inspection_items").insert({
    template_id: templateId,
    seq: num(formData, "seq"),
    content,
    note: str(formData, "note") || null,
  });

  if (error) return { error: friendly(error, "항목 추가에 실패했습니다.") };

  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}`);
}

export async function updateItem(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const itemId = id(formData, "item_id");
  const templateId = id(formData, "template_id");
  const content = str(formData, "content");
  if (!itemId) throw new Error("항목을 찾을 수 없습니다.");
  if (!content) throw new Error("점검 내용은 비울 수 없습니다.");

  const { error } = await supabase
    .from("inspection_items")
    .update({
      content,
      seq: num(formData, "seq"),
      note: str(formData, "note") || null,
    })
    .eq("id", itemId);

  if (error) throw new Error(friendly(error, "저장에 실패했습니다."));

  if (templateId) revalidatePath(`/admin/templates/${templateId}`);
}

export async function deleteItem(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const itemId = id(formData, "item_id");
  const templateId = id(formData, "template_id");
  if (!itemId) throw new Error("항목을 찾을 수 없습니다.");

  // 지난 점검 기록은 항목 문구를 복사해 두므로, 항목을 지워도 이력은 남는다
  const { error } = await supabase.from("inspection_items").delete().eq("id", itemId);
  if (error) throw new Error(friendly(error, "삭제에 실패했습니다."));

  if (templateId) revalidatePath(`/admin/templates/${templateId}`);
}

// ---------------------------------------------------------------------------
// 사용자
//
// 계정 생성은 Supabase Auth 를 건드려야 해서 service_role 키가 필요하다.
// 키가 없으면 Supabase 대시보드에서 만들도록 안내한다.
// ---------------------------------------------------------------------------

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  if (!hasSupabaseSecretKey()) {
    return {
      error:
        "SUPABASE_SECRET_KEY 가 설정되지 않아 계정을 만들 수 없습니다. .env.local 에 키를 넣거나 Supabase 대시보드에서 직접 만드세요.",
    };
  }

  const username = normalizeUsername(str(formData, "username"));
  const email = normalizeEmail(str(formData, "email"));
  const name = str(formData, "name");
  const password = str(formData, "password");
  const role: UserRole = str(formData, "role") === "ADMIN" ? "ADMIN" : "USER";
  const company = str(formData, "company") || null;
  const dept = str(formData, "dept") || null;
  const phone = normalizePhone(str(formData, "phone"));

  const problem =
    validateUsername(username) ??
    (!name ? "이름을 입력하세요." : null) ??
    validateEmail(email) ??
    validatePassword(password) ??
    validatePhone(phone);

  if (problem) return { error: problem };

  const admin = createAdminClient();

  const [{ count: usernameTaken }, { count: emailTaken }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("username", username),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email_norm", emailKey(email)),
  ]);

  if (usernameTaken) return { error: "이미 쓰고 있는 아이디입니다." };
  if (emailTaken) return { error: "이미 등록된 이메일입니다." };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 사내 계정이라 메일 인증 절차를 두지 않는다
    user_metadata: { name, username, company, dept, phone },
  });

  if (error) {
    const message = error.message.includes("already been registered")
      ? "이미 등록된 이메일입니다."
      : `계정 생성에 실패했습니다. (${error.message})`;
    return { error: message };
  }

  // 트리거는 모든 계정을 USER·미사용으로 만든다 (가입 화면에서 스스로
  // 관리자가 되는 것을 막기 위해서다). 관리자가 발급한 계정은 여기서 바로 열어 준다.
  if (data.user) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ username, name, email, company, dept, phone, role, is_active: true })
      .eq("id", data.user.id);

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: friendly(profileError, "계정 생성에 실패했습니다.") };
    }
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** 가입 신청 승인 — 사용 여부만 켠다 */
export async function approveUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const userId = str(formData, "user_id");
  if (!userId) throw new Error("사용자를 찾을 수 없습니다.");

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: true })
    .eq("id", userId);

  if (error) throw new Error(friendly(error, "승인에 실패했습니다."));

  revalidatePath("/admin/users");
}

/** 가입 신청 거절 — 계정을 통째로 지운다. 아직 남긴 글이 없으므로 지워도 된다 */
export async function rejectUser(formData: FormData): Promise<void> {
  await requireAdmin();

  if (!hasSupabaseSecretKey()) {
    throw new Error("SUPABASE_SECRET_KEY 가 없어 계정을 지울 수 없습니다.");
  }

  const userId = str(formData, "user_id");
  if (!userId) throw new Error("사용자를 찾을 수 없습니다.");

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!target) throw new Error("사용자를 찾을 수 없습니다.");
  if (target.is_active) throw new Error("이미 승인된 계정은 거절할 수 없습니다.");

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`거절에 실패했습니다. (${error.message})`);

  revalidatePath("/admin/users");
}

export async function updateUser(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const supabase = await createClient();

  const userId = str(formData, "user_id");
  const name = str(formData, "name");
  const role: UserRole = str(formData, "role") === "ADMIN" ? "ADMIN" : "USER";
  const isActive = bool(formData, "is_active");

  if (!userId) throw new Error("사용자를 찾을 수 없습니다.");
  if (!name) throw new Error("이름은 비울 수 없습니다.");

  // 관리자가 자기 자신의 권한을 떨어뜨리거나 스스로를 중지시키면 잠겨버린다
  if (userId === me.id && (role !== "ADMIN" || !isActive)) {
    throw new Error("자기 자신의 관리자 권한은 해제할 수 없습니다. 다른 관리자에게 요청하세요.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ name, role, is_active: isActive })
    .eq("id", userId);

  if (error) throw new Error(friendly(error, "저장에 실패했습니다."));

  revalidatePath("/admin/users");
}

export async function resetUserPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  if (!hasSupabaseSecretKey()) {
    return { error: "SUPABASE_SECRET_KEY 가 없어 비밀번호를 바꿀 수 없습니다." };
  }

  const userId = str(formData, "user_id");
  const password = str(formData, "password");
  if (!userId) return { error: "사용자를 찾을 수 없습니다." };

  const weak = validatePassword(password);
  if (weak) return { error: weak };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });

  if (error) return { error: `비밀번호 변경에 실패했습니다. (${error.message})` };

  revalidatePath("/admin/users");
  return { error: null, ok: "비밀번호를 변경했습니다." };
}
