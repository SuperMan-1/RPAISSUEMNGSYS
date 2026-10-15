"""앱 설정.

운영 환경에서는 프로젝트 루트의 .env 파일로 값을 덮어쓴다.
(.env.example 참고)
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_title: str = "RPA 이슈관리"

    # 개발: SQLite 파일 / 운영: postgresql+psycopg://user:pw@host:5432/dbname
    database_url: str = f"sqlite:///{(DATA_DIR / 'issues.db').as_posix()}"

    # 세션 쿠키 서명 키. 운영에서는 반드시 바꾼다.
    secret_key: str = "dev-only-secret-change-me"
    session_max_age: int = 60 * 60 * 12  # 12시간

    upload_dir: Path = BASE_DIR / "uploads"
    max_upload_mb: int = 20

    # 목록 화면 페이지당 건수
    page_size: int = 20


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
