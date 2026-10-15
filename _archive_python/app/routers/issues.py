"""이슈 등록 / 조회 / 조치사항."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urlencode

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app import models
from app.config import settings
from app.deps import CurrentUser, DbSession, flash, redirect, render
from app.services import search
from app.services.issues import next_issue_no, parse_dt, parse_tags, sync_tags
from app.services.uploads import save_uploads

router = APIRouter()


# --------------------------------------------------------------------------
# 공통
# --------------------------------------------------------------------------


def _masters(db) -> dict:
    """폼/필터에서 쓰는 선택목록."""
    return {
        "sites": db.scalars(
            select(models.Site)
            .where(models.Site.is_active.is_(True))
            .order_by(models.Site.sort_order, models.Site.name)
        ).all(),
        "tasks": db.scalars(
            select(models.Task)
            .where(models.Task.is_active.is_(True))
            .order_by(models.Task.site_id, models.Task.sort_order, models.Task.name)
        ).all(),
        "types": db.scalars(
            select(models.IssueType)
            .where(models.IssueType.is_active.is_(True))
            .order_by(models.IssueType.sort_order, models.IssueType.name)
        ).all(),
        "users": db.scalars(
            select(models.User)
            .where(models.User.is_active.is_(True))
            .order_by(models.User.name)
        ).all(),
    }


def _get_issue(db, issue_id: int) -> models.Issue:
    issue = db.scalar(
        select(models.Issue)
        .options(
            selectinload(models.Issue.site),
            selectinload(models.Issue.task),
            selectinload(models.Issue.type),
            selectinload(models.Issue.reporter),
            selectinload(models.Issue.assignee),
            selectinload(models.Issue.tags),
            selectinload(models.Issue.attachments),
            selectinload(models.Issue.actions).selectinload(models.Action.actor),
            selectinload(models.Issue.actions).selectinload(models.Action.attachments),
        )
        .where(models.Issue.id == issue_id)
    )
    if issue is None:
        raise HTTPException(status_code=404, detail="이슈를 찾을 수 없습니다.")
    return issue


# --------------------------------------------------------------------------
# 목록
# --------------------------------------------------------------------------


@router.get("/issues")
def list_issues(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    q: str = "",
    site_id: int | None = None,
    task_id: int | None = None,
    type_id: int | None = None,
    status: str = "",
    severity: str = "",
    assignee_id: int | None = None,
    tag: str = "",
    open_only: int = 0,
    page: int = Query(1, ge=1),
):
    stmt = select(models.Issue).options(
        selectinload(models.Issue.site),
        selectinload(models.Issue.task),
        selectinload(models.Issue.type),
        selectinload(models.Issue.assignee),
        selectinload(models.Issue.tags),
    )
    count_stmt = select(func.count(models.Issue.id))

    conds = []
    if q.strip():
        like = f"%{q.strip().lower()}%"
        conds.append(
            or_(
                func.lower(models.Issue.title).like(like),
                func.lower(models.Issue.symptom).like(like),
                func.lower(models.Issue.no).like(like),
            )
        )
    if site_id:
        conds.append(models.Issue.site_id == site_id)
    if task_id:
        conds.append(models.Issue.task_id == task_id)
    if type_id:
        conds.append(models.Issue.type_id == type_id)
    if status:
        conds.append(models.Issue.status == status)
    if severity:
        conds.append(models.Issue.severity == severity)
    if assignee_id:
        conds.append(models.Issue.assignee_id == assignee_id)
    if tag.strip():
        conds.append(models.Issue.tags.any(models.Tag.name == tag.strip()))
    if open_only:
        conds.append(models.Issue.status != models.STATUS_CLOSED)

    for c in conds:
        stmt = stmt.where(c)
        count_stmt = count_stmt.where(c)

    total = db.scalar(count_stmt) or 0
    size = settings.page_size
    pages = max(1, (total + size - 1) // size)
    page = min(page, pages)

    issues = db.scalars(
        stmt.order_by(models.Issue.occurred_at.desc(), models.Issue.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).unique().all()

    params = {
        "q": q, "site_id": site_id, "task_id": task_id, "type_id": type_id,
        "status": status, "severity": severity, "assignee_id": assignee_id,
        "tag": tag, "open_only": open_only or "",
    }
    base_query = urlencode({k: v for k, v in params.items() if v})
    if base_query:
        base_query += "&"

    return render(
        request,
        "issues/list.html",
        {
            "user": user, "nav": "issues",
            "issues": issues, "total": total, "page": page, "pages": pages,
            "base_query": base_query, "f": params,
            **_masters(db),
        },
    )


# --------------------------------------------------------------------------
# 등록
# --------------------------------------------------------------------------


@router.get("/issues/new")
def new_issue_form(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    site_id: int | None = None,
    task_id: int | None = None,
    copy_from: int | None = None,
):
    """copy_from 을 주면 유사 이슈의 내용을 채워서 시작한다."""
    draft = {
        "site_id": site_id, "task_id": task_id, "type_id": None,
        "title": "", "symptom": "", "severity": models.SEVERITY_MEDIUM,
        "tags": "", "assignee_id": user.id,
        "occurred_at": datetime.now(),
    }
    if copy_from:
        src = db.get(models.Issue, copy_from)
        if src:
            draft.update(
                type_id=src.type_id,
                title=src.title,
                symptom=src.symptom,
                severity=src.severity,
                tags=", ".join(src.tag_names),
            )

    return render(
        request,
        "issues/form.html",
        {
            "user": user, "nav": "issues", "issue": None, "draft": draft,
            "copy_from": copy_from, **_masters(db),
        },
    )


@router.post("/issues/new")
def create_issue(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    site_id: int = Form(...),
    title: str = Form(...),
    symptom: str = Form(""),
    task_id: str = Form(""),
    type_id: str = Form(""),
    severity: str = Form(models.SEVERITY_MEDIUM),
    occurred_at: str = Form(""),
    assignee_id: str = Form(""),
    tags: str = Form(""),
    attachments: list[UploadFile] = File(default=[]),
):
    title = title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="제목을 입력하세요.")

    when = parse_dt(occurred_at)
    issue = models.Issue(
        no=next_issue_no(db, when),
        site_id=site_id,
        task_id=int(task_id) if task_id else None,
        type_id=int(type_id) if type_id else None,
        title=title,
        symptom=symptom.strip(),
        severity=severity if severity in models.SEVERITIES else models.SEVERITY_MEDIUM,
        status=models.STATUS_RECEIVED,
        occurred_at=when,
        reporter_id=user.id,
        assignee_id=int(assignee_id) if assignee_id else None,
    )
    db.add(issue)
    db.flush()

    sync_tags(db, issue, parse_tags(tags))
    save_uploads(db, attachments, user=user, issue_id=issue.id)

    db.commit()
    flash(request, f"이슈 {issue.no} 을(를) 등록했습니다.")
    return redirect(f"/issues/{issue.id}")


# --------------------------------------------------------------------------
# 유사 이슈 (등록 폼에서 실시간 조회)
# --------------------------------------------------------------------------


@router.get("/issues/similar")
def similar_fragment(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    title: str = "",
    symptom: str = "",
    tags: str = "",
    type_id: str = "",
    site_id: str = "",
    exclude: str = "",
    target: str = "",
):
    hits = search.find_similar(
        db,
        title=title,
        symptom=symptom,
        tags=parse_tags(tags),
        type_id=int(type_id) if type_id else None,
        site_id=int(site_id) if site_id else None,
        exclude_issue_id=int(exclude) if exclude else None,
    )
    return render(
        request,
        "issues/_similar.html",
        {"user": user, "hits": hits, "copy_target": target},
    )


# --------------------------------------------------------------------------
# 상세
# --------------------------------------------------------------------------


@router.get("/issues/{issue_id}")
def issue_detail(request: Request, db: DbSession, user: CurrentUser, issue_id: int):
    issue = _get_issue(db, issue_id)
    hits = search.find_similar(
        db,
        title=issue.title,
        symptom=issue.symptom,
        tags=issue.tag_names,
        type_id=issue.type_id,
        site_id=issue.site_id,
        exclude_issue_id=issue.id,
        limit=6,
    )
    return render(
        request,
        "issues/detail.html",
        {
            "user": user, "nav": "issues", "issue": issue, "hits": hits,
            "copy_target": "content",
            "users": db.scalars(
                select(models.User).where(models.User.is_active.is_(True)).order_by(models.User.name)
            ).all(),
        },
    )


# --------------------------------------------------------------------------
# 수정
# --------------------------------------------------------------------------


@router.get("/issues/{issue_id}/edit")
def edit_issue_form(request: Request, db: DbSession, user: CurrentUser, issue_id: int):
    issue = _get_issue(db, issue_id)
    draft = {
        "site_id": issue.site_id, "task_id": issue.task_id, "type_id": issue.type_id,
        "title": issue.title, "symptom": issue.symptom, "severity": issue.severity,
        "tags": ", ".join(issue.tag_names), "assignee_id": issue.assignee_id,
        "occurred_at": issue.occurred_at,
    }
    return render(
        request,
        "issues/form.html",
        {"user": user, "nav": "issues", "issue": issue, "draft": draft, **_masters(db)},
    )


@router.post("/issues/{issue_id}/edit")
def update_issue(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    issue_id: int,
    site_id: int = Form(...),
    title: str = Form(...),
    symptom: str = Form(""),
    task_id: str = Form(""),
    type_id: str = Form(""),
    severity: str = Form(models.SEVERITY_MEDIUM),
    occurred_at: str = Form(""),
    assignee_id: str = Form(""),
    tags: str = Form(""),
    attachments: list[UploadFile] = File(default=[]),
):
    issue = _get_issue(db, issue_id)

    issue.site_id = site_id
    issue.task_id = int(task_id) if task_id else None
    issue.type_id = int(type_id) if type_id else None
    issue.title = title.strip()
    issue.symptom = symptom.strip()
    issue.severity = severity if severity in models.SEVERITIES else issue.severity
    issue.occurred_at = parse_dt(occurred_at, issue.occurred_at)
    issue.assignee_id = int(assignee_id) if assignee_id else None

    sync_tags(db, issue, parse_tags(tags))
    save_uploads(db, attachments, user=user, issue_id=issue.id)

    db.commit()
    flash(request, "이슈를 수정했습니다.")
    return redirect(f"/issues/{issue.id}")


@router.post("/issues/{issue_id}/delete")
def delete_issue(request: Request, db: DbSession, user: CurrentUser, issue_id: int):
    issue = _get_issue(db, issue_id)
    if not user.is_admin and issue.reporter_id != user.id:
        raise HTTPException(status_code=403, detail="등록자 또는 관리자만 삭제할 수 있습니다.")

    from app.services.uploads import delete_file

    for att in db.scalars(
        select(models.Attachment).where(models.Attachment.issue_id == issue.id)
    ).all():
        delete_file(att)
    for action in issue.actions:
        for att in action.attachments:
            delete_file(att)

    no = issue.no
    db.delete(issue)
    db.commit()
    flash(request, f"이슈 {no} 을(를) 삭제했습니다.")
    return redirect("/issues")


# --------------------------------------------------------------------------
# 상태 변경 / 담당자 변경
# --------------------------------------------------------------------------


@router.post("/issues/{issue_id}/status")
def change_status(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    issue_id: int,
    status: str = Form(...),
):
    issue = _get_issue(db, issue_id)
    if status not in models.STATUSES:
        raise HTTPException(status_code=400, detail="알 수 없는 상태입니다.")

    issue.status = status
    issue.closed_at = datetime.now() if status == models.STATUS_CLOSED else None
    db.commit()
    flash(request, f"상태를 '{models.STATUSES[status]}'(으)로 변경했습니다.")
    return redirect(f"/issues/{issue.id}")


@router.post("/issues/{issue_id}/assignee")
def change_assignee(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    issue_id: int,
    assignee_id: str = Form(""),
):
    issue = _get_issue(db, issue_id)
    issue.assignee_id = int(assignee_id) if assignee_id else None
    db.commit()
    flash(request, "담당자를 변경했습니다.")
    return redirect(f"/issues/{issue.id}")


# --------------------------------------------------------------------------
# 조치사항
# --------------------------------------------------------------------------


@router.post("/issues/{issue_id}/actions")
def add_action(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    issue_id: int,
    content: str = Form(...),
    result: str = Form(models.ACTION_RESOLVED),
    acted_at: str = Form(""),
    close_issue: str = Form(""),
    attachments: list[UploadFile] = File(default=[]),
):
    issue = _get_issue(db, issue_id)
    content = content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="조치내용을 입력하세요.")

    action = models.Action(
        issue_id=issue.id,
        acted_at=parse_dt(acted_at),
        actor_id=user.id,
        content=content,
        result=result if result in models.ACTION_RESULTS else models.ACTION_RESOLVED,
    )
    db.add(action)
    db.flush()

    save_uploads(db, attachments, user=user, action_id=action.id)

    # 상태 자동 반영
    if close_issue:
        issue.status = models.STATUS_CLOSED
        issue.closed_at = datetime.now()
    elif action.result == models.ACTION_RESOLVED:
        issue.status = models.STATUS_ACTION_DONE
    elif issue.status == models.STATUS_RECEIVED:
        issue.status = models.STATUS_IN_PROGRESS

    db.commit()
    flash(request, "조치사항을 등록했습니다." + (" 이슈를 종료했습니다." if close_issue else ""))
    return redirect(f"/issues/{issue.id}#actions")


@router.post("/actions/{action_id}/delete")
def delete_action(request: Request, db: DbSession, user: CurrentUser, action_id: int):
    action = db.get(models.Action, action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="조치사항을 찾을 수 없습니다.")
    if action.actor_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="작성자 또는 관리자만 삭제할 수 있습니다.")

    from app.services.uploads import delete_file

    for att in action.attachments:
        delete_file(att)

    issue_id = action.issue_id
    db.delete(action)
    db.commit()
    flash(request, "조치사항을 삭제했습니다.")
    return redirect(f"/issues/{issue_id}")


# --------------------------------------------------------------------------
# 사이트 → 과제 목록 (폼의 연동 select 용)
# --------------------------------------------------------------------------


@router.get("/api/sites/{site_id}/tasks")
def site_tasks(db: DbSession, user: CurrentUser, site_id: int):
    tasks = db.scalars(
        select(models.Task)
        .where(models.Task.site_id == site_id, models.Task.is_active.is_(True))
        .order_by(models.Task.sort_order, models.Task.name)
    ).all()
    return [{"id": t.id, "name": t.name, "code": t.code} for t in tasks]
