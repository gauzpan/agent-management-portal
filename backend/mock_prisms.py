"""MOCK of the external PRISMS system (Provider Registration and International
Student Management System).

In production, Corridor would poll the real PRISMS provider API over HTTPS to
learn which agents the college has registered. Here we stand that system in with
a local table (`PrismsRecord`) plus two operations:

- `get_provider_agents(...)` — the "Get the agent status for the provider"
  endpoint the poller calls periodically.
- `register_agent(...)` — represents the admin completing the agent's
  registration inside the PRISMS portal (assigns a PRISMS Agent ID). In the demo
  this is triggerable so the compliance flip can be observed.

Nothing here reaches the internet; it is deliberately a fake data plane.
"""
from __future__ import annotations

import random
import string

from sqlmodel import Session, select

from models import PrismsRecord


def _new_agent_id() -> str:
    """A plausible PRISMS Agent ID, e.g. 'PRN-7F3K9Q'."""
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"PRN-{suffix}"


def _norm(name: str) -> str:
    return (name or "").strip().casefold()


def get_provider_agents(session: Session, provider: str) -> list[dict]:
    """The mocked 'Get agent status for the provider' call — returns every agent
    currently registered in PRISMS under this provider."""
    rows = session.exec(
        select(PrismsRecord).where(PrismsRecord.provider == provider)
    ).all()
    return [
        {
            "prisms_agent_id": r.prisms_agent_id,
            "business": r.business,
            "status": r.status,
            "registered_at": r.registered_at.isoformat(),
        }
        for r in rows
    ]


def register_agent(session: Session, provider: str, business: str) -> PrismsRecord:
    """Register an agent in the mock PRISMS database (idempotent by provider +
    business). Returns the record, assigning a PRISMS Agent ID on first insert."""
    existing = session.exec(
        select(PrismsRecord).where(PrismsRecord.provider == provider)
    ).all()
    match = next((r for r in existing if _norm(r.business) == _norm(business)), None)
    if match is not None:
        return match

    record = PrismsRecord(
        provider=provider, business=business,
        prisms_agent_id=_new_agent_id(), status="Registered",
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def find_agent_id(session: Session, provider: str, business: str) -> str | None:
    """Look up a registered agent's PRISMS Agent ID by business name, or None."""
    for a in get_provider_agents(session, provider):
        if _norm(a["business"]) == _norm(business):
            return a["prisms_agent_id"]
    return None
