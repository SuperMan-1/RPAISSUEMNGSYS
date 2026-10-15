"""로그인 / 로그아웃 / 비밀번호 변경."""

from fastapi import APIRouter, Form, Request
from sqlalchemy import select

from app import models
from app.deps import CurrentUser, DbSession, flash, redirect, render
from app.security import hash_password, verify_password

router = APIRouter()


def _safe_next(raw: str | None) -> str:
    """외부 사이트로 튕기지 않도록 내부 경로만 허용."""
    if raw and raw.startswith("/") and not raw.startswith("//"):
        return raw
    return "/"


@router.get("/login")
def login_form(request: Request, next: str = "/"):
    if request.session.get("uid"):
        return redirect("/")
    return render(request, "login.html", {"user": None, "next": _safe_next(next)})


@router.post("/login")
def login(
    request: Request,
    db: DbSession,
    username: str = Form(...),
    password: str = Form(...),
    next: str = Form("/"),
):
    user = db.scalar(select(models.User).where(models.User.username == username.strip()))
    if user is None or not verify_password(password, user.password_hash):
        return render(
            request,
            "login.html",
            {
                "user": None,
                "next": _safe_next(next),
                "error": "아이디 또는 비밀번호가 올바르지 않습니다.",
                "username": username,
            },
            status_code=401,
        )
    if not user.is_active:
        return render(
            request,
            "login.html",
            {
                "user": None,
                "next": _safe_next(next),
                "error": "사용이 중지된 계정입니다. 관리자에게 문의하세요.",
                "username": username,
            },
            status_code=403,
        )

    request.session.clear()
    request.session["uid"] = user.id
    flash(request, f"{user.name}님, 환영합니다.")
    return redirect(_safe_next(next))


@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return redirect("/login")


@router.get("/change-password")
def change_password_form(request: Request, user: CurrentUser):
    return render(request, "change_password.html", {"user": user, "nav": ""})


@router.post("/change-password")
def change_password(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    current_password: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...),
):
    error = None
    if not verify_password(current_password, user.password_hash):
        error = "현재 비밀번호가 올바르지 않습니다."
    elif len(new_password) < 6:
        error = "새 비밀번호는 6자 이상이어야 합니다."
    elif new_password != confirm_password:
        error = "새 비밀번호가 서로 다릅니다."

    if error:
        return render(
            request, "change_password.html", {"user": user, "nav": "", "error": error}, status_code=400
        )

    user.password_hash = hash_password(new_password)
    db.add(user)
    db.commit()
    flash(request, "비밀번호를 변경했습니다.")
    return redirect("/")
