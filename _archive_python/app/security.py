"""비밀번호 해시."""

import bcrypt

_MAX_BYTES = 72  # bcrypt 입력 제한


def hash_password(raw: str) -> str:
    data = raw.encode("utf-8")[:_MAX_BYTES]
    return bcrypt.hashpw(data, bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(raw.encode("utf-8")[:_MAX_BYTES], hashed.encode("utf-8"))
    except ValueError:
        return False
