from typing import Any, Mapping

from .db import db
from .logger import logger


async def record_audit_event(
    *,
    actor_id: str | None,
    action: str,
    resource: str,
    resource_id: str | None = None,
    payload: Mapping[str, Any] | None = None,
) -> None:
    try:
        await db.from_("audit_logs").insert({
            "user_id": actor_id,
            "action": action,
            "resource": resource,
            "resource_id": resource_id,
            "method": "SYSTEM",
            "path": "audit-event",
            "payload": dict(payload or {}),
        })
    except Exception as error:
        logger.error(f"Failed to record audit event action={action} resource={resource}: {error}")
