"""AMP domain model (M1 draft).

Tables mirror the sample records embedded in the designer's prototype
(claude-design/Agent Management Portal.dc.html) so the front end and API speak
the same shape and we avoid the frontend/CLAUDE.md "Scheme Mismatch" stop
condition. Business logic (state transitions, validation) is added in M2+.
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Column
from sqlalchemy import JSON as SA_JSON
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    name: str
    role: str = "admin"  # admin | agent
    title: str = ""
    initials: str = ""
    # M3: agent users link to their Agent row so the portal can show their own
    # record (dashboard/profile). Null for admins.
    agent_id: Optional[int] = Field(default=None, foreign_key="agent.id")


class Agent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    initials: str = ""
    avatar_bg: str = "#ffcd00"
    country: str = ""
    flag: str = ""
    status: str = "Active"  # Active | Expiring Soon | Suspended | Terminated
    since: str = ""
    enrol: int = 0
    conv: str = ""  # conversion %, e.g. "71%"
    comp: str = ""  # compliance score %, e.g. "96%"


class Application(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    business: str
    contact: str = ""
    email: str = ""
    phone: str = ""
    country: str = ""
    flag: str = ""
    date: str = ""
    age: str = ""
    # New | In Review | Pending Documents | Pending Agent Response
    # | Approved | Rejected | Agreement Signed
    status: str = "New"
    # Read-only descriptive detail shown on the review screen:
    # {"biz_fields": [...], "activity": [...]}.
    # Seeded rich for the showcase app (2087); null otherwise (synthesized at
    # read time from the row — see main.get_application).
    detail: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(SA_JSON))
    # M2.5: the applicant's submitted form content, by section
    # {"company": {...}, "directors": [...], "declarations": {...},
    #  "references_declared": [...]}. Seeded random-but-plausible for 2087; null
    # otherwise (section UI shows "awaiting submission").
    form_data: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(SA_JSON))
    # When the last document scan ran (dedicated "last scan" signal — distinct
    # from ReviewSection.updated_at, which also moves on human sign-off).
    scanned_at: Optional[datetime] = None
    # M2.6: which local document (in app-forms/) this application was submitted as.
    source_pdf: Optional[str] = None
    # M2.6: advisory AI insights (list) + which engine produced them.
    insights: Optional[list[dict[str, Any]]] = Field(default=None, sa_column=Column(SA_JSON))
    insights_source: str = ""  # LLM model id (any OpenAI-compatible) | "rules" | ""


class Document(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id")
    name: str
    doc_type: str = ""  # Business registration | Education-agent training | Identity | MARA/MARN | Insurance | Licence | Reference | Other
    status: str = "Uploaded"  # Uploaded | Verified | Not required | Missing page
    size: str = ""  # e.g. "340 KB"
    body: Optional[str] = None  # in-viewer text of the (seeded) document
    # M3: stored filename in the document store for applicant-uploaded
    # attachments (doc-<appid>-<n>.<ext>); null for seeded text-only documents.
    file: Optional[str] = None


class Reference(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id")
    name: str
    role: str = ""
    email: str = ""
    # Not sent | Awaiting response | Received | Passed | Failed
    status: str = "Not sent"
    org: str = ""
    sent: str = ""
    received: str = ""
    rating: str = ""  # ethics rating, e.g. "5 / 5"
    quality: str = ""  # application quality, e.g. "4 / 5"
    note: str = ""


class Agreement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id")
    agent_id: Optional[int] = Field(default=None, foreign_key="agent.id")
    status: str = "Draft"  # Draft | Sent | Signed
    sent_date: Optional[str] = None
    signed_date: Optional[str] = None
    # M3+ agreement lifecycle: the admin uploads the agent's signed copy (returned
    # by email), then verifies the signature before portal access is granted.
    signed_file: Optional[str] = None       # stored filename of the uploaded signed PDF
    signature_verified: bool = False


class GovRegistration(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: Optional[int] = Field(default=None, foreign_key="agent.id")
    portal: str = ""  # PRISMS | ASQAnet | TEQSA
    status: str = "Pending"  # Pending | Submitted | Registered
    reference_no: str = ""


class Invoice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: Optional[int] = Field(default=None, foreign_key="agent.id")
    period: str = ""
    amount: float = 0.0
    status: str = "Draft"  # Draft | Issued | Paid


class MarketingAsset(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    category: str = ""  # Brochure | Fee schedule | Handbook | Course guide
    version: str = "v1.0"
    updated: str = ""


class AuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    actor: str = ""
    action: str = ""
    entity: str = ""  # e.g. "Application 2087"
    detail: str = ""
    at: datetime = Field(default_factory=datetime.utcnow)


class ExtractedField(SQLModel, table=True):
    """M2.6: one normalized field extracted from the application document.

    Retains the original OCR/extracted value (`ocr_value`) for auditability even
    after an admin corrects the current `value`.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id")
    key: str = ""
    group: str = ""
    label: str = ""
    value: str = ""
    ocr_value: str = ""       # original extracted value, never overwritten
    confidence: float = 0.0   # 0..1
    page: int = 0
    source_engine: str = ""   # pypdf | easyocr | ...
    corrected: bool = False
    corrected_by: str = ""
    corrected_at: Optional[datetime] = None
    validation: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(SA_JSON))


class ReferenceFeedback(SQLModel, table=True):
    """M2.6 Step B: the reference/referee response for one extracted referee.

    Keyed by the extracted field it belongs to (ref_key ∈ {ref1, ref2, ref3}) so
    it lines up with what the review's References tab shows. The referee's written
    feedback is captured here — either entered manually by the admin (email/phone
    reply transcribed) or, later, received through a referee portal. Requesting a
    reference is stubbed (audit entry only) until real email lands in M6.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id")
    ref_key: str = ""                 # ref1 | ref2 | ref3
    referee: str = ""                 # display label captured at request/entry time
    status: str = "pending"           # pending | requested | received
    feedback: str = ""                # the referee's written feedback (free text)
    requested_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    updated_by: str = ""


class ReviewSection(SQLModel, table=True):
    """M2.5 two-tier review unit: one row per (application, section).

    The scan sets the *system* fields (assist); a human sets the *admin* fields
    (decide). The approval gate reads both. section_key ∈
    {company, compliance, documents, references}.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id")
    section_key: str = ""
    label: str = ""
    mandatory: bool = True
    # system tier (set by the scan)
    system_status: str = "pending"  # pending | pass | flag | fail | na
    system_note: str = ""
    signals: Optional[list[dict[str, Any]]] = Field(default=None, sa_column=Column(SA_JSON))
    # human tier (set by the admin)
    admin_status: str = "pending"  # pending | approved | rejected
    admin_note: str = ""
    updated_by: str = ""
    updated_at: Optional[datetime] = None
