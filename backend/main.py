"""AMP backend entrypoint — FastAPI app factory.

M1: health, /seed, stub login, read-only list endpoints.
M2: application detail + the admin onboarding loop (decision → agreement → invite),
    all persisted with a tamper-evident AuditEvent per action.
"""
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlmodel import Session, select

import formscan
import mock_prisms
import storage
from db import engine, get_session, init_db
from decisions import apply_decision, evaluate_gate
from models import (
    Agent,
    Agreement,
    Application,
    AuditEvent,
    Document,
    ExtractedField,
    GovRegistration,
    MarketingAsset,
    PrismsCompliance,
    PrismsRecord,
    Reference,
    ReferenceFeedback,
    ReviewSection,
    User,
)
from normalize import SPECS as _NORM_SPECS

_MANDATORY_KEYS = {s[0] for s in _NORM_SPECS if s[3]}
# key -> (group, label, mandatory) for reconstructing a field on correction.
_SPEC_BY_KEY = {s[0]: (s[1], s[2], s[3]) for s in _NORM_SPECS}
import insights as insights_engine
from schemas import (
    AgentRating,
    AgentTerminate,
    PrismsRegisterRequest,
    DecisionRequest,
    DocumentStatusUpdate,
    FieldCorrection,
    InviteRequest,
    LoginRequest,
    LoginResponse,
    NewApplication,
    ReferenceFeedbackInput,
    ReferenceRequest,
    ReviewSectionUpdate,
)
from seed import seed_all, AUTO_SCAN_APP_IDS

app = FastAPI(title="Corridor — Agent Management Portal API", version="0.1.0")

# Frontend is served statically from :8080 in dev; keep CORS explicit. In
# production the deployed frontend origin comes from FRONTEND_ORIGIN (set on the
# Render service) so we never wildcard the allow-list.
_cors_origins = ["http://127.0.0.1:8080", "http://localhost:8080"]
_frontend_origin = os.environ.get("FRONTEND_ORIGIN")
if _frontend_origin:
    _cors_origins.append(_frontend_origin.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _start_compliance_poller() -> None:
    """Background daemon that periodically polls the (mock) PRISMS system and
    reconciles compliance trackers. Interval via PRISMS_POLL_INTERVAL seconds
    (default 30); set to 0 to disable (e.g. in tests)."""
    interval = int(os.environ.get("PRISMS_POLL_INTERVAL", "30"))
    if interval <= 0:
        return
    import threading
    import time

    def loop() -> None:
        while True:
            time.sleep(interval)
            try:
                with Session(engine) as s:
                    reconcile_prisms_compliance(s)
            except Exception:
                pass  # a transient poll failure must never take the server down

    threading.Thread(target=loop, daemon=True, name="prisms-poller").start()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    formscan.ensure_store()
    _start_compliance_poller()


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": "amp-backend", "version": "0.1.0"}


def _scan_seed_applications(session: Session) -> list[int]:
    """Pre-run the real extraction pipeline on the designated demo applications so
    their review opens with fields already populated — no manual "Run scan".

    A failed pre-scan must never break seeding; on error we roll back that app and
    move on (the user can still Run scan manually).
    """
    scanned = []
    for app_id in AUTO_SCAN_APP_IDS:
        app = session.get(Application, app_id)
        if app is None or not formscan.resolve_pdf(app.source_pdf):
            continue
        try:
            _scan_real(app, session)
            scanned.append(app_id)
        except Exception:
            session.rollback()
    return scanned


@app.post("/seed", tags=["system"])
def seed(session: Session = Depends(get_session)) -> dict:
    """Reset the DB to the design's sample records. Dev-only convenience.

    Also pre-scans the showcase application(s) so their fields are populated on
    first open (see `_scan_seed_applications`).
    """
    result = seed_all(session)
    result["scanned"] = _scan_seed_applications(session)
    return {"seeded": result}


@app.post("/auth/login", response_model=LoginResponse, tags=["auth"])
def login(body: LoginRequest, session: Session = Depends(get_session)) -> LoginResponse:
    """Stub login (M1): match a seeded user by email, ignore password.

    Real Supabase Auth / OIDC replaces this in M6. The token is a placeholder
    the frontend stores as a Bearer credential.
    """
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None:
        # Fall back to admin so the demo is never blocked; still echo the email.
        return LoginResponse(
            ok=True, token=f"stub-{body.email}", email=body.email,
            name="College Admin", role="admin", initials="CA",
        )
    return LoginResponse(
        ok=True, token=f"stub-{user.email}", email=user.email,
        name=user.name, role=user.role, initials=user.initials,
    )


def current_user(
    authorization: str = Header(default=""),
    session: Session = Depends(get_session),
) -> User:
    """Resolve the current user from the stub Bearer token (`stub-<email>`).

    Real JWT/OIDC replaces this in M6; the token format is the M1 stub. Raises
    401 when the header is missing or the user is unknown.
    """
    token = authorization.replace("Bearer ", "", 1).strip() if authorization else ""
    email = token[len("stub-"):] if token.startswith("stub-") else ""
    user = session.exec(select(User).where(User.email == email)).first() if email else None
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@app.get("/agent/me", tags=["agent"])
def agent_me(
    user: User = Depends(current_user), session: Session = Depends(get_session)
) -> dict:
    """The logged-in agent's own Agent record + headline stats (M3 portal)."""
    if user.role != "agent" or user.agent_id is None:
        raise HTTPException(status_code=403, detail="No agent profile for this user")
    agent = session.get(Agent, user.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent record not found")
    return {
        "agent": agent,
        "user": {"name": user.name, "email": user.email, "initials": user.initials},
        "stats": {
            "enrolments": agent.enrol, "conversion": agent.conv,
            "compliance": agent.comp, "status": agent.status, "since": agent.since,
        },
    }


@app.get("/applications", tags=["applications"])
def list_applications(
    include_active: bool = False, session: Session = Depends(get_session)
) -> list[Application]:
    """List applications in the onboarding pipeline.

    Once an application is onboarded end-to-end (approved → agreement signed →
    invited), its status becomes 'Active' and a matching Agent is created. At that
    point it has graduated to the Agents directory, so it's excluded here by
    default — pass include_active=true to include onboarded applications too.
    """
    stmt = select(Application)
    if not include_active:
        stmt = stmt.where(Application.status != "Active")
    apps = session.exec(stmt).all()
    # Most recently submitted first. `date` is a display string (e.g. "10 Aug
    # 2026"); parse it to sort, falling back to id (roughly chronological) both as
    # the same-day tiebreaker and when a date can't be parsed.
    apps.sort(key=lambda a: (_parse_submitted(a.date), a.id or 0), reverse=True)
    return apps


def _parse_submitted(date_str: str) -> datetime:
    """Parse an application's display submission date to a datetime for sorting.
    Unparseable/empty dates sort oldest (datetime.min)."""
    try:
        return datetime.strptime((date_str or "").strip(), "%d %b %Y")
    except ValueError:
        return datetime.min


_COUNTRY_FLAGS = {
    "india": "🇮🇳", "vietnam": "🇻🇳", "nepal": "🇳🇵", "china": "🇨🇳",
    "pakistan": "🇵🇰", "bangladesh": "🇧🇩", "sri lanka": "🇱🇰", "philippines": "🇵🇭",
    "ghana": "🇬🇭", "kenya": "🇰🇪", "brazil": "🇧🇷", "colombia": "🇨🇴",
    "portugal": "🇵🇹", "uae": "🇦🇪", "united arab emirates": "🇦🇪",
}


@app.post("/applications", status_code=201, tags=["applications"])
def create_application(
    body: NewApplication, session: Session = Depends(get_session)
) -> Application:
    """Upload a new application (offline/manual intake) straight into review.

    Populates the table columns from the basic details and seeds the review's
    Company section from them so the raw fields render before any scan runs.
    """
    now = datetime.utcnow()
    flag = _COUNTRY_FLAGS.get(body.country.strip().lower(), "🌐")
    app = Application(
        business=body.business, contact=body.contact, email=body.email,
        phone=body.phone, country=body.country, flag=flag,
        date=f"{now.day} {now:%b %Y}", age="just now",
        status="In Review",
        # Minimal submitted content so the review shows raw (unchecked) fields.
        form_data={
            "company": {
                "company_name": body.business,
                "primary_contact": body.contact,
                "email": body.email,
                "phone": body.phone,
                "country": body.country,
            },
            "directors": [], "declarations": {}, "references_declared": [],
        },
    )
    session.add(app)
    session.commit()
    session.refresh(app)
    session.add(AuditEvent(
        actor=ACTOR, action="Application uploaded",
        entity=f"Application {app.id}",
        detail=f"{body.business} uploaded and placed in review",
    ))
    session.commit()
    session.refresh(app)
    return app


@app.post("/applications/upload", status_code=201, tags=["applications"])
def upload_application(
    file: UploadFile = File(...),
    business: str = Form(""),
    contact: str = Form(""),
    email: str = Form(""),
    phone: str = Form(""),
    country: str = Form(""),
    session: Session = Depends(get_session),
) -> dict:
    """Create an application from an uploaded application-form PDF.

    Stores the file in the document store, links it as the application's
    source_pdf, and runs the real extraction pipeline immediately so the review
    opens populated. The company name defaults to the file name until the scan
    extracts the real one.
    """
    name = file.filename or "application.pdf"
    data = file.file.read()
    is_pdf = name.lower().endswith(".pdf") or file.content_type == "application/pdf"
    if not is_pdf or not data[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB).")

    now = datetime.utcnow()
    biz = business.strip() or Path(name).stem.replace("_", " ").strip() or "Uploaded application"
    flag = _COUNTRY_FLAGS.get(country.strip().lower(), "🌐")
    app = Application(
        business=biz, contact=contact, email=email, phone=phone,
        country=country, flag=flag,
        date=f"{now.day} {now:%b %Y}", age="just now", status="In Review",
    )
    session.add(app)
    session.commit()
    session.refresh(app)

    stored = f"upload-{app.id}.pdf"
    storage.save(stored, data, "application/pdf")
    app.source_pdf = stored
    session.add(app)
    session.add(AuditEvent(
        actor=ACTOR, action="Application uploaded",
        entity=f"Application {app.id}", detail=f"{biz} uploaded from {name}",
    ))
    session.commit()
    session.refresh(app)

    # Run the real pipeline now; if it fails, the app still exists to scan later.
    scanned = False
    try:
        _scan_real(app, session)
        scanned = True
        # Backfill the display name/contact from the extracted PDF when the admin
        # didn't type them, so the list shows the real company, not the file name.
        if not business.strip():
            cn = session.exec(select(ExtractedField).where(
                ExtractedField.application_id == app.id,
                ExtractedField.key == "company_name")).first()
            if cn and cn.value.strip():
                app.business = cn.value.strip()
        if not contact.strip():
            d1 = session.exec(select(ExtractedField).where(
                ExtractedField.application_id == app.id,
                ExtractedField.key == "director1")).first()
            if d1 and d1.value.strip():
                app.contact = d1.value.split("·")[0].strip()[:80]
        session.add(app)
        session.commit()
        session.refresh(app)
    except Exception:
        session.rollback()
    session.refresh(app)
    return {"application": app, "scanned": scanned}


_ALLOWED_DOC_EXT = {".pdf", ".jpg", ".jpeg", ".png"}


def _human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{round(n / 1024)} KB"
    return f"{round(n / (1024 * 1024), 1)} MB"


@app.post("/intake", status_code=201, tags=["applications"])
def public_intake(
    file: UploadFile = File(...),
    business: str = Form(...),
    contact: str = Form(""),
    email: str = Form(""),
    phone: str = Form(""),
    country: str = Form(""),
    documents: list[UploadFile] = File(None),
    document_types: list[str] = Form(None),
    declared_types: list[str] = Form(None),
    session: Session = Depends(get_session),
) -> dict:
    """Public/invited application intake — the agent's own front door (M3).

    Unauthenticated. Validates and stores the submitted PDF in the application
    document store (`backend/app-forms/` — the single source of record for
    applications), creates a 'New' application that shows up in the admin's
    Applications list, and links the file as `source_pdf` so the admin can run
    the scan during review. Not auto-scanned — the admin decides.

    Supporting documents (ASIC/business registration, QEAC/PIER or education-agent
    training certificate, identity, MARA/MARN, insurance, licence, references) are
    attached as `documents`. Two typing modes are supported:

    - Bundle mode (`declared_types`): the applicant uploads one combined bundle and
      ticks a checklist of the document types it contains. Each ticked type becomes
      a Document row typed for the admin's verification; when the bundle has fewer
      files than ticked types (a single combined PDF), the ticked types reuse the
      bundle files as evidence so the required-document checks still see them.
    - Legacy per-file mode (`document_types`): each file is typed in lockstep.
    """
    biz = business.strip()
    if not biz:
        raise HTTPException(status_code=400, detail="Business / agency name is required.")
    name = file.filename or "application.pdf"
    data = file.file.read()
    is_pdf = name.lower().endswith(".pdf") or file.content_type == "application/pdf"
    if not is_pdf or not data[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Please attach a PDF file.")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB).")

    # Pre-read + validate every attachment BEFORE creating anything, so a bad
    # attachment can't leave an orphaned application or stray file behind.
    ups = documents or []
    types = document_types or []
    declared = [t.strip()[:60] for t in (declared_types or []) if t and t.strip()]
    files = []  # (name, blob, ext) — one entry per uploaded file
    for up in ups:
        if up is None or not up.filename:
            continue
        blob = up.file.read()
        if not blob:
            continue
        ext = Path(up.filename).suffix.lower()
        if ext not in _ALLOWED_DOC_EXT:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported attachment '{up.filename}'. Use PDF, JPG or PNG.")
        if len(blob) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Attachment too large: {up.filename}")
        files.append((up.filename[:120], blob, ext))

    # Decide the Document rows to create. In bundle mode the ticked checklist
    # drives the doc_types (mapped onto the uploaded files); otherwise each file
    # keeps its own type. Each entry is (name, doc_type, file_index).
    doc_plan = []  # (name, doc_type, file_index)
    if declared and files:
        rows = max(len(declared), len(files))
        for i in range(rows):
            fi = i if i < len(files) else len(files) - 1  # reuse bundle for extra types
            dtype = declared[i] if i < len(declared) else "Supporting document"
            doc_plan.append((files[fi][0], dtype, fi))
    else:
        for i, (name, _blob, _ext) in enumerate(files):
            dtype = (types[i] if i < len(types) else "Other").strip() or "Other"
            doc_plan.append((name, dtype[:60], i))

    now = datetime.utcnow()
    flag = _COUNTRY_FLAGS.get(country.strip().lower(), "🌐")
    app = Application(
        business=biz, contact=contact.strip(), email=email.strip(),
        phone=phone.strip(), country=country.strip(), flag=flag,
        date=f"{now.day} {now:%b %Y}", age="just now", status="New",
    )
    session.add(app)
    session.commit()
    session.refresh(app)

    stored = f"intake-{app.id}.pdf"
    storage.save(stored, data, "application/pdf")
    app.source_pdf = stored
    session.add(app)

    # Write each uploaded file once; Document rows reference stored names (a bundle
    # file may back several declared document types).
    stored_files = []  # parallel to `files`
    for n, (fname, blob, ext) in enumerate(files, start=1):
        stored_doc = f"doc-{app.id}-{n}{ext}"
        storage.save(stored_doc, blob, _MEDIA_BY_EXT.get(ext, "application/octet-stream"))
        stored_files.append(stored_doc)

    for fname, dtype, fi in doc_plan:
        blob = files[fi][1]
        session.add(Document(
            application_id=app.id, name=fname, doc_type=dtype,
            status="Uploaded", size=_human_size(len(blob)), file=stored_files[fi],
        ))

    session.add(AuditEvent(
        actor="Applicant · self-service", action="Application submitted via intake",
        entity=f"Application {app.id}",
        detail=f"{biz} submitted an application ({name}) with {len(files)} file(s) "
               f"covering {len(doc_plan)} supporting document(s)",
    ))
    session.commit()
    session.refresh(app)
    return {"application_id": app.id, "business": app.business, "documents": len(doc_plan)}


@app.delete("/applications/{app_id}", status_code=204, tags=["applications"])
def delete_application(app_id: int, session: Session = Depends(get_session)) -> None:
    """Permanently remove an application and all of its review data."""
    app = _get_app_or_404(app_id, session)

    # Remove child rows first (no DB-level cascade is configured). Delete any
    # stored files backing applicant-uploaded documents as we go.
    for model in (ExtractedField, ReviewSection, Document, Reference,
                  ReferenceFeedback, Agreement):
        for row in session.exec(
            select(model).where(model.application_id == app_id)
        ).all():
            stored_name = row.file if isinstance(row, Document) else (
                row.signed_file if isinstance(row, Agreement) else None)
            if stored_name:
                try:
                    storage.delete(stored_name)
                except Exception:
                    pass
            session.delete(row)
    # Audit events reference the application by entity string, not a foreign key.
    for ev in session.exec(
        select(AuditEvent).where(AuditEvent.entity == f"Application {app_id}")
    ).all():
        session.delete(ev)
    # Delete an admin-uploaded or intake-submitted document; leave seeded
    # showcase PDFs on disk.
    if app.source_pdf and app.source_pdf.startswith(("upload-", "intake-")):
        try:
            storage.delete(app.source_pdf)
        except Exception:
            pass

    business = app.business
    session.delete(app)
    session.add(AuditEvent(
        actor=ACTOR, action="Application removed",
        entity=f"Application {app_id}", detail=f"{business} removed",
    ))
    session.commit()
    return None


def _synthesize_detail(app: Application) -> dict:
    """Build a light read-only detail for applications without a seeded one."""
    return {
        "biz_fields": [
            {"label": "Business name", "value": app.business, "source": "Application form", "ok": True},
            {"label": "Primary contact", "value": app.contact, "source": "Application form", "ok": True},
            {"label": "Email", "value": app.email, "source": "Application form", "ok": True},
            {"label": "Phone", "value": app.phone, "source": "Application form", "ok": True},
            {"label": "Country", "value": f"{app.flag} {app.country}".strip(), "source": "Application form", "ok": True},
        ],
        "compliance": [],
        "activity": [
            {"text": "Application submitted via website", "when": app.age or app.date, "tone": "muted"},
        ],
    }


def _get_app_or_404(app_id: int, session: Session) -> Application:
    app = session.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail=f"Application {app_id} not found")
    return app


def _sections(app_id: int, session: Session) -> list[ReviewSection]:
    # Order by id (insertion order = the review-build order) so the section
    # sequence is stable. Without this, Postgres returns rows in an undefined
    # order that shifts after an UPDATE (approve/flag), reordering the review UI.
    return session.exec(
        select(ReviewSection)
        .where(ReviewSection.application_id == app_id)
        .order_by(ReviewSection.id)
    ).all()


def _docs_refs(app_id: int, session: Session):
    documents = session.exec(
        select(Document).where(Document.application_id == app_id).order_by(Document.id)
    ).all()
    references = session.exec(
        select(Reference).where(Reference.application_id == app_id).order_by(Reference.id)
    ).all()
    return documents, references


ACTOR = "Priya Ramesh"


@app.get("/applications/{app_id}", tags=["applications"])
def get_application(app_id: int, session: Session = Depends(get_session)) -> dict:
    app = _get_app_or_404(app_id, session)
    documents, references = _docs_refs(app_id, session)
    agreement = session.exec(
        select(Agreement).where(Agreement.application_id == app_id)
    ).first()
    tracker = session.exec(
        select(PrismsCompliance).where(PrismsCompliance.application_id == app_id)
    ).first()
    return {
        "application": app,
        "detail": app.detail or _synthesize_detail(app),
        "form_data": app.form_data,
        "documents": documents,
        "references": references,
        "agreement": agreement,
        "prisms_compliance": _compliance_dict(tracker) if tracker else None,
    }


def _fields(app_id: int, session: Session) -> list[ExtractedField]:
    return session.exec(
        select(ExtractedField)
        .where(ExtractedField.application_id == app_id)
        .order_by(ExtractedField.id)
    ).all()


def _scan_real(app: Application, session: Session) -> dict:
    """M2.6 real pipeline: extract (pypdf→EasyOCR) → normalize → validate → persist."""
    from extract import extract_application
    from normalize import normalize
    from validate import validate_doc
    import review_build

    with storage.open_path(app.source_pdf) as resolved:
        if resolved is None:
            raise HTTPException(status_code=400, detail="Source document not found in any store")
        raw = extract_application(str(resolved))
    doc = normalize(raw)
    verdicts = validate_doc(doc)

    # Replace prior extraction + sections for this app.
    for row in _fields(app.id, session):
        session.delete(row)
    for row in _sections(app.id, session):
        session.delete(row)
    session.commit()

    for row in review_build.build_extracted_rows(app.id, doc, verdicts, raw.engine_used):
        session.add(row)
    for row in review_build.build_sections(app.id, doc, verdicts):
        session.add(row)
    app.scanned_at = datetime.utcnow()
    session.add(app)
    session.add(AuditEvent(
        actor="System", action="Document scan completed",
        entity=f"Application {app.id}",
        detail=f"Extracted {len(doc.fields)} fields from {raw.page_count}pp · engine {raw.engine_used}",
    ))
    session.commit()
    # Advisory insights follow the scan so the review opens with guidance ready.
    _regenerate_insights(app, session)


def _revalidate_and_rebuild(app_id: int, session: Session) -> None:
    """Re-run validation over the current ExtractedField values and refresh the
    section *system* tier — used after an inline correction. Reconstructs the
    normalized doc from stored rows, re-scores every field, and merges the fresh
    system status/signals into existing ReviewSection rows WITHOUT touching the
    human (admin) sign-off.
    """
    from normalize import ApplicationDoc, Field
    from validate import validate_doc
    import review_build

    rows = _fields(app_id, session)
    if not rows:
        return
    fields = []
    for r in rows:
        group, label, mandatory = _SPEC_BY_KEY.get(r.key, (r.group, r.label, False))
        fields.append(Field(key=r.key, group=r.group or group, label=r.label or label,
                            value=r.value, page=r.page, confidence=r.confidence,
                            mandatory=mandatory))
    doc = ApplicationDoc(fields=fields)
    verdicts = validate_doc(doc)

    by_key = {r.key: r for r in rows}
    for f in fields:
        v = verdicts.get(f.key, {})
        r = by_key[f.key]
        r.validation = v
        r.confidence = v.get("legitimacy", r.confidence)
        session.add(r)

    fresh = {s.section_key: s for s in review_build.build_sections(app_id, doc, verdicts)}
    for existing in _sections(app_id, session):
        nf = fresh.get(existing.section_key)
        if nf is not None:
            existing.system_status = nf.system_status
            existing.system_note = nf.system_note
            existing.signals = nf.signals
            session.add(existing)
    session.commit()


def _regenerate_insights(app: Application, session: Session) -> dict:
    """(Re)generate advisory insights for an application and persist them."""
    fields = _fields(app.id, session)
    summary = _review_summary(fields)
    documents = session.exec(
        select(Document).where(Document.application_id == app.id)
    ).all()
    items, source = insights_engine.generate_insights(fields, summary, documents)
    app.insights = items
    app.insights_source = source
    session.add(app)
    session.add(AuditEvent(
        actor="AI advisor", action="Advisory insights generated",
        entity=f"Application {app.id}",
        detail=f"{len(items)} insight(s) · engine {source}",
    ))
    session.commit()
    session.refresh(app)
    return {"insights": items, "insights_source": source}


def _scan_simulated(app: Application, session: Session) -> None:
    """M2.5 fallback: local simulated scan for seeded form_data apps (no PDF)."""
    documents, references = _docs_refs(app.id, session)
    result = formscan.scan_application(app, documents, references)
    existing = {s.section_key: s for s in _sections(app.id, session)}
    for meta in formscan.SECTIONS:
        data = result["sections"][meta["key"]]
        row = existing.get(meta["key"]) or ReviewSection(
            application_id=app.id, section_key=meta["key"],
            label=meta["label"], mandatory=meta["mandatory"])
        row.system_status = data["system_status"]
        row.system_note = data["system_note"]
        row.signals = data["signals"]
        session.add(row)
    app.scanned_at = datetime.utcnow()
    session.add(app)
    session.add(AuditEvent(actor="System", action="Document scan completed",
                           entity=f"Application {app.id}", detail="Local simulated scan"))
    session.commit()


@app.post("/applications/{app_id}/scan", tags=["review"])
def scan_application(app_id: int, session: Session = Depends(get_session)) -> dict:
    """Run document extraction (real pipeline if a source PDF exists, else simulated)."""
    app = _get_app_or_404(app_id, session)
    if formscan.resolve_pdf(app.source_pdf):
        _scan_real(app, session)
    elif app.form_data:
        _scan_simulated(app, session)
    else:
        raise HTTPException(status_code=400, detail="No document on file to scan")
    return get_review(app_id, session)


@app.get("/applications/{app_id}/review", tags=["review"])
def get_review(app_id: int, session: Session = Depends(get_session)) -> dict:
    app = _get_app_or_404(app_id, session)
    all_sections = _sections(app_id, session)
    # The 'documents' section is a sign-off unit but not a timeline nav row (the
    # frontend renders Attached documents synthetically) and does not gate.
    doc_section = next((s for s in all_sections if s.section_key == "documents"), None)
    sections = [s for s in all_sections if s.section_key != "documents"]
    fields = _fields(app_id, session)
    gate = evaluate_gate(sections)
    summary = _review_summary(fields)
    return {"sections": sections, "fields": fields, "gate": gate,
            "summary": summary, "scanned_at": app.scanned_at,
            "insights": app.insights, "insights_source": app.insights_source,
            "references_feedback": _ref_feedback(app_id, session),
            "documents_admin_status": doc_section.admin_status if doc_section else "pending",
            "documents_admin_note": doc_section.admin_note if doc_section else ""}


def _ref_feedback(app_id: int, session: Session) -> list[ReferenceFeedback]:
    return session.exec(
        select(ReferenceFeedback).where(ReferenceFeedback.application_id == app_id)
    ).all()


def _get_or_make_feedback(app_id: int, ref_key: str, session: Session) -> ReferenceFeedback:
    row = session.exec(
        select(ReferenceFeedback).where(
            ReferenceFeedback.application_id == app_id,
            ReferenceFeedback.ref_key == ref_key,
        )
    ).first()
    if row is None:
        row = ReferenceFeedback(application_id=app_id, ref_key=ref_key)
    return row


def _review_summary(fields: list[ExtractedField]) -> dict:
    mandatory = [f for f in fields if f.key in _MANDATORY_KEYS]
    filled = [f for f in mandatory if (f.value or "").strip()]
    completeness = round(100 * len(filled) / len(mandatory)) if mandatory else 0
    needs = 0
    for f in fields:
        v = f.validation or {}
        low = f.confidence < 0.60
        if (not v.get("ok", True)) or v.get("level") in ("flag", "fail") or low:
            needs += 1
    return {"completeness": completeness, "needs_attention": needs,
            "mandatory_total": len(mandatory), "mandatory_filled": len(filled),
            "field_count": len(fields)}


@app.patch("/applications/{app_id}/review/{section_key}", tags=["review"])
def review_section(
    app_id: int, section_key: str, body: ReviewSectionUpdate,
    session: Session = Depends(get_session),
) -> ReviewSection:
    _get_app_or_404(app_id, session)
    row = session.exec(
        select(ReviewSection).where(
            ReviewSection.application_id == app_id,
            ReviewSection.section_key == section_key,
        )
    ).first()
    if row is None:
        # The 'documents' section is created on first sign-off (it has no
        # scan-built row); other section keys must already exist.
        if section_key == "documents":
            row = ReviewSection(
                application_id=app_id, section_key="documents",
                label="Attached documents", mandatory=False, system_status="na",
            )
        else:
            raise HTTPException(status_code=404, detail=f"Section {section_key!r} not found")
    row.admin_status = body.admin_status
    row.admin_note = body.admin_note
    row.updated_by = ACTOR
    row.updated_at = datetime.utcnow()
    session.add(row)
    verb = {"approved": "approved", "rejected": "flagged"}.get(body.admin_status, "reviewed")
    session.add(AuditEvent(
        actor=ACTOR, action=f"Section {verb}",
        entity=f"Application {app_id}",
        detail=f"{row.label} {verb}" + (f" · {body.admin_note}" if body.admin_note else ""),
    ))
    session.commit()
    session.refresh(row)
    return row


@app.patch("/applications/{app_id}/fields/{key}", tags=["review"])
def correct_field(
    app_id: int, key: str, body: FieldCorrection,
    session: Session = Depends(get_session),
) -> dict:
    """Admin inline correction of one extracted field.

    Overwrites the working `value` while preserving the original `ocr_value`
    (set once at extraction, never mutated). Re-runs validation so the field's
    confidence/verdict and its section's system status refresh, and logs the
    before→after in the audit trail.
    """
    _get_app_or_404(app_id, session)
    row = session.exec(
        select(ExtractedField).where(
            ExtractedField.application_id == app_id,
            ExtractedField.key == key,
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Field {key!r} not found")

    old = row.value
    new = body.value.strip()
    if new == old:
        return {"field": row, "unchanged": True}
    row.value = new
    row.corrected = True
    row.corrected_by = ACTOR
    row.corrected_at = datetime.utcnow()
    session.add(row)
    session.add(AuditEvent(
        actor=ACTOR, action="Field corrected",
        entity=f"Application {app_id}",
        detail=f"{row.label}: {old or '—'!r} → {new or '—'!r}",
    ))
    session.commit()
    # Refresh validation + the containing section's system tier.
    _revalidate_and_rebuild(app_id, session)
    session.refresh(row)
    return {"field": row}


@app.post("/applications/{app_id}/insights", tags=["review"])
def refresh_insights(app_id: int, session: Session = Depends(get_session)) -> dict:
    """(Re)generate advisory AI insights for the application."""
    app = _get_app_or_404(app_id, session)
    if not _fields(app_id, session):
        raise HTTPException(status_code=400, detail="Run a scan before requesting insights")
    return _regenerate_insights(app, session)


@app.post("/applications/{app_id}/references/{ref_key}/request", tags=["review"])
def request_reference(
    app_id: int, ref_key: str, body: ReferenceRequest,
    session: Session = Depends(get_session),
) -> ReferenceFeedback:
    """Trigger a reference request to a referee (email stubbed until M6).

    Records that the request was sent and moves the referee to 'requested'. The
    admin later transcribes the reply via the feedback endpoint.
    """
    _get_app_or_404(app_id, session)
    row = _get_or_make_feedback(app_id, ref_key, session)
    if body.referee:
        row.referee = body.referee
    row.status = "requested"
    row.requested_at = datetime.utcnow()
    session.add(row)
    who = row.referee or ref_key
    session.add(AuditEvent(
        actor=ACTOR, action="Reference requested",
        entity=f"Application {app_id}",
        detail=f"Reference request emailed to {who}",
    ))
    session.commit()
    session.refresh(row)
    return row


@app.put("/applications/{app_id}/references/{ref_key}/feedback", tags=["review"])
def save_reference_feedback(
    app_id: int, ref_key: str, body: ReferenceFeedbackInput,
    session: Session = Depends(get_session),
) -> ReferenceFeedback:
    """Record the written feedback received from a referee (entered by the admin)."""
    _get_app_or_404(app_id, session)
    text = body.feedback.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Feedback text is required")
    row = _get_or_make_feedback(app_id, ref_key, session)
    if body.referee:
        row.referee = body.referee
    row.feedback = text
    row.status = "received"
    row.received_at = datetime.utcnow()
    row.updated_by = ACTOR
    session.add(row)
    who = row.referee or ref_key
    session.add(AuditEvent(
        actor=ACTOR, action="Reference feedback recorded",
        entity=f"Application {app_id}",
        detail=f"Feedback from {who} recorded",
    ))
    session.commit()
    session.refresh(row)
    return row


@app.patch("/applications/{app_id}/decision", tags=["applications"])
def decide_application(
    app_id: int, body: DecisionRequest, session: Session = Depends(get_session)
) -> Application:
    app = _get_app_or_404(app_id, session)

    # M2.5 tiered gate — only on approval.
    if body.action == "approve":
        sections = _sections(app_id, session)
        gate = evaluate_gate(sections)
        if gate["blocking"]:
            raise HTTPException(status_code=409, detail={
                "message": "Approval blocked by mandatory checks",
                "blocking": gate["blocking"], "warnings": gate["warnings"],
            })
        if gate["warnings"] and not body.override:
            raise HTTPException(status_code=409, detail={
                "message": "Approval needs an override reason",
                "blocking": [], "warnings": gate["warnings"], "override_required": True,
            })

    try:
        event = apply_decision(
            app, body.action, actor=ACTOR,
            reason=body.reason, comment=body.comment, items=body.items,
            override_reason=body.override_reason if body.action == "approve" else "",
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    session.add(event)
    # On approval, stage a draft agreement (reuse an existing one if present).
    if body.action == "approve":
        existing = session.exec(
            select(Agreement).where(Agreement.application_id == app_id)
        ).first()
        if existing is None:
            session.add(Agreement(application_id=app_id, status="Draft"))
    session.add(app)
    session.commit()
    session.refresh(app)
    return app


def _get_agreement(app_id: int, session: Session) -> Agreement:
    ag = session.exec(
        select(Agreement).where(Agreement.application_id == app_id)
    ).first()
    if ag is None:
        ag = Agreement(application_id=app_id)
        session.add(ag)
        session.commit()
        session.refresh(ag)
    return ag


def make_agreement_pdf(app: Application) -> bytes:
    """The College's recruitment agreement for this applicant, as a real PDF."""
    return make_asset_pdf(
        "International Recruitment Agreement",
        f"Kensington Melbourne College  &  {app.business}",
        [
            "v6.2 · ESOS Act 2000 · ASQA compliant",
            "",
            "1. Appointment & Territory — non-exclusive appointment to promote",
            "   the College's programs in the agreed territory.",
            "2. Commission — 15% of Year 1 tuition per enrolled student, paid",
            "   after census-date clearance.",
            "3. Term — 24 months, auto-renews unless terminated.",
            "4. Compliance — the Agent warrants current MARN / QEAC / ESOS",
            "   registration for the term of this agreement.",
            "",
            "Signed for the Agent: ____________________   Date: __________",
            "Signed for the College: __________________   Date: __________",
        ],
    )


@app.post("/applications/{app_id}/agreement/send", tags=["applications"])
def send_agreement(app_id: int, session: Session = Depends(get_session)) -> Agreement:
    app = _get_app_or_404(app_id, session)
    agreement = _get_agreement(app_id, session)
    agreement.status = "Sent"
    agreement.sent_date = datetime.utcnow().strftime("%d %b %Y")
    app.status = "Agreement Sent"
    session.add(agreement)
    session.add(app)
    session.add(AuditEvent(
        actor=ACTOR, action="Sent agreement",
        entity=f"Application {app_id}",
        detail=f"Recruitment agreement sent to {app.business} for signature",
    ))
    session.commit()
    session.refresh(agreement)
    return agreement


@app.get("/applications/{app_id}/agreement/document", tags=["applications"])
def get_agreement_document(app_id: int, session: Session = Depends(get_session)) -> Response:
    """Download the (unsigned) recruitment agreement to send to the agent."""
    app = _get_app_or_404(app_id, session)
    safe = "".join(c if c.isalnum() or c in " -_" else "" for c in app.business).strip()
    return Response(
        content=make_agreement_pdf(app), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Agreement - {safe or app_id}.pdf"'},
    )


@app.post("/applications/{app_id}/agreement/upload", status_code=201, tags=["applications"])
def upload_signed_agreement(
    app_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)
) -> Agreement:
    """Admin uploads the agent's signed agreement (returned by email)."""
    _get_app_or_404(app_id, session)
    data = file.file.read()
    name = file.filename or "signed-agreement.pdf"
    is_pdf = name.lower().endswith(".pdf") or file.content_type == "application/pdf"
    if not is_pdf or not data[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB).")
    agreement = _get_agreement(app_id, session)
    stored = f"agreement-signed-{app_id}.pdf"
    storage.save(stored, data, "application/pdf")
    agreement.signed_file = stored
    agreement.signature_verified = False  # re-verify after any new upload
    session.add(agreement)
    session.add(AuditEvent(
        actor=ACTOR, action="Signed agreement uploaded",
        entity=f"Application {app_id}", detail=f"Signed agreement received ({name})",
    ))
    session.commit()
    session.refresh(agreement)
    return agreement


@app.get("/applications/{app_id}/agreement/signed", tags=["applications"])
def download_signed_agreement(app_id: int, session: Session = Depends(get_session)) -> Response:
    """Download the uploaded signed agreement for review."""
    agreement = session.exec(
        select(Agreement).where(Agreement.application_id == app_id)
    ).first()
    if agreement is None or not agreement.signed_file:
        raise HTTPException(status_code=404, detail="No signed agreement on file")
    blob = storage.read(agreement.signed_file)
    if blob is None:
        raise HTTPException(status_code=404, detail="File not found in store")
    return Response(
        content=blob, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{agreement.signed_file}"'},
    )


@app.post("/applications/{app_id}/agreement/verify", tags=["applications"])
def verify_agreement(app_id: int, session: Session = Depends(get_session)) -> Agreement:
    """Admin verifies the signature on the uploaded agreement."""
    app = _get_app_or_404(app_id, session)
    agreement = _get_agreement(app_id, session)
    if not agreement.signed_file:
        raise HTTPException(status_code=400, detail="Upload the signed agreement first")
    agreement.signature_verified = True
    agreement.status = "Signed"
    agreement.signed_date = datetime.utcnow().strftime("%d %b %Y")
    app.status = "Agreement Signed"
    session.add(agreement)
    session.add(app)
    session.add(AuditEvent(
        actor=ACTOR, action="Signature verified",
        entity=f"Application {app_id}",
        detail=f"Agreement signature verified for {app.business}",
    ))
    # Start the 30-day PRISMS-registration compliance clock now that the signed
    # agreement is confirmed received.
    _ensure_compliance_tracker(app, session)
    session.add(AuditEvent(
        actor="System", action="PRISMS compliance started",
        entity=f"Application {app_id}",
        detail=f"30-day PRISMS registration window opened for {app.business}",
    ))
    session.commit()
    session.refresh(agreement)
    return agreement


# PRISMS = the Australian Dept. of Education's Provider Registration and
# International Student Management System. Corridor hands the audited, signed
# agreement details off to the admin, who signs in and enters the record there.
PRISMS_PORTAL_URL = "https://prisms.education.gov.au/Logon/Logon.aspx"
PROVIDER_NAME = "Kensington Melbourne College"
# The college's PRISMS provider code — the key its registered agents live under
# in the (mocked) PRISMS database.
PRISMS_PROVIDER_CODE = "KMC-CRICOS-01234A"
# Regulatory deadline: an agent must be registered in PRISMS within this many
# days of the signed agreement being verified.
PRISMS_DEADLINE_DAYS = 30
PRISMS_EXPORT_STEPS = [
    "Sign in to PRISMS with your provider (CRICOS) credentials — the portal opens in a new tab.",
    "In PRISMS, open Agents → Register a new education agent.",
    "Copy the agent's business and contact details below into the new agent record.",
    "Under Agreement, record the signature-verified date and attach the signed agreement PDF (download it from this page first).",
    "Enter the reference number shown below, then submit the record for registration.",
    "When PRISMS issues a registration reference, return to Corridor to file it against this agent.",
]


@app.post("/applications/{app_id}/prisms-export", tags=["applications"])
def prisms_export(app_id: int, session: Session = Depends(get_session)) -> dict:
    """Prepare the audited, signed agreement details for hand-off to PRISMS.

    Corridor does not push data into PRISMS directly — the admin signs in to the
    government portal and enters the record. This endpoint gates on a verified
    signature, records the hand-off on the audit trail, and returns the export
    payload plus the steps the admin follows in the portal.
    """
    app = _get_app_or_404(app_id, session)
    agreement = session.exec(
        select(Agreement).where(Agreement.application_id == app_id)
    ).first()
    if agreement is None or not agreement.signature_verified:
        raise HTTPException(
            status_code=409,
            detail="Verify the signed agreement before exporting to PRISMS")

    reference = f"KMC-AGR-{app_id}"

    # Once the agent record exists (post-invite), upsert its PRISMS registration
    # as Submitted so the M5 Gov-registration workflow can track it from here.
    agent = session.exec(select(Agent).where(Agent.name == app.business)).first()
    if agent is not None:
        reg = session.exec(
            select(GovRegistration).where(
                GovRegistration.agent_id == agent.id,
                GovRegistration.portal == "PRISMS",
            )
        ).first()
        if reg is None:
            reg = GovRegistration(agent_id=agent.id, portal="PRISMS")
        reg.status = "Submitted"
        reg.reference_no = reference
        session.add(reg)

    session.add(AuditEvent(
        actor=ACTOR, action="Exported to PRISMS",
        entity=f"Application {app_id}",
        detail=f"Signed agreement details for {app.business} exported to PRISMS ({reference})",
    ))
    session.commit()

    return {
        "portal_url": PRISMS_PORTAL_URL,
        "reference": reference,
        "prepared_by": ACTOR,
        "prepared_at": datetime.utcnow().strftime("%d %b %Y, %H:%M UTC"),
        "provider": PROVIDER_NAME,
        "agent": {
            "business": app.business, "contact": app.contact,
            "email": app.email, "phone": app.phone, "country": app.country,
        },
        "agreement": {
            "status": agreement.status,
            "sent_date": agreement.sent_date,
            "signed_date": agreement.signed_date,
            "signature_verified": agreement.signature_verified,
            "has_signed_pdf": bool(agreement.signed_file),
        },
        "steps": PRISMS_EXPORT_STEPS,
    }


# --- PRISMS 30-day registration compliance tracker -------------------------

def _ensure_compliance_tracker(app: Application, session: Session) -> PrismsCompliance:
    """Start (or return) the 30-day PRISMS-registration clock for an application.
    Created when the signed agreement is verified."""
    t = session.exec(
        select(PrismsCompliance).where(PrismsCompliance.application_id == app.id)
    ).first()
    if t is None:
        now = datetime.utcnow()
        t = PrismsCompliance(
            application_id=app.id, business=app.business,
            started_at=now, due_at=now + timedelta(days=PRISMS_DEADLINE_DAYS),
            status="Pending Upload",
        )
        session.add(t)
    return t


def _compliance_dict(t: PrismsCompliance) -> dict:
    """Serialize a tracker with the live 30-day countdown + overdue flag."""
    now = datetime.utcnow()
    secs = (t.due_at - now).total_seconds()
    return {
        "id": t.id,
        "application_id": t.application_id,
        "agent_id": t.agent_id,
        "business": t.business,
        "status": t.status,
        "started_at": t.started_at.isoformat(),
        "due_at": t.due_at.isoformat(),
        "deadline_days": PRISMS_DEADLINE_DAYS,
        "days_left": round(secs / 86400),
        "overdue": t.status != "Completed" and secs < 0,
        "prisms_agent_id": t.prisms_agent_id,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "last_checked_at": t.last_checked_at.isoformat() if t.last_checked_at else None,
    }


def reconcile_prisms_compliance(session: Session) -> int:
    """Poll the (mock) PRISMS system and flip any 'Pending Upload' tracker to
    'Completed' whose agent now has a PRISMS Agent ID. Returns how many flipped.

    This is the periodic reconciliation the background poller runs and that
    `POST /prisms-compliance/check` triggers on demand.
    """
    pending = session.exec(
        select(PrismsCompliance).where(PrismsCompliance.status == "Pending Upload")
    ).all()
    if not pending:
        return 0
    now = datetime.utcnow()
    flipped = 0
    for t in pending:
        t.last_checked_at = now
        agent_id = mock_prisms.find_agent_id(session, PRISMS_PROVIDER_CODE, t.business)
        if agent_id:
            t.status = "Completed"
            t.prisms_agent_id = agent_id
            t.completed_at = now
            # Link the local Agent + advance its GovRegistration when it exists.
            agent = session.exec(select(Agent).where(Agent.name == t.business)).first()
            if agent is not None:
                t.agent_id = agent.id
                reg = session.exec(
                    select(GovRegistration).where(
                        GovRegistration.agent_id == agent.id,
                        GovRegistration.portal == "PRISMS",
                    )
                ).first()
                if reg is None:
                    reg = GovRegistration(agent_id=agent.id, portal="PRISMS")
                reg.status = "Registered"
                reg.reference_no = agent_id
                session.add(reg)
            session.add(AuditEvent(
                actor="System", action="PRISMS registration confirmed",
                entity=f"Application {t.application_id}" if t.application_id else f"Agent {t.agent_id}",
                detail=f"{t.business} detected in PRISMS as {agent_id} — compliance marked Completed",
            ))
            flipped += 1
        session.add(t)
    session.commit()
    return flipped


@app.get("/mock/prisms/providers/{provider}/agents", tags=["mock-prisms"])
def mock_prisms_get_agents(provider: str, session: Session = Depends(get_session)) -> dict:
    """MOCK PRISMS API — 'Get the agent status for the provider'. Returns the
    agents currently registered in PRISMS under this provider; this is the
    endpoint Corridor polls to detect newly-registered agents."""
    return {"provider": provider, "agents": mock_prisms.get_provider_agents(session, provider)}


@app.post("/mock/prisms/providers/{provider}/agents", status_code=201, tags=["mock-prisms"])
def mock_prisms_register(
    provider: str, body: PrismsRegisterRequest, session: Session = Depends(get_session)
) -> dict:
    """MOCK PRISMS API — register an agent under a provider (assigns a PRISMS
    Agent ID). Stands in for the admin completing registration inside the real
    PRISMS portal."""
    rec = mock_prisms.register_agent(session, provider, body.business)
    return {"provider": rec.provider, "business": rec.business,
            "prisms_agent_id": rec.prisms_agent_id, "status": rec.status}


@app.get("/prisms-compliance", tags=["compliance"])
def list_prisms_compliance(session: Session = Depends(get_session)) -> list[dict]:
    """Every PRISMS-registration compliance tracker with its live countdown."""
    trackers = session.exec(select(PrismsCompliance).order_by(PrismsCompliance.due_at)).all()
    return [_compliance_dict(t) for t in trackers]


@app.post("/prisms-compliance/check", tags=["compliance"])
def check_prisms_compliance(session: Session = Depends(get_session)) -> dict:
    """Poll the PRISMS system once now, then return the current trackers."""
    flipped = reconcile_prisms_compliance(session)
    trackers = session.exec(select(PrismsCompliance).order_by(PrismsCompliance.due_at)).all()
    return {"flipped": flipped, "trackers": [_compliance_dict(t) for t in trackers]}


@app.post("/prisms-compliance/{tracker_id}/simulate-registration", tags=["compliance"])
def simulate_prisms_registration(tracker_id: int, session: Session = Depends(get_session)) -> dict:
    """DEMO helper: register this tracker's agent in the mock PRISMS database (as
    if the admin completed it in the portal), then reconcile so the tracker flips
    to Completed on the spot."""
    t = session.get(PrismsCompliance, tracker_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Tracker not found")
    mock_prisms.register_agent(session, PRISMS_PROVIDER_CODE, t.business)
    reconcile_prisms_compliance(session)
    session.refresh(t)
    return _compliance_dict(t)


@app.post("/applications/{app_id}/invite", tags=["applications"])
def invite_agent(
    app_id: int, body: InviteRequest, session: Session = Depends(get_session)
) -> dict:
    """Provision portal access and send the agent their login details.

    Only allowed once the agreement signature is verified. Creates the agent's
    Agent record + portal User (linked), moves the application to 'Active', and
    returns the login details to share with the agent.
    """
    app = _get_app_or_404(app_id, session)
    if app.status not in ("Agreement Signed", "Active"):
        raise HTTPException(
            status_code=409,
            detail="Verify the signed agreement before inviting the agent")

    email = (app.email or "").strip().lower()
    if not email:
        slug = "".join(c for c in app.business.lower() if c.isalnum())[:20] or f"agent{app_id}"
        email = f"{slug}@agent.portal"

    # Create/link the Agent record for the portal (idempotent by name).
    agent = session.exec(select(Agent).where(Agent.name == app.business)).first()
    if agent is None:
        flag = _COUNTRY_FLAGS.get((app.country or "").strip().lower(), app.flag or "🌐")
        agent = Agent(
            name=app.business, initials="".join(w[0] for w in app.business.split()[:2]).upper(),
            country=app.country, flag=flag, status="Active",
            since=datetime.utcnow().strftime("%b %y"),
        )
        session.add(agent)
        session.commit()
        session.refresh(agent)

    # Create/link the portal User (stub auth accepts any known email).
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        user = User(
            email=email, name=app.contact or app.business, role="agent",
            title=app.business, initials="".join(w[0] for w in (app.contact or app.business).split()[:2]).upper(),
            agent_id=agent.id,
        )
        session.add(user)
    else:
        user.role = "agent"
        user.agent_id = agent.id
        session.add(user)

    temp_password = secrets.token_urlsafe(9)
    app.status = "Active"
    session.add(app)
    channels = ", ".join(body.channels) if body.channels else "Email"
    session.add(AuditEvent(
        actor=ACTOR, action="Portal access provisioned",
        entity=f"Application {app_id}",
        detail=f"Portal invitation + login details sent to {app.business} ({email}) via {channels}",
    ))
    session.commit()
    return {
        "ok": True, "channels": body.channels,
        "credentials": {
            "email": email, "password": temp_password,
            "portal_url": f"{os.environ.get('FRONTEND_ORIGIN', 'http://127.0.0.1:8080').rstrip('/')}/#/login",
            "role": "agent",
        },
    }


@app.get("/agents", tags=["agents"])
def list_agents(session: Session = Depends(get_session)) -> list[Agent]:
    return session.exec(select(Agent)).all()


@app.get("/agents/{agent_id}", tags=["agents"])
def get_agent(agent_id: int, session: Session = Depends(get_session)) -> dict:
    """Single agent profile for the admin detail view: the Agent record plus its
    own slice of the audit trail (most recent first)."""
    agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    activity = session.exec(
        select(AuditEvent)
        .where(AuditEvent.entity == f"Agent {agent_id}")
        .order_by(AuditEvent.at.desc())
    ).all()
    return {"agent": agent, "activity": activity}


@app.patch("/agents/{agent_id}/rating", tags=["agents"])
def rate_agent(
    agent_id: int, body: AgentRating, session: Session = Depends(get_session)
) -> Agent:
    """Record (or update) a partner rating on a 1..5 scale with an optional note."""
    agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    rating = round(float(body.rating), 1)
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=422, detail="Rating must be between 1 and 5")

    note = (body.note or "").strip()
    agent.rating = rating
    agent.rating_count += 1
    agent.rating_note = note
    session.add(agent)
    detail = f"{agent.name} rated {rating}/5" + (f" — {note}" if note else "")
    session.add(AuditEvent(
        actor=ACTOR, action="Agent rated",
        entity=f"Agent {agent_id}", detail=detail,
    ))
    session.commit()
    session.refresh(agent)
    return agent


@app.patch("/agents/{agent_id}/terminate", tags=["agents"])
def terminate_agent(
    agent_id: int, body: AgentTerminate, session: Session = Depends(get_session)
) -> Agent:
    """End an active partnership: flip the agent to Terminated with a recorded
    reason. Idempotent-guarded — an already-terminated agent returns 409 so the
    original termination reason on the audit trail is never masked."""
    agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.status == "Terminated":
        raise HTTPException(status_code=409, detail="Agent is already terminated")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="A termination reason is required")

    prev = agent.status
    agent.status = "Terminated"
    session.add(agent)
    session.add(AuditEvent(
        actor=ACTOR, action="Agent terminated",
        entity=f"Agent {agent_id}",
        detail=f"{agent.name} terminated (was {prev}) — {reason}",
    ))
    session.commit()
    session.refresh(agent)
    return agent


@app.delete("/agents/{agent_id}", status_code=204, tags=["agents"])
def delete_agent(agent_id: int, session: Session = Depends(get_session)) -> None:
    """Permanently remove an agent row. Any portal user linked to this agent is
    unlinked (their login stays, but loses the agent profile)."""
    agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    for u in session.exec(select(User).where(User.agent_id == agent_id)).all():
        u.agent_id = None
        session.add(u)

    name = agent.name
    session.delete(agent)
    session.add(AuditEvent(
        actor=ACTOR, action="Agent removed",
        entity=f"Agent {agent_id}", detail=f"{name} removed",
    ))
    session.commit()
    return None


@app.get("/marketing", tags=["marketing"])
def list_marketing(session: Session = Depends(get_session)) -> list[MarketingAsset]:
    return session.exec(select(MarketingAsset)).all()


def _pdf_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_asset_pdf(title: str, subtitle: str = "", body_lines=None) -> bytes:
    """Build a minimal, valid single-page PDF (no external deps).

    Used to serve a real downloadable file for a marketing asset that has no
    stored binary yet. A real asset store / CDN replaces this in M6.
    """
    body_lines = body_lines or []
    content = ["BT", "/F1 22 Tf", "72 770 Td", f"({_pdf_escape(title)}) Tj"]
    if subtitle:
        content += ["/F1 12 Tf", "0 -30 TD", f"({_pdf_escape(subtitle)}) Tj"]
    else:
        content += ["/F1 12 Tf", "0 -30 TD"]
    for ln in body_lines:
        content += ["0 -20 TD", f"({_pdf_escape(ln)}) Tj"]
    content.append("ET")
    stream = "\n".join(content).encode("latin-1", "replace")

    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]"
        b"/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
        b"<</Length %d>>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref_pos = len(out)
    n = len(objs) + 1
    out += b"xref\n0 %d\n" % n
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (n, xref_pos)
    return bytes(out)


@app.get("/marketing/{asset_id}/download", tags=["marketing"])
def download_marketing(asset_id: int, session: Session = Depends(get_session)) -> Response:
    """Download the latest version of a marketing asset as a PDF."""
    asset = session.get(MarketingAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    pdf = make_asset_pdf(
        asset.title,
        f"{asset.category} · {asset.version} · updated {asset.updated}",
        [
            "Kensington Melbourne College — official shared collateral.",
            "The single source of truth distributed to every partner agent.",
            "",
            "This portal-generated document stands in for the real asset",
            "in the Corridor demo; production serves the stored file from a bucket.",
        ],
    )
    safe = "".join(c if c.isalnum() or c in " -_" else "" for c in asset.title).strip()
    filename = f"{safe or 'asset'} {asset.version}.pdf"
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Blank application form shipped for applicants to download, fill, and re-upload.
# Lives in the repo's PRD folder (../PRD/application-forms) — the single master copy.
_APP_FORM_PATH = (
    Path(__file__).resolve().parent.parent
    / "PRD" / "application-forms" / "Agent Application Form.pdf"
)


@app.get("/application-form/download", tags=["applications"])
def download_application_form() -> Response:
    """Public: download the blank Agent Application Form PDF (no auth required).

    Applicants grab this on the public intake page, fill it in, and re-upload it
    with their submission.
    """
    if not _APP_FORM_PATH.exists():
        raise HTTPException(status_code=404, detail="Application form not available")
    return Response(
        content=_APP_FORM_PATH.read_bytes(), media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Agent Application Form.pdf"'},
    )


_MEDIA_BY_EXT = {".pdf": "application/pdf", ".jpg": "image/jpeg",
                 ".jpeg": "image/jpeg", ".png": "image/png"}


@app.get("/applications/{app_id}/form", tags=["applications"])
def download_submitted_form(app_id: int, session: Session = Depends(get_session)) -> Response:
    """Serve the original submitted agent application-form PDF for this application
    (the source document the extraction pipeline ran on)."""
    app = _get_app_or_404(app_id, session)
    if not app.source_pdf:
        raise HTTPException(status_code=404, detail="No application form on file for this application")
    blob = storage.read(app.source_pdf)
    if blob is None:
        raise HTTPException(status_code=404, detail="Application form file not found in store")
    safe = "".join(c for c in (app.business or "application") if c.isalnum() or c in " -_").strip()
    filename = f"{safe or 'application'} - form (App-{app_id}).pdf"
    return Response(
        content=blob, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/documents/{doc_id}/download", tags=["applications"])
def download_document(doc_id: int, session: Session = Depends(get_session)) -> Response:
    """Download an applicant-uploaded supporting document."""
    doc = session.get(Document, doc_id)
    if doc is None or not doc.file:
        raise HTTPException(status_code=404, detail="Document has no stored file")
    blob = storage.read(doc.file)
    if blob is None:
        raise HTTPException(status_code=404, detail="File not found in store")
    ext = Path(doc.file).suffix.lower()
    media = _MEDIA_BY_EXT.get(ext, "application/octet-stream")
    return Response(
        content=blob, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{doc.name}"'},
    )


@app.patch("/documents/{doc_id}", tags=["applications"])
def review_document(
    doc_id: int, body: DocumentStatusUpdate, session: Session = Depends(get_session)
) -> Document:
    """Record the admin's review verdict on an attached supporting document."""
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.status = body.status
    session.add(doc)
    session.add(AuditEvent(
        actor=ACTOR, action="Document reviewed",
        entity=f"Application {doc.application_id}",
        detail=f"{doc.doc_type or 'Document'} ({doc.name}) marked {body.status}",
    ))
    session.commit()
    session.refresh(doc)
    return doc


@app.get("/audit", tags=["audit"])
def list_audit(session: Session = Depends(get_session)) -> list[AuditEvent]:
    return session.exec(select(AuditEvent).order_by(AuditEvent.at.desc())).all()


if __name__ == "__main__":
    # Programmatic invocation of the server runtime. Bind all interfaces and use
    # the platform-provided $PORT (Render/most PaaS) so the app is reachable in
    # production; fall back to :8000 locally. Hot-reload only when DEV is set.
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port,
                reload=bool(os.environ.get("DEV")))
