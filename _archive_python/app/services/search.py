"""유사 이슈 검색.

외부 검색엔진 없이 DB만으로 동작한다.
  1) 입력된 제목·증상에서 검색어(토큰)를 뽑는다
  2) 토큰이 하나라도 들어간 이슈를 후보로 가져온다 (LIKE, 최근 것 우선)
  3) 파이썬에서 가중치로 점수를 매겨 정렬한다

가중치
  제목에 토큰 포함       3점
  증상에 토큰 포함       1점
  같은 이슈유형          2점
  태그 일치             2점 / 건
  다른 사이트의 이슈     1점  (타 사이트 사례를 찾는 것이 목적이므로 살짝 우대)
  조치사항이 있음        2점  (참고할 내용이 실제로 있는 이슈)
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import models

# 검색에서 제외할 흔한 말
STOPWORDS = {
    "오류", "에러", "발생", "문제", "현상", "관련", "확인", "요청", "안됨", "안됩니다",
    "되지", "않음", "않습니다", "대한", "경우", "이슈", "증상", "내용", "바랍니다",
    "the", "and", "for", "with", "error", "issue",
}

_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣_]+")
MAX_CANDIDATES = 400


@dataclass
class SimilarHit:
    issue: models.Issue
    score: int
    last_action: models.Action | None

    @property
    def matched_note(self) -> str:
        return f"유사도 {self.score}"


def tokenize(*texts: str | None) -> list[str]:
    """검색어 추출. 2글자 이상, 중복/불용어 제거, 최대 12개."""
    seen: list[str] = []
    for text in texts:
        if not text:
            continue
        for raw in _TOKEN_RE.findall(text):
            token = raw.lower()
            if len(token) < 2:
                continue
            if token in STOPWORDS:
                continue
            if token not in seen:
                seen.append(token)
    return seen[:12]


def find_similar(
    db: Session,
    *,
    title: str = "",
    symptom: str = "",
    tags: list[str] | None = None,
    type_id: int | None = None,
    exclude_issue_id: int | None = None,
    site_id: int | None = None,
    limit: int = 8,
) -> list[SimilarHit]:
    """비슷한 이슈를 점수순으로 돌려준다.

    site_id 를 주면 '그 사이트가 아닌 이슈'를 우대한다 (제외하지는 않는다).
    """
    tags = [t for t in (tags or []) if t]
    tokens = tokenize(title, symptom, " ".join(tags))
    if not tokens and type_id is None and not tags:
        return []

    stmt = (
        select(models.Issue)
        .options(
            selectinload(models.Issue.site),
            selectinload(models.Issue.task),
            selectinload(models.Issue.type),
            selectinload(models.Issue.tags),
            selectinload(models.Issue.actions).selectinload(models.Action.actor),
        )
        .order_by(models.Issue.occurred_at.desc())
        .limit(MAX_CANDIDATES)
    )

    conditions = []
    for token in tokens:
        pattern = f"%{token}%"
        conditions.append(func.lower(models.Issue.title).like(pattern))
        conditions.append(func.lower(models.Issue.symptom).like(pattern))
    if type_id:
        conditions.append(models.Issue.type_id == type_id)
    if tags:
        conditions.append(
            models.Issue.tags.any(func.lower(models.Tag.name).in_([t.lower() for t in tags]))
        )

    if not conditions:
        return []
    stmt = stmt.where(or_(*conditions))
    if exclude_issue_id:
        stmt = stmt.where(models.Issue.id != exclude_issue_id)

    candidates = db.scalars(stmt).unique().all()

    tag_set = {t.lower() for t in tags}
    hits: list[SimilarHit] = []

    for issue in candidates:
        title_l = (issue.title or "").lower()
        symptom_l = (issue.symptom or "").lower()
        score = 0

        for token in tokens:
            if token in title_l:
                score += 3
            if token in symptom_l:
                score += 1

        if type_id and issue.type_id == type_id:
            score += 2

        if tag_set:
            score += 2 * len(tag_set & {t.name.lower() for t in issue.tags})

        if score <= 0:
            continue

        if site_id and issue.site_id != site_id:
            score += 1

        resolved_actions = [a for a in issue.actions if a.result != models.ACTION_UNRESOLVED]
        if resolved_actions:
            score += 2

        last_action = resolved_actions[-1] if resolved_actions else (
            issue.actions[-1] if issue.actions else None
        )
        hits.append(SimilarHit(issue=issue, score=score, last_action=last_action))

    hits.sort(key=lambda h: (-h.score, -(h.issue.occurred_at.timestamp())))
    return hits[:limit]
