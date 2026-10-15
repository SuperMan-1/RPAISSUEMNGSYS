"""DB 모델.

구조
  사이트(Site) ─┬─ 과제(Task) ─┐
                │              ├─ 이슈(Issue) ─┬─ 조치사항(Action)
                │              │               ├─ 태그(Tag)
                │              │               └─ 첨부(Attachment)
                └─ 점검이력(InspectionRun) ─ 점검결과(InspectionResult)

상태/코드값은 DB enum 대신 문자열로 둔다.
(SQLite·PostgreSQL 호환이 쉽고, 나중에 값 추가 시 마이그레이션이 가볍다)
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# --------------------------------------------------------------------------
# 코드값
# --------------------------------------------------------------------------

ROLE_ADMIN = "ADMIN"
ROLE_USER = "USER"
ROLES = {ROLE_ADMIN: "관리자", ROLE_USER: "일반"}

SEVERITY_HIGH = "HIGH"
SEVERITY_MEDIUM = "MEDIUM"
SEVERITY_LOW = "LOW"
SEVERITIES = {SEVERITY_HIGH: "높음", SEVERITY_MEDIUM: "보통", SEVERITY_LOW: "낮음"}

STATUS_RECEIVED = "RECEIVED"
STATUS_IN_PROGRESS = "IN_PROGRESS"
STATUS_ACTION_DONE = "ACTION_DONE"
STATUS_CLOSED = "CLOSED"
STATUS_ON_HOLD = "ON_HOLD"
STATUSES = {
    STATUS_RECEIVED: "접수",
    STATUS_IN_PROGRESS: "처리중",
    STATUS_ACTION_DONE: "조치완료",
    STATUS_CLOSED: "종료",
    STATUS_ON_HOLD: "보류",
}
OPEN_STATUSES = (STATUS_RECEIVED, STATUS_IN_PROGRESS, STATUS_ACTION_DONE, STATUS_ON_HOLD)

ACTION_RESOLVED = "RESOLVED"
ACTION_TEMPORARY = "TEMPORARY"
ACTION_UNRESOLVED = "UNRESOLVED"
ACTION_RESULTS = {
    ACTION_RESOLVED: "해결",
    ACTION_TEMPORARY: "임시조치",
    ACTION_UNRESOLVED: "미해결",
}

CHECK_OK = "OK"
CHECK_NG = "NG"
CHECK_NA = "NA"
CHECK_RESULTS = {CHECK_OK: "정상", CHECK_NG: "이상", CHECK_NA: "해당없음"}

RUN_IN_PROGRESS = "IN_PROGRESS"
RUN_DONE = "DONE"
RUN_STATUSES = {RUN_IN_PROGRESS: "진행중", RUN_DONE: "완료"}


# --------------------------------------------------------------------------
# 사용자
# --------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50))
    role: Mapped[str] = mapped_column(String(20), default=ROLE_USER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def role_label(self) -> str:
        return ROLES.get(self.role, self.role)

    def __str__(self) -> str:
        return self.name


# --------------------------------------------------------------------------
# 마스터 (사이트 / 과제 / 이슈유형)
# --------------------------------------------------------------------------


class Site(Base):
    """사이트 = 고객사/현장."""

    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    tasks: Mapped[list[Task]] = relationship(
        back_populates="site", cascade="all, delete-orphan", order_by="Task.sort_order, Task.name"
    )

    def __str__(self) -> str:
        return self.name


class Task(Base):
    """과제 = 사이트 안에서 돌아가는 개별 RPA 업무."""

    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("site_id", "code", name="uq_task_site_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    site: Mapped[Site] = relationship(back_populates="tasks")

    def __str__(self) -> str:
        return self.name


class IssueType(Base):
    """이슈 유형. 관리 화면에서 추가·수정할 수 있다."""

    __tablename__ = "issue_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    def __str__(self) -> str:
        return self.name


# --------------------------------------------------------------------------
# 태그
# --------------------------------------------------------------------------

issue_tags = Table(
    "issue_tags",
    Base.metadata,
    Column("issue_id", ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True, index=True)

    issues: Mapped[list[Issue]] = relationship(secondary=issue_tags, back_populates="tags")

    def __str__(self) -> str:
        return self.name


# --------------------------------------------------------------------------
# 이슈
# --------------------------------------------------------------------------


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 화면 표시용 번호 (예: 2026-0001)
    no: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), index=True)
    type_id: Mapped[int | None] = mapped_column(ForeignKey("issue_types.id"), index=True)

    title: Mapped[str] = mapped_column(String(200), index=True)
    symptom: Mapped[str] = mapped_column(Text, default="")

    severity: Mapped[str] = mapped_column(String(20), default=SEVERITY_MEDIUM, index=True)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_RECEIVED, index=True)

    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)

    # 점검 중 발견되어 전환된 이슈인 경우
    source_run_id: Mapped[int | None] = mapped_column(ForeignKey("inspection_runs.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    site: Mapped[Site] = relationship()
    task: Mapped[Task | None] = relationship()
    type: Mapped[IssueType | None] = relationship()
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])

    tags: Mapped[list[Tag]] = relationship(
        secondary=issue_tags, back_populates="issues", order_by="Tag.name"
    )
    actions: Mapped[list[Action]] = relationship(
        back_populates="issue",
        cascade="all, delete-orphan",
        order_by="Action.acted_at, Action.id",
    )
    # 이슈에 직접 붙은 첨부만 (조치사항 첨부는 Action.attachments 로 본다)
    attachments: Mapped[list[Attachment]] = relationship(
        primaryjoin=(
            "and_(Issue.id == foreign(Attachment.issue_id), Attachment.action_id.is_(None))"
        ),
        order_by="Attachment.id",
        viewonly=True,
    )

    @property
    def status_label(self) -> str:
        return STATUSES.get(self.status, self.status)

    @property
    def severity_label(self) -> str:
        return SEVERITIES.get(self.severity, self.severity)

    @property
    def is_open(self) -> bool:
        return self.status != STATUS_CLOSED

    @property
    def tag_names(self) -> list[str]:
        return [t.name for t in self.tags]


class Action(Base):
    """조치사항. 한 이슈에 여러 건 쌓인다."""

    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), index=True)

    acted_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(String(20), default=ACTION_RESOLVED)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    issue: Mapped[Issue] = relationship(back_populates="actions")
    actor: Mapped[User] = relationship()
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="action", cascade="all, delete-orphan"
    )

    @property
    def result_label(self) -> str:
        return ACTION_RESULTS.get(self.result, self.result)


class Attachment(Base):
    """첨부파일. 이슈 또는 조치사항 또는 점검이력에 붙는다."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[int | None] = mapped_column(
        ForeignKey("issues.id", ondelete="CASCADE"), index=True
    )
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("inspection_runs.id", ondelete="CASCADE"), index=True
    )

    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(120), unique=True)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)

    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    issue: Mapped[Issue | None] = relationship(foreign_keys=[issue_id], viewonly=True)
    action: Mapped[Action | None] = relationship(back_populates="attachments")
    run: Mapped[InspectionRun | None] = relationship(back_populates="attachments")
    uploaded_by: Mapped[User] = relationship()

    @property
    def is_image(self) -> bool:
        return (self.content_type or "").startswith("image/")

    @property
    def size_label(self) -> str:
        if self.size < 1024:
            return f"{self.size} B"
        if self.size < 1024 * 1024:
            return f"{self.size / 1024:.0f} KB"
        return f"{self.size / 1024 / 1024:.1f} MB"


# --------------------------------------------------------------------------
# 정기점검
# --------------------------------------------------------------------------


class InspectionTemplate(Base):
    """점검 템플릿 = 체크리스트 양식."""

    __tablename__ = "inspection_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255))
    # 특정 사이트 전용 템플릿이면 site_id 지정, 공통이면 NULL
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    site: Mapped[Site | None] = relationship()
    items: Mapped[list[InspectionItem]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="InspectionItem.seq, InspectionItem.id",
    )

    def __str__(self) -> str:
        return self.name


class InspectionItem(Base):
    """체크리스트 항목."""

    __tablename__ = "inspection_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("inspection_templates.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(String(300))
    note: Mapped[str | None] = mapped_column(String(300))

    template: Mapped[InspectionTemplate] = relationship(back_populates="items")


class InspectionRun(Base):
    """점검 실행 이력."""

    __tablename__ = "inspection_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("inspection_templates.id"), index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), index=True)

    inspected_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    inspector_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default=RUN_IN_PROGRESS, index=True)
    note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    template: Mapped[InspectionTemplate] = relationship()
    site: Mapped[Site] = relationship()
    task: Mapped[Task | None] = relationship()
    inspector: Mapped[User] = relationship()
    results: Mapped[list[InspectionResult]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="InspectionResult.id",
    )
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )

    @property
    def status_label(self) -> str:
        return RUN_STATUSES.get(self.status, self.status)

    @property
    def ng_count(self) -> int:
        return sum(1 for r in self.results if r.result == CHECK_NG)


class InspectionResult(Base):
    """점검 항목별 결과."""

    __tablename__ = "inspection_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("inspection_runs.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[int | None] = mapped_column(ForeignKey("inspection_items.id"))
    # 템플릿 항목이 나중에 바뀌어도 당시 점검 내용이 남도록 문구를 복사해 둔다
    content: Mapped[str] = mapped_column(String(300))
    result: Mapped[str] = mapped_column(String(10), default=CHECK_OK)
    comment: Mapped[str | None] = mapped_column(String(500))
    # 이상(NG) 발견 후 이슈로 전환한 경우
    issue_id: Mapped[int | None] = mapped_column(ForeignKey("issues.id"))

    run: Mapped[InspectionRun] = relationship(back_populates="results")
    issue: Mapped[Issue | None] = relationship(foreign_keys=[issue_id])

    @property
    def result_label(self) -> str:
        return CHECK_RESULTS.get(self.result, self.result)
