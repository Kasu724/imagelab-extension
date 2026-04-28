from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import UsageEvent, User
from app.schemas import UsageResponse


PLAN_LIMITS = {
    "free": 0,
    "pro": 300,
    "creator": 1500,
}


def current_period(now: datetime | None = None) -> str:
    timestamp = now or datetime.utcnow()
    return timestamp.strftime("%Y-%m")


def monthly_limit_for_user(user: User) -> int | None:
    if user.plan == "team":
        return user.team_monthly_limit
    return PLAN_LIMITS.get(user.plan, 0)


def usage_used(db: Session, user: User, period: str | None = None) -> int:
    active_period = period or current_period()
    total = db.scalar(
        select(func.coalesce(func.sum(UsageEvent.quantity), 0)).where(
            UsageEvent.user_id == user.id,
            UsageEvent.event_type == "cloud_search",
            UsageEvent.period == active_period,
        )
    )
    return int(total or 0)


def usage_snapshot(db: Session, user: User) -> UsageResponse:
    period = current_period()
    limit = monthly_limit_for_user(user)
    used = usage_used(db, user, period)
    remaining = None if limit is None else max(limit - used, 0)
    return UsageResponse(
        plan=user.plan,
        used=used,
        limit=limit,
        remaining=remaining,
        period=period,
    )


def record_cloud_usage(db: Session, user: User, quantity: int = 1) -> UsageResponse:
    period = current_period()
    limit = monthly_limit_for_user(user)
    used = usage_used(db, user, period)
    if limit is not None and used + quantity > limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cloud search limit reached for this billing period.",
        )

    db.add(
        UsageEvent(
            user_id=user.id,
            event_type="cloud_search",
            quantity=quantity,
            period=period,
        )
    )
    db.flush()
    return usage_snapshot(db, user)
