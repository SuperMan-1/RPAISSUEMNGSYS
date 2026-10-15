"use client";

import { useMemo, useState } from "react";

import { startRun } from "@/app/(main)/inspections/actions";
import { StateForm } from "@/components/StateForm";

export type TemplateOption = {
  id: number;
  name: string;
  site_id: number | null;
  itemCount: number;
};

export function InspectionStartForm({
  templates,
  sites,
  tasks,
  defaultInspectedAt,
}: {
  templates: TemplateOption[];
  sites: { id: number; name: string }[];
  tasks: { id: number; site_id: number; name: string }[];
  defaultInspectedAt: string;
}) {
  const [templateId, setTemplateId] = useState("");
  const [siteId, setSiteId] = useState("");

  const template = templates.find((t) => String(t.id) === templateId);

  // 사이트 전용 템플릿이면 그 사이트로 고정한다
  const lockedSiteId = template?.site_id ? String(template.site_id) : null;
  const effectiveSiteId = lockedSiteId ?? siteId;

  const siteTasks = useMemo(
    () => tasks.filter((t) => String(t.site_id) === effectiveSiteId),
    [tasks, effectiveSiteId],
  );

  return (
    <StateForm action={startRun} submitLabel="점검 시작">
      <div className="form-grid">
        <div>
          <label className="lbl" htmlFor="template_id">
            점검 템플릿<span className="req">*</span>
          </label>
          <select
            id="template_id"
            name="template_id"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            required
          >
            <option value="">선택하세요</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.itemCount}개 항목)
              </option>
            ))}
          </select>
          {template && template.itemCount === 0 && (
            <div className="help" style={{ color: "var(--danger)" }}>
              이 템플릿에는 점검 항목이 없습니다. 관리 → 점검 템플릿에서 먼저 등록하세요.
            </div>
          )}
        </div>

        <div>
          <label className="lbl" htmlFor="site_id">
            사이트<span className="req">*</span>
          </label>
          <select
            id="site_id"
            name="site_id"
            value={effectiveSiteId}
            onChange={(e) => setSiteId(e.target.value)}
            disabled={Boolean(lockedSiteId)}
            required
          >
            <option value="">선택하세요</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {lockedSiteId && (
            <>
              <input type="hidden" name="site_id" value={lockedSiteId} />
              <div className="help">이 템플릿은 해당 사이트 전용입니다.</div>
            </>
          )}
        </div>

        <div>
          <label className="lbl" htmlFor="task_id">
            과제
          </label>
          <select id="task_id" name="task_id" disabled={!effectiveSiteId}>
            <option value="">(사이트 전체)</option>
            {siteTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="help">특정 과제만 점검하는 경우에 고르세요.</div>
        </div>

        <div>
          <label className="lbl" htmlFor="inspected_at">
            점검일시<span className="req">*</span>
          </label>
          <input
            type="datetime-local"
            id="inspected_at"
            name="inspected_at"
            defaultValue={defaultInspectedAt}
            required
          />
        </div>

        <div className="full">
          <label className="lbl" htmlFor="note">
            비고
          </label>
          <textarea id="note" name="note" rows={3} placeholder="점검 전반에 대한 메모" />
        </div>
      </div>
    </StateForm>
  );
}
