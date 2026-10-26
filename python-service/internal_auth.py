import hmac
import os

from fastapi import Header, HTTPException

DEV_INTERNAL_TOKEN = "dev-docuquery-internal-token"


def resolve_internal_token(env_value: str | None, environment: str | None) -> str:
    environment = (environment or "").strip().lower()
    token = (env_value or "").strip()

    if environment == "production":
        if len(token) < 16:
            raise RuntimeError(
                "PYTHON_INTERNAL_TOKEN must be set to at least 16 characters in production."
            )
        return token

    return token or DEV_INTERNAL_TOKEN


INTERNAL_TOKEN = resolve_internal_token(
    os.getenv("PYTHON_INTERNAL_TOKEN"),
    os.getenv("DOCUQUERY_ENV"),
)


def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    if not x_internal_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not hmac.compare_digest(
        x_internal_token.encode("utf-8"),
        INTERNAL_TOKEN.encode("utf-8"),
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
