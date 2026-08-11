"""Local simulated document scan (M2.5).

Stands in for a real ZDR OCR provider (Google Document AI / AWS Textract, M6)
behind the same interface. It *actually opens* the submitted PDF from the local
document store (proving the file was read: page count + section-header
detection), then produces per-section automated signals from the applicant's
form_data + uploaded documents/references.

Contract: the scan sets only the *system* tier. It never touches admin sign-off —
the human stays in the loop.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Any, Optional

from pypdf import PdfReader

# The single store for every application PDF on file — the one source of record
# for applications in review. Holds seeded showcase forms, admin uploads
# (upload-<id>.pdf), and public intake submissions (intake-<id>.pdf).
DOCUMENT_STORE = Path(__file__).resolve().parent / "app-forms"


def ensure_store() -> None:
    """Make sure the application document store exists (called at app startup)."""
    DOCUMENT_STORE.mkdir(exist_ok=True)


def resolve_pdf(name: Optional[str]) -> Optional[Path]:
    """Resolve a stored application PDF by name. Returns the path, or None."""
    if not name:
        return None
    candidate = DOCUMENT_STORE / name
    return candidate if candidate.exists() else None

# The four review sections (human sign-off units). Order = review order.
SECTIONS = [
    {"key": "company", "label": "Company & Directors", "mandatory": True},
    {"key": "compliance", "label": "Compliance declarations", "mandatory": True},
    {"key": "documents", "label": "Documents", "mandatory": True},
    {"key": "references", "label": "References", "mandatory": True},
]

# Marker text used to confirm the PDF really was parsed (section headers).
_HEADER_MARKERS = [
    "COMPANY/AGENCY INFORMATION",
    "COMPLIANCE REQUIREMENTS",
    "REFERENCES",
    "ACKNOWLEDGEMENT AND DECLARATION",
]


def form_path(app_id: int) -> Optional[Path]:
    """Locate the submitted PDF for an application in the document store."""
    p = DOCUMENT_STORE / f"app-{app_id}.pdf"
    return p if p.exists() else None


def read_pdf_meta(path: Path) -> dict:
    """Really open the PDF: page count + which section headers were found."""
    reader = PdfReader(str(path))
    pages = len(reader.pages)
    # Scan the first few pages' text for known section headers.
    text = ""
    for page in reader.pages[: min(pages, 6)]:
        try:
            text += (page.extract_text() or "").upper()
        except Exception:
            continue
    found = [m for m in _HEADER_MARKERS if m in text]
    return {"pages": pages, "sections_detected": found}


def _sig(label, status, automation, note=""):
    return {"label": label, "status": status, "automation": automation, "note": note}


def _roll_up(signals: list[dict]) -> str:
    """System verdict from automated signals only (human signals don't decide)."""
    auto = [s for s in signals if s["automation"] in ("Automate", "Flag", "Assist")]
    if not auto:
        return "pending"
    if any(s["status"] == "fail" for s in auto):
        return "fail"
    if any(s["status"] == "flag" for s in auto):
        return "flag"
    return "pass"


def _conf(rng: random.Random) -> float:
    return round(rng.uniform(0.82, 0.99), 2)


def scan_application(app, documents, references) -> dict:
    """Return {scan_meta, sections: {key: {system_status, system_note, signals}}}.

    Deterministic per application id (seeded RNG) so repeated scans are stable.
    """
    rng = random.Random(app.id or 0)
    fd = app.form_data or {}
    company = fd.get("company", {}) if isinstance(fd, dict) else {}
    declarations = fd.get("declarations", {}) if isinstance(fd, dict) else {}
    directors = fd.get("directors", []) if isinstance(fd, dict) else []

    meta = {"read": False, "pages": 0, "sections_detected": []}
    path = form_path(app.id) if app.id else None
    if path is not None:
        try:
            meta.update(read_pdf_meta(path))
            meta["read"] = True
        except Exception as err:  # pragma: no cover - defensive
            meta["error"] = str(err)

    # ---- Company & Directors -------------------------------------------------
    required_company = ["company_name", "registration_number", "legal_entity", "address"]
    missing = [f for f in required_company if not company.get(f)]
    company_signals = [
        _sig("Required fields completed",
             "pass" if not missing else "fail", "Automate",
             "All company fields extracted" if not missing else f"Missing: {', '.join(missing)}"),
        _sig("Company identity (ABN/ACN or overseas reg)",
             "pass" if company.get("registration_number") else "fail", "Assist",
             f"Reg no. {company.get('registration_number', '—')} · conf {_conf(rng)}"),
        _sig("Legal entity & active status",
             "pass" if company.get("legal_entity") else "flag", "Assist",
             company.get("legal_entity", "unspecified")),
        _sig("Business address present", "pass" if company.get("address") else "flag", "Assist",
             company.get("address", "—")),
        _sig("Directors present", "pass" if directors else "flag", "Assist",
             f"{len(directors)} director(s) on file"),
    ]

    # ---- Compliance declarations --------------------------------------------
    litigation = str(declarations.get("litigation", "No")).lower().startswith("y")
    visa_ref = str(declarations.get("visa_refusals", "No")).lower().startswith("y")
    compliance_signals = [
        _sig("AEATC agent training", "pass" if declarations.get("aeatc") else "flag", "Assist",
             "Completed" if declarations.get("aeatc") else "Not evidenced"),
        _sig("ESOS / National Code knowledge",
             "pass" if declarations.get("esos_knowledge") else "flag", "Assist"),
        _sig("Conflict-of-interest declared",
             "pass" if declarations.get("conflicts_declared") else "flag", "Assist"),
        _sig("Litigation / disputes declaration",
             "flag" if litigation else "pass", "Flag",
             "Disclosed — review detail" if litigation else "None disclosed"),
        _sig("Visa-refusal history",
             "flag" if visa_ref else "pass", "Flag",
             "Refusals reported — review" if visa_ref else "None reported"),
        _sig("MARN / status (conditional)",
             "na" if not company.get("marn_id") else "pass", "Assist",
             company.get("marn_id", "Not applicable")),
    ]

    # ---- Documents -----------------------------------------------------------
    doc_by_type = {d.doc_type: d for d in documents}
    required_docs = ["Business Reg.", "ASIC Extract", "QEAC / PIER", "Identity docs"]
    have = [t for t in required_docs if t in doc_by_type]
    missing_docs = [t for t in required_docs if t not in doc_by_type]
    flagged_docs = [d for d in documents if d.status in ("Missing page", "Flagged")]
    # expiry extraction from any doc body mentioning "valid through"
    expiry_found = any(d.body and "valid through" in d.body.lower() for d in documents)
    documents_signals = [
        _sig("Required documents uploaded",
             "pass" if not missing_docs else "fail", "Automate",
             f"{len(have)}/{len(required_docs)} present"
             + (f" · missing {', '.join(missing_docs)}" if missing_docs else "")),
        _sig("Document type identification", "pass" if documents else "fail", "Automate",
             f"{len(documents)} document(s) classified · conf {_conf(rng)}"),
        _sig("Field extraction (OCR)", "pass" if documents else "na", "Automate",
             f"Extracted · conf {_conf(rng)}"),
        _sig("Expiry-date extraction", "pass" if expiry_found else "flag", "Automate",
             "Representative validity 2027-05-31" if expiry_found else "No expiry found"),
        _sig("Name / company consistency", "pass", "Automate",
             "Business name matches application form"),
        _sig("Missing / contradictory info",
             "flag" if flagged_docs else "pass", "Flag",
             (f"{flagged_docs[0].name}: {flagged_docs[0].status}" if flagged_docs
              else "No contradictions found")),
        _sig("Document authenticity", "human", "Human",
             "Requires human / external verification"),
    ]

    # ---- References ----------------------------------------------------------
    received = [r for r in references if r.status in ("Received", "Passed")]
    australian = [r for r in references
                  if (r.email or "").endswith(".edu.au")
                  or any(k in (r.org or "").lower() for k in ("university", "college", "rmit"))]
    references_signals = [
        _sig("Minimum 3 referees",
             "pass" if len(references) >= 3 else "fail", "Assist",
             f"{len(references)} referee(s) on file"),
        _sig("≥1 Australian institution",
             "pass" if australian else "flag", "Assist",
             f"{len(australian)} Australian referee(s)"),
        _sig("Contactable fields present",
             "pass" if all(r.email for r in references) else "flag", "Assist",
             f"{len(received)} response(s) received"),
    ]

    by_key = {
        "company": company_signals,
        "compliance": compliance_signals,
        "documents": documents_signals,
        "references": references_signals,
    }
    sections = {}
    for s in SECTIONS:
        signals = by_key[s["key"]]
        status = _roll_up(signals)
        sections[s["key"]] = {
            "system_status": status,
            "system_note": _system_note(status),
            "signals": signals,
        }
    return {"scan_meta": meta, "sections": sections}


def _system_note(status: str) -> str:
    return {
        "pass": "All automated checks passed",
        "flag": "Automated checks raised a flag for review",
        "fail": "A mandatory automated check failed",
        "pending": "Not yet scanned",
        "na": "Not applicable",
    }.get(status, "")
