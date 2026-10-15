"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/StateForm";
import { requireAdmin } from "@/lib/auth";
import type { UserRole } from "@/lib/database.types";
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
// 사용자
//
// 계정 생성은 Supabase Auth 를 건드려야 해서 service_role 키가 필요하다.
// 키가 없으면 Supabase 대시보드에서 만들도록 안내한다.
// ---------------------------------------------------------------------------

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않아 계정을 만들 수 없습니다. .env.local 에 키를 넣거나 Supabase 대시보드에서 직접 만드세요.",
    };
  }

  const email = str(formData, "email");
  const name = str(formData, "name");
  const password = str(formData, "password");
  const role: UserRole = str(formData, "role") === "ADMIN" ? "ADMIN" : "USER";

  if (!email) return { error: "이메일을 입력하세요." };
  if (!name) return { error: "이름을 입력하세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 사내 계정이라 메일 인증 절차를 두지 않는다
    user_metadata: { name, role },
  });

  if (error) {
    const message = error.message.includes("already been registered")
      ? "이미 등록된 이메일입니다."
      : `계정 생성에 실패했습니다. (${error.message})`;
    return { error: message };
  }

  // 트리거가 프로필을 만들지만, 이름·역할이 확실히 들어가도록 한 번 더 맞춘다
  if (data.user) {
    await admin.from("profiles").update({ name, role }).eq("id", data.user.id);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY 가 없어 비밀번호를 바꿀 수 없습니다." };
  }

  const userId = str(formData, "user_id");
  const password = str(formData, "password");
  if (!userId) return { error: "사용자를 찾을 수 없습니다." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });

  if (error) return { error: `비밀번호 변경에 실패했습니다. (${error.message})` };

  revalidatePath("/admin/users");
  return { error: null, ok: "비밀번호를 변경했습니다." };
}
