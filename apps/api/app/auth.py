from typing import Annotated
import hashlib

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ApiKey, User


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def find_user_by_api_key(db: Session, api_key: str) -> User | None:
    key_hash = hash_api_key(api_key)
    api_key_row = db.scalar(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.active.is_(True))
    )
    if not api_key_row:
        return None
    return db.get(User, api_key_row.user_id)


def parse_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def get_current_user(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> User:
    api_key = x_api_key or parse_bearer_token(authorization)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Use the X-API-Key header.",
        )

    user = find_user_by_api_key(db, api_key)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )
    return user
