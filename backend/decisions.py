"""Application decision logic — the one place the review status-map lives.

Kept pure and dependency-light so it is easy to unit-test and reuse (future bulk
actions, agent-side flows). The caller owns the DB session and commit.
"""
from __future__ import annotations

from models import Application, AuditEvent

# action -> resulting application status
DECISION_STATUS = {
    "approve": "Approved",
    "reject": "Rejected",
    "request_info": "Pending Agent Response",
}


class GateBlocked(Exception):
    """Raised when a hard-blocking gate condition prevents approval."""
    def __init__(self, blocking: list[str]):
        self.blocking = blocking
        super().__init__("; ".join(blocking))


def evaluate_gate(sections) -> dict:
    """Tiered approval gate over the two-tier review sections.

    HARD-BLOCK: a mandatory section's system check FAILED, or a section was
    rejected by the reviewer. SOFT-WARN: any auto-flag, or a section not yet
    human-approved. Returns {can_approve, blocking[], warnings[]}.
    `sections` is a list of ReviewSection rows (mandatory sections encode the
    required-documents / minimum-referees floor via their own system_status).
    """
    blocking: list[str] = []
    warnings: list[str] = []

    if not sections:
        warnings.append("Application has not been scanned yet")

    for s in sections:
        # The 'documents' section has its own sign-off UI but does not gate
        # approval (document quality is surfaced via advisory insights instead).
        if s.section_key == "documents":
            continue
        if s.mandatory and s.system_status == "fail":
            blocking.append(f"{s.label}: a mandatory automated check failed")
        if s.system_status == "flag":
            warnings.append(f"{s.label}: automated flag needs review")
        if s.admin_status == "rejected":
            blocking.append(f"{s.label}: section was rejected by the reviewer")
        elif s.admin_status != "approved":
            warnings.append(f"{s.label}: awaiting reviewer sign-off")

    return {"can_approve": not blocking, "blocking": blocking, "warnings": warnings}

_ACTION_VERB = {
    "approve": "Approved application",
    "reject": "Rejected application",
    "request_info": "Requested more information",
}


def apply_decision(app: Application, action: str, actor: str,
                   reason: str = "", comment: str = "",
                   items: list[str] | None = None,
                   override_reason: str = "") -> AuditEvent:
    """Mutate the application's status for a decision and build its audit event.

    Returns the AuditEvent (unsaved) — the caller adds it to the session. Raises
    ValueError for an unknown action so the route can turn it into a 400. Gate
    enforcement lives in the route (it holds the review sections/docs/refs).
    """
    if action not in DECISION_STATUS:
        raise ValueError(f"Unknown decision action: {action!r}")

    app.status = DECISION_STATUS[action]

    bits = [reason, comment]
    if items:
        bits.append("Requested: " + ", ".join(items))
    if override_reason:
        bits.append(f"Override: {override_reason}")
    detail = " · ".join(b for b in bits if b) or _ACTION_VERB[action]

    return AuditEvent(
        actor=actor,
        action=_ACTION_VERB[action],
        entity=f"Application {app.id}",
        detail=detail,
    )
