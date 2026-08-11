"""Seed data mirroring the designer's prototype sample records.

Populates SQLite so the shell has realistic content in M1 and the M2 admin loop
has data to act on. Idempotent: wipes and re-inserts on each call.
"""
from sqlmodel import Session, delete, select

from models import (
    Agent,
    Agreement,
    Application,
    AuditEvent,
    Document,
    ExtractedField,
    MarketingAsset,
    Reference,
    ReferenceFeedback,
    ReviewSection,
    User,
)

_USERS = [
    {"email": "admin@kmc.edu.au", "name": "Priya Ramesh", "role": "admin",
     "title": "Admissions Manager", "initials": "PR"},
    {"email": "agent@sunriseoverseas.in", "name": "Ananya Iyer", "role": "agent",
     "title": "Sunrise Overseas Consultants", "initials": "AI"},
]

_APPLICATIONS = [
    # No mock rows: every application is backed by one of the three real filled
    # City College application forms in PRD/application-forms/ (copied into
    # app-forms/). List metadata below is pulled from each PDF; the full field
    # set is produced by the real extraction pipeline on "Run scan".
    {"id": 2090, "business": "Sino-Aus Education Consulting Co., Ltd.", "contact": "Wei (David) Zhang",
     "email": "david.zhang@sinoaus-edu.cn", "phone": "+86 10 8518 9000",
     "country": "China", "flag": "🇨🇳", "date": "10 Aug 2026", "age": "1 day ago",
     "status": "In Review", "source_pdf": "app-2090.pdf"},
    {"id": 2091, "business": "Kalahari Global Education & Pathways CC", "contact": "Kandali (Samuel) Shikongo",
     "email": "samuel.shikongo@kalahari-edu.na", "phone": "+264 61 248 900",
     "country": "Namibia", "flag": "🇳🇦", "date": "11 Aug 2026", "age": "today",
     "status": "New", "source_pdf": "app-2091.pdf"},
    {"id": 2092, "business": "Apex Horizons Migration & Global Education Ltd.", "contact": "Vikram Rathore",
     "email": "apexpathways2025@gmail.com", "phone": "+91 98765 00112",
     "country": "India", "flag": "🇮🇳", "date": "11 Aug 2026", "age": "today",
     "status": "New", "source_pdf": "app-2092.pdf"},
]

def _cert(kind, ident, issued, expires):
    """M4 certification record. Validity state is computed at read time."""
    return {"type": kind, "identifier": ident, "issued": issued,
            "expires": expires, "status": ""}


_AGENTS = [
    # First entry is the portal demo agent — the seeded agent *user*
    # (agent@sunriseoverseas.in) is linked to this row so the agent portal shows
    # a real, own record. M4: certifications/rating/students are internal mock
    # partnership records (clearly synthetic — not real external/market data),
    # deliberately spread across valid/expiring/expired so the UI shows every flag.
    {"name": "Sunrise Overseas Consultants", "initials": "SO", "avatar_bg": "#ffd9a0",
     "country": "India", "flag": "🇮🇳", "status": "Active", "since": "Apr 24",
     "enrol": 57, "conv": "63%", "comp": "90%",
     "marn": "1789004", "next_review": "21 Sep 2026", "students": 41,
     "rating": 4.4, "rating_count": 38, "certifications": [
        _cert("QEAC", "F231", "2024-04-02", "2027-04-01"),
        _cert("Business registration", "CIN U74999MH2018PTC308421", "2018-06-11", ""),
        _cert("Insurance", "PI-IND-88213", "2025-11-01", "2026-11-01")]},
    {"name": "Global Bridge Education", "initials": "GB", "avatar_bg": "#ffcd00",
     "country": "Vietnam", "flag": "🇻🇳", "status": "Active", "since": "Feb 23",
     "enrol": 128, "conv": "71%", "comp": "96%",
     "marn": "1789004", "next_review": "21 Sep 2026", "students": 96,
     "rating": 4.7, "rating_count": 71, "certifications": [
        _cert("MARN", "1789004", "2023-02-15", "2027-02-14"),
        _cert("QEAC", "G118", "2023-02-20", "2027-02-19"),
        _cert("Business registration", "0312998765", "2015-08-01", ""),
        _cert("Insurance", "PI-VN-40021", "2025-09-15", "2026-09-15")]},
    {"name": "Wattle & Willow Advisors", "initials": "WW", "avatar_bg": "#c4e8d4",
     "country": "India", "flag": "🇮🇳", "status": "Active", "since": "Aug 22",
     "enrol": 94, "conv": "64%", "comp": "92%",
     "marn": "1654220", "next_review": "12 Nov 2026", "students": 73,
     "rating": 4.5, "rating_count": 60, "certifications": [
        _cert("QEAC", "H442", "2022-08-05", "2026-12-31"),
        _cert("Business registration", "CIN U80903DL2016PTC299110", "2016-03-19", ""),
        _cert("Insurance", "PI-IND-55190", "2025-10-01", "2026-10-01")]},
    {"name": "Southern Cross Study", "initials": "SC", "avatar_bg": "#ffe4a0",
     "country": "Nepal", "flag": "🇳🇵", "status": "Expiring Soon", "since": "Nov 21",
     "enrol": 61, "conv": "58%", "comp": "74%",
     "marn": "1490882", "next_review": "05 Sep 2026", "students": 44,
     "rating": 3.6, "rating_count": 33, "certifications": [
        # Expires within ~5 weeks of today (2026-08-12) → drives "expiring" flag.
        _cert("QEAC", "J207", "2021-11-10", "2026-09-18"),
        _cert("PIER", "PIER-NP-3391", "2024-01-15", "2027-01-14"),
        _cert("Business registration", "PAN 601234587", "2019-05-22", "")]},
    {"name": "Kangaroo Path Partners", "initials": "KP", "avatar_bg": "#d4d4f4",
     "country": "Philippines", "flag": "🇵🇭", "status": "Active", "since": "Mar 24",
     "enrol": 47, "conv": "69%", "comp": "89%",
     "marn": "1720145", "next_review": "30 Oct 2026", "students": 35,
     "rating": 4.3, "rating_count": 29, "certifications": [
        _cert("QEAC", "K556", "2024-03-01", "2027-02-28"),
        _cert("Business registration", "SEC CS201812345", "2018-01-30", ""),
        _cert("Insurance", "PI-PH-77410", "2025-12-01", "2026-12-01")]},
    {"name": "Reef & Ridge Global", "initials": "RR", "avatar_bg": "#f4c4c4",
     "country": "Kenya", "flag": "🇰🇪", "status": "Suspended", "since": "Jun 23",
     "enrol": 12, "conv": "32%", "comp": "48%",
     "marn": "1201553", "next_review": "Under review", "students": 8,
     "rating": 2.6, "rating_count": 14, "certifications": [
        # Already lapsed → drives "expired" flag; part of why it's suspended.
        _cert("MARN", "1201553", "2020-06-01", "2026-06-01"),
        _cert("QEAC", "L090", "2023-06-10", "2026-06-09"),
        _cert("Business registration", "PVT-KE-118902", "2021-02-14", "")]},
    {"name": "Boomerang EduAgency", "initials": "BE", "avatar_bg": "#c4e8f4",
     "country": "Sri Lanka", "flag": "🇱🇰", "status": "Active", "since": "Jan 25",
     "enrol": 33, "conv": "61%", "comp": "88%",
     "marn": "1801990", "next_review": "18 Dec 2026", "students": 24,
     "rating": 4.2, "rating_count": 19, "certifications": [
        _cert("AEATC", "AEATC-LK-2211", "2025-01-12", "2028-01-11"),
        _cert("Business registration", "PV 214556", "2022-09-05", "")]},
    {"name": "Outback Global Study", "initials": "OG", "avatar_bg": "#e4d4f4",
     "country": "Bangladesh", "flag": "🇧🇩", "status": "Active", "since": "Oct 24",
     "enrol": 28, "conv": "67%", "comp": "91%",
     "marn": "1765430", "next_review": "22 Nov 2026", "students": 21,
     "rating": 4.5, "rating_count": 17, "certifications": [
        _cert("QEAC", "M773", "2024-10-08", "2027-10-07"),
        _cert("Business registration", "RJSC C-160882", "2020-07-18", ""),
        _cert("Insurance", "PI-BD-30055", "2025-11-20", "2026-11-20")]},
]

_MARKETING = [
    {"title": "Undergraduate Course Guide 2026", "category": "Course guide",
     "version": "v3.2", "updated": "2 Aug 2026"},
    {"title": "International Fee Schedule 2026", "category": "Fee schedule",
     "version": "v2.1", "updated": "28 Jul 2026"},
    {"title": "Student Handbook", "category": "Handbook",
     "version": "v1.8", "updated": "15 Jul 2026"},
    {"title": "Campus & City Brochure", "category": "Brochure",
     "version": "v4.0", "updated": "10 Jul 2026"},
]

_AUDIT = [
    {"actor": "System", "action": "Application submitted",
     "entity": "Application 2090", "detail": "Sino-Aus Education Consulting — form received via intake"},
    {"actor": "System", "action": "Application submitted",
     "entity": "Application 2091", "detail": "Kalahari Global Education & Pathways — form received via intake"},
    {"actor": "System", "action": "Application submitted",
     "entity": "Application 2092", "detail": "Apex Horizons Migration & Global Education — form received via intake"},
]

def seed_all(session: Session) -> dict:
    # Wipe children first, then parents.
    for model in (ExtractedField, ReviewSection, Agreement, Document, Reference,
                  ReferenceFeedback, AuditEvent, MarketingAsset, Application, Agent, User):
        session.exec(delete(model))
    session.commit()

    # Agents first so their ids exist before we link the agent user to one.
    for a in _AGENTS:
        session.add(Agent(**a))
    session.commit()
    sunrise = session.exec(
        select(Agent).where(Agent.name == "Sunrise Overseas Consultants")
    ).first()

    for u in _USERS:
        # Link the agent user to the Sunrise agent row (M3 portal identity).
        agent_id = sunrise.id if (u["role"] == "agent" and sunrise) else None
        session.add(User(agent_id=agent_id, **u))
    for a in _APPLICATIONS:
        # Every application is PDF-backed: detail/documents/references are produced
        # by the real extraction pipeline on scan, and synthesized at read time.
        session.add(Application(detail=None, form_data=None, **a))
    for m in _MARKETING:
        session.add(MarketingAsset(**m))
    for e in _AUDIT:
        session.add(AuditEvent(**e))
    session.commit()

    # NB: no pre-scan — applications open with raw, unchecked fields. The admin
    # clicks "Run scan" to generate the system checks + confidence scores.
    return {
        "users": len(_USERS),
        "applications": len(_APPLICATIONS),
        "agents": len(_AGENTS),
        "marketing": len(_MARKETING),
        "audit": len(_AUDIT),
        "documents": 0,
        "references": 0,
    }
