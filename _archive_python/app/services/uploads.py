"""첨부파일 저장."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.config import settings

CHUNK = 1024 * 1024

# 실행 가능한 형식은 받지 않는다
BLOCKED_EXT = {
    ".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".ps1", ".vbs", ".js", ".jar", ".sh",
}


def _safe_ext(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if len(ext) > 10 or any(c in ext for c in "/\\"):
        return ""
    return ext


def save_uploads(
    db: Session,
    files: list[UploadFile] | None,
    *,
    user: models.User,
    issue_id: int | None = None,
    action_id: int | None = None,
    run_id: int | None = None,
) -> list[models.Attachment]:
    """업로드된 파일들을 저장하고 Attachment 를 만든다 (commit 은 호출한 쪽에서)."""
    saved: list[models.Attachment] = []
    if not files:
        return saved

    max_bytes = settings.max_upload_mb * 1024 * 1024
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    for up in files:
        if not up or not up.filename:
            continue

        ext = _safe_ext(up.filename)
        if ext in BLOCKED_EXT:
            raise HTTPException(status_code=400, detail=f"첨부할 수 없는 형식입니다: {up.filename}")

        stored_name = f"{uuid.uuid4().hex}{ext}"
        dest = settings.upload_dir / stored_name

        size = 0
        try:
            with dest.open("wb") as out:
                while True:
                    chunk = up.file.read(CHUNK)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > max_bytes:
                        out.close()
                        dest.unlink(missing_ok=True)
                        raise HTTPException(
                            status_code=400,
                            detail=f"파일이 너무 큽니다 (최대 {settings.max_upload_mb}MB): {up.filename}",
                        )
                    out.write(chunk)
        finally:
            up.file.close()

        if size == 0:
            dest.unlink(missing_ok=True)
            continue

        att = models.Attachment(
            issue_id=issue_id,
            action_id=action_id,
            run_id=run_id,
            filename=Path(up.filename).name[:255],
            stored_name=stored_name,
            content_type=up.content_type or "application/octet-stream",
            size=size,
            uploaded_by_id=user.id,
        )
        db.add(att)
        saved.append(att)

    return saved


def delete_file(att: models.Attachment) -> None:
    (settings.upload_dir / att.stored_name).unlink(missing_ok=True)
