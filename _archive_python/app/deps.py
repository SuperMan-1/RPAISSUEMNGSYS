"""공통 의존성: 로그인 사용자, 권한 체크, 템플릿, 플래시 메시지."""

from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def _fmt_datetime(value: datetime | None, fmt: str = "%Y-%m-%d %H:%M") -> str:
    return value.strftime(fmt) if value else ""


def _fmt_date(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d") if value else ""


def _input_datetime(value: datetime | None) -> str:
    """<input type=datetime-local> 용 값."""
    return value.strftime("%Y-%m-%dT%H:%M") if value else ""


templates.env.filters["dt"] = _fmt_datetime
templates.env.filters["d"] = _fmt_date
templates.env.filters["dtinput"] = _input_datetime
templates.env.globals.update(
    SEVERITIES=models.SEVERITIES,
    STATUSES=models.STATUSES,
    ACTION_RESULTS=models.ACTION_RESULTS,
    CHECK_RESULTS=models.CHECK_RESULTS,
    ROLES=models.ROLES,
)


class LoginRequired(Exception):
    """로그인이 필요할 때. main.py 에서 로그인 화면으로 보낸다."""

    def __init__(self, next_url: str = "/"):
        self.next_url = next_url


def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User | None:
    uid = request.session.get("uid")
    if not uid:
        return None
    user = db.get(models.User, uid)
    if user is None or not user.is_active:
        request.session.clear()
        return None
    return user


def require_user(
    request: Request, user: models.User | None = Depends(get_current_user)
) -> models.User:
    if user is None:
        raise LoginRequired(next_url=str(request.url.path))
    return user


def require_admin(user: models.User = Depends(require_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자만 접근할 수 있습니다.")
    return user


CurrentUser = Annotated[models.User, Depends(require_user)]
AdminUser = Annotated[models.User, Depends(require_admin)]
DbSession = Annotated[Session, Depends(get_db)]


# --------------------------------------------------------------------------
# 플래시 메시지
# --------------------------------------------------------------------------


def flash(request: Request, message: str, category: str = "ok") -> None:
    request.session.setdefault("_flash", []).append({"message": message, "category": category})


def pop_flashes(request: Request) -> list[dict[str, str]]:
    return request.session.pop("_flash", [])


# --------------------------------------------------------------------------
# 템플릿 렌더링 헬퍼
# --------------------------------------------------------------------------


def render(
    request: Request,
    template_name: str,
    context: dict[str, Any] | None = None,
    status_code: int = 200,
):
    ctx: dict[str, Any] = {
        "request": request,
        "app_title": settings.app_title,
        "flashes": pop_flashes(request),
        "now": datetime.now(),
    }
    if context:
        ctx.update(context)
    return templates.TemplateResponse(template_name, ctx, status_code=status_code)


def redirect(url: str) -> RedirectResponse:
    """POST 처리 후 리다이렉트 (303: POST → GET)."""
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)
