"""이슈 번호 채번, 태그 처리."""

from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models

_TAG_SPLIT = re.compile(r"[,\n;]+")


def next_issue_no(db: Session, when: datetime | None = None) -> str:
    """연도별 일련번호. 예: 2026-0001"""
    year = (when or datetime.now()).year
    prefix = f"{year}-"
    last = db.scalar(
        select(func.max(models.Issue.no)).where(models.Issue.no.like(f"{prefix}%"))
    )
    seq = 1
    if last:
        try:
            seq = int(last.split("-", 1)[1]) + 1
        except (IndexError, ValueError):
            seq = db.scalar(
                select(func.count(models.Issue.id)).where(models.Issue.no.like(f"{prefix}%"))
            ) + 1
    return f"{prefix}{seq:04d}"


def parse_tags(raw: str | None) -> list[str]:
    """'로그인, 인증서 #타임아웃' → ['로그인', '인증서', '타임아웃']"""
    if not raw:
        return []
    out: list[str] = []
    for chunk in _TAG_SPLIT.split(raw):
        for piece in chunk.split():
            name = piece.strip().lstrip("#").strip()
            if name and name not in out:
                out.append(name[:40])
    return out[:12]


def sync_tags(db: Session, issue: models.Issue, names: list[str]) -> None:
    """이슈의 태그를 주어진 목록과 일치시킨다. 없는 태그는 새로 만든다."""
    wanted = {n.strip() for n in names if n.strip()}
    existing = {t.name: t for t in issue.tags}

    for name in list(existing):
        if name not in wanted:
            issue.tags.remove(existing[name])

    for name in wanted:
        if name in existing:
            continue
        tag = db.scalar(select(models.Tag).where(models.Tag.name == name))
        if tag is None:
            tag = models.Tag(name=name)
            db.add(tag)
            db.flush()
        issue.tags.append(tag)


def parse_dt(raw: str | None, default: datetime | None = None) -> datetime:
    """<input type=datetime-local> 값 파싱."""
    if raw:
        for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(raw, fmt)
            except ValueError:
                continue
    return default or datetime.now()
