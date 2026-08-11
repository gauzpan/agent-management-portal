"""Deterministic field validation + confidence scope (M2.6).

Pure functions over a normalized ApplicationDoc. Produces per-field validation
verdicts, a confidence bucket (low/neutral/high), and — where internal rules
can't confirm authenticity — an external-verification hint with a portal link
(link only; no live calls). Company-name consistency runs across the document.
"""
from __future__ import annotations

import datetime
import re

from normalize import ApplicationDoc, Field

EMAIL_RE = re.compile(r"[\w.\-]+@[\w.\-]+\.\w+")
_CURRENT_YEAR = datetime.date.today().year

# Free/personal email providers — a corporate agent should use its own domain.
FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "outlook.com",
    "aol.com", "protonmail.com", "icloud.com", "rediffmail.com", "live.com",
}

# External-verification portals (links only — no live verification in M2.6).
PORTALS = {
    "abn": ("ABN Lookup", "https://abr.business.gov.au/"),
    "acn": ("ASIC company search", "https://asic.gov.au/online-services/search-asics-registers/"),
    "overseas_reg": ("Local business registry", "https://www.gleif.org/en/"),
    "mara_id": ("MARA register", "https://www.mara.gov.au/search-the-register-of-migration-agents/"),
}


def confidence_bucket(conf: float) -> str:
    if conf >= 0.85:
        return "high"
    if conf >= 0.60:
        return "neutral"
    return "low"


def _abn_ok(v: str) -> bool:
    digits = re.sub(r"\D", "", v)
    if len(digits) != 11:
        return False
    weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    nums = [int(d) for d in digits]
    nums[0] -= 1
    return sum(w * n for w, n in zip(weights, nums)) % 89 == 0


def _acn_ok(v: str) -> bool:
    return len(re.sub(r"\D", "", v)) == 9


def _email_domain(val: str) -> str:
    m = EMAIL_RE.search(val)
    return m.group(0).split("@")[-1].lower() if m else ""


def _legitimacy(v: dict) -> float:
    """Map a verdict to a 0..1 legitimacy score — how much we trust the value is
    genuine/valid. Drives the Verified / Review / Suspect chip. Anything needing
    an external registry caps at 'Review' (0.70): the PRD makes those human/
    external verifications, never auto-confirmable."""
    if v.get("level") == "fail":
        return 0.25
    if v.get("level") == "flag":
        return 0.50
    if v.get("verify_externally"):
        return 0.70
    return 0.92


def _validate_field(f: Field) -> dict:
    """Return {ok, level, message, verify_externally, portal, portal_url}."""
    val = f.value.strip()
    na = val.upper().startswith("N/A") or val == ""
    portal = PORTALS.get(f.key)
    base = {"ok": True, "level": "pass", "message": "", "verify_externally": False,
            "portal": portal[0] if portal else "", "portal_url": portal[1] if portal else ""}

    if f.mandatory and not val:
        return {**base, "ok": False, "level": "fail", "message": "Mandatory field is missing"}

    if f.key == "abn":
        if na:
            return {**base, "level": "pass", "message": "Overseas entity — ABN not applicable",
                    "verify_externally": True}
        if not _abn_ok(val):
            return {**base, "ok": False, "level": "flag", "message": "ABN checksum failed",
                    "verify_externally": True}
        return {**base, "verify_externally": True, "message": "Format valid — verify on ABN Lookup"}

    if f.key == "acn":
        if na:
            return {**base, "message": "Not applicable"}
        if not _acn_ok(val):
            return {**base, "ok": False, "level": "flag", "message": "ACN must be 9 digits",
                    "verify_externally": True}
        return {**base, "verify_externally": True}

    if f.key == "overseas_reg":
        if "pending" in val.lower():
            return {**base, "ok": False, "level": "flag", "verify_externally": True,
                    "message": "Registration pending verification"}
        return {**base, "verify_externally": True,
                "message": "Verify with the local business registry"}

    if f.key == "mara_id":
        low = val.lower()
        if val and any(k in low for k in ("expired", "not registered", "none")):
            return {**base, "ok": False, "level": "flag", "verify_externally": True,
                    "message": "MARA / agent ID expired or not registered"}
        return {**base, "verify_externally": True,
                "message": "Migration-agent ID — verify on the MARA register"}

    if f.key == "year_founded":
        low = val.lower()
        recent = re.search(r"\b(20\d{2})\b", val)
        young = ("less than 1" in low or "less than a year" in low or "<1" in low
                 or "< 1" in low or (recent and int(recent.group(1)) >= _CURRENT_YEAR - 1))
        if young:
            return {**base, "ok": False, "level": "flag",
                    "message": "Limited operating history (< 1 yr)"}
        return base

    if f.key in ("director1", "director2") or f.key.startswith("ref"):
        m = EMAIL_RE.search(val)
        if not m:
            return {**base, "ok": False, "level": "flag", "message": "No contactable email found"}
        if _email_domain(val) in FREE_EMAIL_DOMAINS:
            return {**base, "ok": False, "level": "flag", "message": "Non-corporate (free) email domain"}
        return base

    if f.key == "litigation":
        if val.lower().startswith("y"):
            return {**base, "level": "flag", "message": "Disputes disclosed — review detail"}
        return {**base, "message": "None disclosed"}

    if f.key == "visa_refusals":
        if val.lower().startswith("y"):
            return {**base, "level": "flag", "message": "Refusals disclosed — review detail"}
        return base

    if f.key in ("aeatc", "esos_knowledge", "conflicts"):
        if not val.lower().startswith("y"):
            return {**base, "ok": False, "level": "flag", "message": "Declaration not affirmed"}
        return base

    # Default: pass if present.
    return base


def validate_doc(doc: ApplicationDoc) -> dict[str, dict]:
    """Return {field_key: verdict}. Includes cross-document company-name consistency."""
    verdicts: dict[str, dict] = {f.key: _validate_field(f) for f in doc.fields}

    # Cross-field consistency: does the applicant's declared name/company recur?
    company = (doc.by_key("company_name").value if doc.by_key("company_name") else "").lower()
    token = re.sub(r"[^a-z]", "", company.split()[0]) if company else ""
    if token:
        mentions = sum(token in (f.value or "").lower() for f in doc.fields)
        v = verdicts.get("company_name", {})
        if mentions >= 2:
            v["message"] = (v.get("message") or "") + \
                f" · Name consistent across {mentions} sections"
        else:
            v["level"] = "flag"
            v["ok"] = False
            v["message"] = "Company name not corroborated elsewhere — check for inconsistency"

    # Attach the legitimacy score once, after any cross-field adjustments above.
    for v in verdicts.values():
        v["legitimacy"] = _legitimacy(v)
    return verdicts


def summarize(doc: ApplicationDoc, verdicts: dict[str, dict]) -> dict:
    """Completeness %, needs-attention count."""
    mandatory = [f for f in doc.fields if f.mandatory]
    filled = [f for f in mandatory if f.value.strip()]
    completeness = round(100 * len(filled) / len(mandatory)) if mandatory else 100

    needs_attention = 0
    for f in doc.fields:
        v = verdicts.get(f.key, {})
        if (not v.get("ok", True)) or v.get("level") in ("flag", "fail") \
                or confidence_bucket(f.confidence) == "low" \
                or (f.mandatory and not f.value.strip()):
            needs_attention += 1
    return {"completeness": completeness, "needs_attention": needs_attention,
            "mandatory_total": len(mandatory), "mandatory_filled": len(filled)}
