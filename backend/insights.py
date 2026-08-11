"""Advisory review insights (M2.6 Step B).

Produces a short, ranked list of *advisory* insights for the reviewer — what to
look at, why, and the suggested next action. Two engines behind one interface:

  1. Rule-based (default): deterministic reasoning over the validation verdicts
     and the review summary. No external calls, always available.
  2. LLM (optional): any OpenAI-compatible Chat Completions endpoint, selected
     purely by environment. We are NOT hardcoded to a single provider.

The LLM path is fed a *de-identified, minimized* payload — field labels, verdict
levels/messages, confidence buckets and summary counts only, never the applicant's
names, emails, ABNs or other raw values. If the LLM is unconfigured, errors, or
returns something unparseable, we transparently fall back to the rules so the
feature never blocks the review.

Enable the LLM path by setting, in the backend environment:
    LLM_API_KEY      the bearer key
    LLM_BASE_URL     e.g. https://api.openai.com/v1  (any OpenAI-compatible base)
    LLM_MODEL        e.g. gpt-4o-mini, or any model the endpoint serves
Optional: LLM_TIMEOUT (seconds, default 20).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# Insight shape (one dict per insight):
#   {"severity": "high|medium|low|info", "title": str,
#    "detail": str, "action": str, "section": str}
# ---------------------------------------------------------------------------

_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}

# Supporting documents an education-agent partnership requires for approval
# (mirrors the intake form's required slots).
REQUIRED_DOC_TYPES = {"Business registration", "Education-agent training", "Identity"}
_DOC_SECTION = "Attached documents"

# Field group → the reviewer-facing tab it rolls up into (mirrors review_build).
_GROUP_TO_TAB = {
    "business": "Agent Company Overview", "people": "Agent Company Overview",
    "credentials": "Agent Company Overview", "compliance": "Compliance & Declarations",
    "recruitment": "Recruitment", "references": "References", "declaration": "Declaration",
}


def llm_configured() -> bool:
    """True when the environment names an OpenAI-compatible endpoint to call."""
    return bool(os.getenv("LLM_API_KEY") and os.getenv("LLM_BASE_URL")
                and os.getenv("LLM_MODEL"))


def generate_insights(fields: list, summary: dict, documents: list = None) -> tuple[list[dict], str]:
    """Return (insights, source). `source` is the model id or 'rules'.

    `fields` is the list of ExtractedField rows (each has .label, .group,
    .value, .confidence, .validation). `documents` is the application's
    attached supporting documents (each has .doc_type, .status, .file). Tries the
    LLM when configured, else — and on any failure — the rule engine.
    """
    documents = documents or []
    if llm_configured():
        payload = _deidentified_payload(fields, summary, documents)
        try:
            insights = _call_llm(payload)
            if insights:
                return _rank(insights), os.getenv("LLM_MODEL", "llm")
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError):
            # Any failure → silent, transparent fallback to rules.
            pass
    return _rank(_rule_based(fields, summary, documents)), "rules"


def _attachments(documents: list) -> list:
    """Only applicant-uploaded files (those backed by a stored file)."""
    return [d for d in (documents or []) if getattr(d, "file", None)]


# ---------------------------------------------------------------------------
# De-identified payload for the LLM — the *shape* of the issues, no PII.
# ---------------------------------------------------------------------------
def _deidentified_payload(fields: list, summary: dict, documents: list = None) -> dict:
    items = []
    for f in fields:
        v = f.validation or {}
        items.append({
            "field": f.label,
            "section": _GROUP_TO_TAB.get(f.group, f.group),
            "level": v.get("level", "pass"),
            "message": v.get("message", ""),
            "confidence": _bucket(f.confidence),
            "value_present": bool((f.value or "").strip()),
            "verify_externally": bool(v.get("verify_externally")),
            "corrected": bool(getattr(f, "corrected", False)),
        })
    docs = _attachments(documents)
    present = {d.doc_type for d in docs}
    by_status: dict[str, int] = {}
    for d in docs:
        by_status[d.status] = by_status.get(d.status, 0) + 1
    doc_facts = {
        "count": len(docs),
        "types_present": sorted(t for t in present if t),
        "required_missing": sorted(REQUIRED_DOC_TYPES - present),
        "by_status": by_status,
    }
    return {"summary": summary, "fields": items, "documents": doc_facts}


def _bucket(conf: float) -> str:
    return "high" if conf >= 0.85 else "neutral" if conf >= 0.60 else "low"


# ---------------------------------------------------------------------------
# LLM path — plain OpenAI-compatible Chat Completions over stdlib urllib
# (no extra dependency). Structured JSON is requested and parsed defensively.
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "You are an assistant to a compliance officer reviewing an education-agent "
    "partnership application. You are given a DE-IDENTIFIED summary of extracted "
    "fields and their automated-check verdicts — never the applicant's raw "
    "personal data. Produce advisory insights that help the human reviewer decide "
    "faster and catch risk. Do not approve or reject; you only advise. "
    "Return STRICT JSON only, matching: "
    '{"insights":[{"severity":"high|medium|low|info","title":"...",'
    '"detail":"...","action":"...","section":"..."}]}. '
    "Rank the most decision-critical insights first. Maximum 6 insights."
)


def _call_llm(payload: dict) -> list[dict]:
    base = os.environ["LLM_BASE_URL"].rstrip("/")
    url = f"{base}/chat/completions"
    body = {
        "model": os.environ["LLM_MODEL"],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
    }
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['LLM_API_KEY']}",
        },
        method="POST",
    )
    timeout = float(os.getenv("LLM_TIMEOUT", "20"))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    raw = parsed.get("insights", parsed if isinstance(parsed, list) else [])
    out = []
    for it in raw[:6]:
        if not isinstance(it, dict):
            continue
        out.append({
            "severity": it.get("severity", "info") if it.get("severity") in _SEVERITY_RANK else "info",
            "title": str(it.get("title", "")).strip()[:120],
            "detail": str(it.get("detail", "")).strip()[:400],
            "action": str(it.get("action", "")).strip()[:200],
            "section": str(it.get("section", "")).strip()[:60],
        })
    return [it for it in out if it["title"]]


# ---------------------------------------------------------------------------
# Rule-based path — deterministic advisory reasoning over the verdicts.
# ---------------------------------------------------------------------------
def _rule_based(fields: list, summary: dict, documents: list = None) -> list[dict]:
    insights: list[dict] = []
    insights.extend(_document_insights(documents))
    fails, flags, external, low_conf, free_email = [], [], [], [], []

    for f in fields:
        v = f.validation or {}
        level = v.get("level", "pass")
        sec = _GROUP_TO_TAB.get(f.group, f.group)
        if level == "fail":
            fails.append((f, sec))
        elif level == "flag":
            flags.append((f, sec))
        if v.get("verify_externally") and level != "fail":
            external.append((f, sec))
        if _bucket(f.confidence) == "low":
            low_conf.append((f, sec))
        if "free) email" in (v.get("message") or "").lower():
            free_email.append((f, sec))

    # 1) Hard failures — highest priority, they block approval.
    if fails:
        names = ", ".join(f.label for f, _ in fails[:4])
        insights.append({
            "severity": "high",
            "title": f"{len(fails)} field(s) failed a mandatory check",
            "detail": f"Failing: {names}. These block approval until resolved or overridden.",
            "action": "Open each failing field, correct the extracted value or request a corrected document from the applicant.",
            "section": fails[0][1],
        })

    # 2) Flags needing a human judgement call.
    if flags:
        names = ", ".join(f.label for f, _ in flags[:4])
        insights.append({
            "severity": "medium",
            "title": f"{len(flags)} field(s) flagged for review",
            "detail": f"Flagged: {names}. Automated checks were inconclusive — a reviewer should confirm.",
            "action": "Review the flagged values against the source document and sign off or correct them.",
            "section": flags[0][1],
        })

    # 3) External-registry verifications the system cannot self-confirm.
    if external:
        names = ", ".join(f.label for f, _ in external[:4])
        insights.append({
            "severity": "medium",
            "title": f"{len(external)} field(s) need external verification",
            "detail": f"{names} can only be confirmed on an external registry (ABN Lookup, ASIC, MARA, etc.).",
            "action": "Use the 'Verify externally' links on each field and record the outcome before approving.",
            "section": external[0][1],
        })

    # 4) Non-corporate email — a soft integrity signal worth noting.
    if free_email:
        insights.append({
            "severity": "low",
            "title": "Contact uses a free/personal email domain",
            "detail": "One or more key contacts use a personal email provider rather than a company domain.",
            "action": "Confirm the contact is authorised to represent the business; prefer a corporate address on the agreement.",
            "section": free_email[0][1],
        })

    # 5) Low-confidence extractions — the OCR may be wrong, not the applicant.
    if low_conf:
        names = ", ".join(f.label for f, _ in low_conf[:4])
        insights.append({
            "severity": "low",
            "title": f"{len(low_conf)} field(s) extracted with low confidence",
            "detail": f"{names} were read with low confidence — the value on file may not match the document.",
            "action": "Spot-check these against the source PDF; correct inline if the extraction is wrong.",
            "section": low_conf[0][1],
        })

    # 6) Completeness posture — an overall read.
    comp = summary.get("completeness", 0)
    if comp < 100:
        insights.append({
            "severity": "medium" if comp < 70 else "low",
            "title": f"Application {comp}% complete on mandatory fields",
            "detail": f"{summary.get('mandatory_filled', 0)} of {summary.get('mandatory_total', 0)} mandatory fields are populated.",
            "action": "Request the missing information from the applicant before progressing to agreement.",
            "section": "",
        })

    # Clean bill of health.
    if not insights:
        insights.append({
            "severity": "info",
            "title": "No issues detected by automated checks",
            "detail": "Every extracted field passed and mandatory coverage is complete. Proceed with human sign-off.",
            "action": "Complete section sign-offs and approve when satisfied.",
            "section": "",
        })
    return insights


def _document_insights(documents: list) -> list[dict]:
    """Advisory rules over the applicant's attached supporting documents."""
    docs = _attachments(documents)
    if not docs:
        return [{
            "severity": "high",
            "title": "No supporting documents attached",
            "detail": "The application has no supporting documents. Business/company "
                      "registration, an education-agent training certificate, and proof of "
                      "identity are required for an education-agent partnership.",
            "action": "Request the required documents from the applicant before approving.",
            "section": _DOC_SECTION,
        }]
    out: list[dict] = []
    present = {d.doc_type for d in docs}
    missing = sorted(REQUIRED_DOC_TYPES - present)
    if missing:
        out.append({
            "severity": "high",
            "title": f"{len(missing)} required document(s) missing",
            "detail": f"Missing: {', '.join(missing)}. These are mandatory for approval.",
            "action": "Request the missing documents from the applicant.",
            "section": _DOC_SECTION,
        })
    flagged = [d for d in docs if d.status in ("Flagged", "Missing page")]
    if flagged:
        out.append({
            "severity": "medium",
            "title": f"{len(flagged)} document(s) flagged in review",
            "detail": "One or more attached documents were flagged by the reviewer.",
            "action": "Resolve the issue or request a corrected document.",
            "section": _DOC_SECTION,
        })
    pending = [d for d in docs if d.status not in ("Verified", "Not required", "Flagged", "Missing page")]
    if pending:
        out.append({
            "severity": "low",
            "title": f"{len(pending)} document(s) awaiting verification",
            "detail": "Attached documents have not yet been verified against the application.",
            "action": "Open each attached document and mark it verified.",
            "section": _DOC_SECTION,
        })
    return out


def _rank(insights: list[dict]) -> list[dict]:
    return sorted(insights, key=lambda i: _SEVERITY_RANK.get(i.get("severity"), 3))
