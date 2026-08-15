"""Pydantic v2 request/response schemas (kept separate from SQLModel tables)."""
from typing import Literal, Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str = ""


class DecisionRequest(BaseModel):
    action: Literal["approve", "reject", "request_info"]
    reason: str = ""
    comment: str = ""
    items: Optional[list[str]] = None
    # M2.5 gate override: required to approve past soft warnings.
    override: bool = False
    override_reason: str = ""


class ReviewSectionUpdate(BaseModel):
    admin_status: Literal["pending", "approved", "rejected"]
    admin_note: str = ""


class FieldCorrection(BaseModel):
    # An admin's corrected value for one extracted field. The original OCR value
    # is preserved server-side (ExtractedField.ocr_value) for audit.
    value: str


class ReferenceRequest(BaseModel):
    # Trigger a (stubbed) reference request email to a referee. `referee` is the
    # display label captured for the audit trail.
    referee: str = ""


class ReferenceFeedbackInput(BaseModel):
    # Admin-entered written feedback received from a referee.
    feedback: str
    referee: str = ""


class DocumentStatusUpdate(BaseModel):
    # Admin review verdict on an attached supporting document.
    status: Literal["Uploaded", "Verified", "Flagged", "Not required", "Missing page"]


class NewApplication(BaseModel):
    business: str
    contact: str = ""
    email: str = ""
    phone: str = ""
    country: str = ""


class InviteRequest(BaseModel):
    channels: list[str] = []


class PrismsRegisterRequest(BaseModel):
    # Mock PRISMS: the agent business name to register under a provider.
    business: str


class AgentRating(BaseModel):
    # Partner rating on a 1..5 scale plus an optional qualitative note. Validated
    # server-side; recorded on the audit trail.
    rating: float
    note: str = ""


class AgentTerminate(BaseModel):
    # Reason is mandatory — a termination without a recorded justification is not
    # auditable. Trimmed/validated server-side.
    reason: str


class LoginResponse(BaseModel):
    ok: bool
    token: str
    email: str
    name: str
    role: str  # admin | agent
    initials: str
