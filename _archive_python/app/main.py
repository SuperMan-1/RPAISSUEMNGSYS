"""앱 진입점."""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import __version__
from app.config import settings
from app.deps import LoginRequired, render
from app.routers import admin, auth, dashboard, files, inspections, issues

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title=settings.app_title, version=__version__, docs_url=None, redoc_url=None)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    max_age=settings.session_max_age,
    same_site="lax",
    session_cookie="rpa_issue_session",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(issues.router)
app.include_router(inspections.router)
app.include_router(files.router)
app.include_router(admin.router)


@app.exception_handler(LoginRequired)
async def _login_required(request: Request, exc: LoginRequired):
    nxt = exc.next_url or "/"
    return RedirectResponse(f"/login?next={nxt}", status_code=303)


@app.exception_handler(HTTPException)
async def _http_error(request: Request, exc: HTTPException):
    if exc.status_code == 401:
        return RedirectResponse("/login", status_code=303)
    user = None
    try:
        from app.db import SessionLocal
        from app.models import User

        uid = request.session.get("uid")
        if uid:
            with SessionLocal() as db:
                user = db.get(User, uid)
    except Exception:  # pragma: no cover - 오류 화면에서 또 터지지 않게
        user = None
    return render(
        request,
        "error.html",
        {"user": user, "code": exc.status_code, "message": exc.detail},
        status_code=exc.status_code,
    )
