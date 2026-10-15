"""첨부파일 다운로드 / 삭제."""

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app import models
from app.config import settings
from app.deps import CurrentUser, DbSession, flash, redirect
from app.services.uploads import delete_file

router = APIRouter(prefix="/files", tags=["files"])

INLINE_TYPES = ("image/", "application/pdf", "text/plain")


@router.get("/{attachment_id}")
def download(attachment_id: int, db: DbSession, user: CurrentUser):
    att = db.get(models.Attachment, attachment_id)
    if att is None:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")

    path = settings.upload_dir / att.stored_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="파일이 서버에 없습니다. 삭제되었을 수 있습니다.")

    ctype = att.content_type or "application/octet-stream"
    disposition = "inline" if ctype.startswith(INLINE_TYPES) else "attachment"
    encoded = quote(att.filename)

    return FileResponse(
        path,
        media_type=ctype,
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded}"},
    )


@router.post("/{attachment_id}/delete")
def delete(attachment_id: int, request: Request, db: DbSession, user: CurrentUser):
    att = db.get(models.Attachment, attachment_id)
    if att is None:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")

    if att.uploaded_by_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="올린 사람 또는 관리자만 삭제할 수 있습니다.")

    # 삭제 후 돌아갈 곳
    if att.issue_id:
        back = f"/issues/{att.issue_id}"
    elif att.action_id:
        action = db.get(models.Action, att.action_id)
        back = f"/issues/{action.issue_id}" if action else "/issues"
    elif att.run_id:
        back = f"/inspections/{att.run_id}"
    else:
        back = "/issues"

    delete_file(att)
    db.delete(att)
    db.commit()
    flash(request, "첨부파일을 삭제했습니다.")
    return redirect(back)
