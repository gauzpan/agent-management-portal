"""Turn a normalized ApplicationDoc + validation into DB review state (M2.6).

Builds ExtractedField rows (per field, retaining the original OCR value) and
rolls fields up into group-level ReviewSection rows so the existing two-tier
sign-off, sidebar timeline, and approval gate keep working on extracted apps.
"""
from __future__ import annotations

from normalize import ApplicationDoc
from validate import confidence_bucket

# Which automation class each field-group's checks fall under (PRD matrix, coarse).
GROUP_AUTOMATION = {
    "business": "Assist", "people": "Assist", "credentials": "Assist",
    "compliance": "Assist", "recruitment": "Automate", "references": "Assist",
    "declaration": "Human",
}

# Review tabs: field-groups roll up into fewer, reviewer-facing sections. Business,
# Directors (people) and Credentials all describe the agent's company, so they
# collapse into one "Agent Company Overview" tab.
TAB_ORDER = ["company_overview", "compliance", "recruitment", "references", "declaration"]
TAB_LABELS = {
    "company_overview": "Agent Company Overview",
    "compliance": "Compliance & Declarations", "recruitment": "Recruitment",
    "references": "References", "declaration": "Declaration",
}
GROUP_TO_TAB = {
    "business": "company_overview", "people": "company_overview",
    "credentials": "company_overview", "compliance": "compliance",
    "recruitment": "recruitment", "references": "references",
    "declaration": "declaration",
}
# Mandatory sign-off tabs gate approval.
MANDATORY_TABS = {"company_overview", "compliance", "references"}


def build_extracted_rows(app_id: int, doc: ApplicationDoc, verdicts: dict, engine: str) -> list:
    """One ExtractedField per normalized field (import model lazily to avoid cycle)."""
    from models import ExtractedField
    rows = []
    for f in doc.fields:
        verdict = verdicts.get(f.key, {})
        # Displayed confidence IS the legitimacy score (how much we trust the value
        # is genuine), not the raw extraction heuristic. Falls back to extraction
        # confidence if a field has no verdict.
        rows.append(ExtractedField(
            application_id=app_id, key=f.key, group=f.group, label=f.label,
            value=f.value, ocr_value=f.value,
            confidence=verdict.get("legitimacy", f.confidence),
            page=f.page, source_engine=engine, corrected=False,
            validation=verdict,
        ))
    return rows


def build_sections(app_id: int, doc: ApplicationDoc, verdicts: dict) -> list:
    """Roll fields into ReviewSection rows, one per populated review tab.

    Field-groups map into tabs via GROUP_TO_TAB, so business/people/credentials
    collapse into the single 'company_overview' tab. Per-signal automation stays
    keyed off the field's original group.
    """
    from models import ReviewSection
    sections = []
    for tab in TAB_ORDER:
        fields = [f for f in doc.fields if GROUP_TO_TAB.get(f.group, f.group) == tab]
        if not fields:
            continue
        signals = []
        has_fail = has_flag = False
        for f in fields:
            v = verdicts.get(f.key, {})
            level = v.get("level", "pass")
            legit = v.get("legitimacy", f.confidence)
            # low legitimacy downgrades a pass to a flag for reviewer attention.
            if level == "pass" and confidence_bucket(legit) == "low":
                level = "flag"
            if level == "fail":
                has_fail = True
            elif level == "flag":
                has_flag = True
            signals.append({
                "label": f.label,
                "status": level,
                "automation": GROUP_AUTOMATION.get(f.group, "Assist"),
                "note": v.get("message", "") or f"{confidence_bucket(legit)} confidence",
            })
        system_status = "fail" if has_fail else "flag" if has_flag else "pass"
        sections.append(ReviewSection(
            application_id=app_id, section_key=tab, label=TAB_LABELS[tab],
            mandatory=tab in MANDATORY_TABS, system_status=system_status,
            system_note={"pass": "All checks passed", "flag": "Needs review",
                         "fail": "A mandatory check failed"}[system_status],
            signals=signals,
        ))
    return sections
