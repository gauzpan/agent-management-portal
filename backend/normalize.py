"""Normalize raw extracted text into a canonical application document (M2.6).

Label-anchored, between-anchors parser: for each known form label we capture the
text that follows it, up to the next known label. Works because the City College
form prints "<Label> <value>" inline (values may wrap across lines). Each field
records its value, the page it was found on, and a heuristic confidence.

The taxonomy mirrors the groups the PRD/PM defined: business, people, credentials,
compliance, recruitment, references, declaration.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field as dc_field

from extract.base import RawExtraction

# ---------------------------------------------------------------------------
# Field specs: (key, group, label anchor, mandatory). Order matters — the parser
# captures text between one anchor and the next anchor that actually appears.
# ---------------------------------------------------------------------------
SPECS = [
    # key, group, label, mandatory
    ("company_name", "business", "Company Name", True),
    ("trading_name", "business", "Trading Name", False),
    ("overseas_reg", "business", "Overseas Registration No.", True),
    ("abn", "business", "ABN (If Available)", False),
    ("acn", "business", "ACN (If Available)", False),
    ("legal_entity", "business", "Type of Legal Entity", True),
    ("mara_id", "credentials", "MARA / Agent ID / Other ID", False),
    ("year_founded", "business", "Year Founded / Years as Agent", True),
    ("sectors", "business", "Sectors Promoted", False),
    ("activities", "business", "Main Business Activities", False),
    ("memberships", "credentials", "Professional Memberships &", False),
    ("director1", "people", "First Person (Director / Owner)", True),
    ("director2", "people", "Second Person (Key Point of Contact", False),
    ("aeatc", "compliance", "2.1 Completed Australian", True),
    ("esos_knowledge", "compliance", "2.2 Knowledge of ESOS Act", True),
    ("dha_monitor", "compliance", "2.3 Regularly monitor Home", False),
    ("conflicts", "compliance", "2.4 Understand requirement to", True),
    ("primary_purpose", "compliance", "2.5 Understand international", False),
    ("comply_advertising", "compliance", "2.6 Prepared to comply", False),
    ("use_official_material", "compliance", "2.7 Prepared to use official", False),
    ("responsibilities", "compliance", "2.8 Main responsibilities", False),
    ("compliance_method", "compliance", "2.9 How compliance will be", False),
    ("australian_rep", "compliance", "2.10 Australian Representative", False),
    ("training", "credentials", "International Recruitment Training", False),
    ("litigation", "compliance", "Past/Pending Disputes or", True),
    ("students_referred", "recruitment", "Students Referred to Australia", False),
    ("popular_courses", "recruitment", "Popular Courses & Promotion", False),
    ("visa_refusals", "compliance", "Student Visa Refusals", True),
    ("target_recruitment", "recruitment", "Target Recruitment for City", False),
    ("ref1", "references", "Reference 1", True),
    ("ref2", "references", "Reference 2", True),
    ("ref3", "references", "Reference 3", False),
    ("declaration_ack", "declaration", "4. ACKNOWLEDGEMENT AND DECLARATION", False),
    ("applicant_name", "declaration", "Applicant's Full Name", True),
    ("applicant_signature", "declaration", "Applicant's Signature", True),
]

# Human labels for display.
LABELS = {
    "company_name": "Company name", "trading_name": "Trading name",
    "overseas_reg": "Overseas registration no.", "abn": "ABN", "acn": "ACN",
    "legal_entity": "Legal entity type", "mara_id": "MARA / Agent ID",
    "year_founded": "Year founded / experience", "sectors": "Sectors promoted",
    "activities": "Main business activities", "memberships": "Professional memberships",
    "director1": "Director / owner", "director2": "Key contact",
    "aeatc": "AEATC training completed", "esos_knowledge": "ESOS / National Code knowledge",
    "dha_monitor": "Monitors DHA / Education sites", "conflicts": "Conflict-of-interest declared",
    "primary_purpose": "Primary-purpose understanding", "comply_advertising": "Complies with advertising rules",
    "use_official_material": "Uses official material", "responsibilities": "National Code responsibilities",
    "compliance_method": "Compliance method", "australian_rep": "Australian representative",
    "training": "Recruitment training undertaken", "litigation": "Litigation / disputes",
    "students_referred": "Students referred (2 yrs)", "popular_courses": "Popular courses & promotion",
    "visa_refusals": "Student visa refusals", "target_recruitment": "Target recruitment & company size",
    "ref1": "Reference 1", "ref2": "Reference 2", "ref3": "Reference 3",
    "declaration_ack": "Acknowledgement", "applicant_name": "Applicant name",
    "applicant_signature": "Applicant signature & date",
}

GROUP_ORDER = ["business", "people", "credentials", "compliance", "recruitment",
               "references", "declaration"]
GROUP_LABELS = {
    "business": "Business", "people": "Directors & People", "credentials": "Credentials",
    "compliance": "Compliance & Declarations", "recruitment": "Recruitment",
    "references": "References", "declaration": "Declaration",
}


@dataclass
class Field:
    key: str
    group: str
    label: str
    value: str
    page: int
    confidence: float
    mandatory: bool


@dataclass
class ApplicationDoc:
    fields: list[Field] = dc_field(default_factory=list)
    engine_used: str = ""
    page_count: int = 0

    def by_key(self, key: str) -> Field | None:
        return next((f for f in self.fields if f.key == key), None)


def _parse_yn(text: str) -> str:
    """A checkbox line like '✓  YES  NO' or ' YES ✓  NO' → 'Yes' / 'No'."""
    t = text.replace("\n", " ")
    yi, ni, ci = t.find("YES"), t.find("NO"), t.find("✓")
    if ci == -1 or yi == -1:
        return t.strip()
    if ni == -1:
        return "Yes"
    # Whichever of YES/NO the ✓ is closest-before decides it.
    return "Yes" if abs(ci - yi) <= abs(ci - ni) else "No"


def _clean(value: str) -> str:
    v = re.sub(r"\s+", " ", value).strip(" \t·|-")
    return v


def normalize(raw: RawExtraction) -> ApplicationDoc:
    lines = raw.lines()  # [(page, line)]
    full = [ln for _, ln in lines]
    page_of = [pg for pg, _ in lines]

    # Find the first line index where each anchor appears (as a prefix, tolerant).
    positions: dict[str, int] = {}
    for key, _, label, _ in SPECS:
        for i, ln in enumerate(full):
            if ln.strip().startswith(label):
                positions[key] = i
                break

    ordered = sorted(positions.items(), key=lambda kv: kv[1])  # (key, line_idx)
    doc = ApplicationDoc(engine_used=raw.engine_used, page_count=raw.page_count)
    spec_by_key = {s[0]: s for s in SPECS}

    for n, (key, start) in enumerate(ordered):
        _, group, label, mandatory = spec_by_key[key]
        end = ordered[n + 1][1] if n + 1 < len(ordered) else len(full)
        chunk_lines = full[start:end]
        # First line = "<label> <value>"; remaining lines are wrapped continuation.
        head = chunk_lines[0][len(label):] if chunk_lines else ""
        value = " ".join([head] + chunk_lines[1:])
        value = _clean(value)

        # Field-specific cleanup + confidence.
        conf = 0.9
        yn_keys = {"aeatc", "esos_knowledge", "dha_monitor", "conflicts",
                   "primary_purpose", "comply_advertising", "use_official_material",
                   "litigation", "visa_refusals"}
        if key in yn_keys:
            value = _parse_yn(value)
            conf = 0.95
        elif key == "legal_entity":
            m = re.search(r"([A-Za-z /]+?)✓", value)
            value = _clean(m.group(1)) if m else value
            conf = 0.88
        elif key.startswith("director"):
            gm = re.search(r"Given Name (.+?) Family Name (\S+)", value)
            pm = re.search(r"Position Held (.+?)(?: Given| Phone| Email|$)", value)
            em = re.search(r"[\w.\-]+@[\w.\-]+", value)
            name = f"{gm.group(1)} {gm.group(2)}".strip() if gm else ""
            pos = _clean(pm.group(1)) if pm else ""
            value = " · ".join(x for x in [name, pos, em.group(0) if em else ""] if x)
            conf = 0.8
        elif key.startswith("ref"):
            nm = re.search(r"Contact Name & Position (.+?) Organization", value)
            org = re.search(r"Organization (.+?) Email", value)
            em = re.search(r"[\w.\-]+@[\w.\-]+", value)
            parts = [
                _clean(nm.group(1)) if nm else "",
                _clean(org.group(1)) if org else "",
                em.group(0) if em else "",
            ]
            value = " · ".join(p for p in parts if p)
            conf = 0.82
        elif key == "applicant_signature":
            m = re.search(r"(.+?Date .+?\d{4})", value)  # keep up to the date
            value = _clean(m.group(1)) if m else _clean(value)
            conf = 0.85
        elif key == "applicant_name":
            value = _clean(re.split(r"Position", value)[0])
            conf = 0.85
        elif key == "memberships":
            value = _clean(re.sub(r"^Networks\b", "", value))
        elif key == "year_founded":
            value = _clean(re.sub(r"^Founded\b", "", value))
        elif key == "sectors":
            value = _clean(re.split(r"Organi[sz]ational", value)[0])
        elif key in ("students_referred", "popular_courses", "target_recruitment",
                     "compliance_method", "australian_rep", "training", "responsibilities"):
            # These anchors leave a trailing label fragment on the first line; drop it.
            value = _clean(re.sub(r"^(Method|Details|Undertaken|ensured|"
                                  r"\(Past 2 Years\)|College & Company Details|"
                                  r"of Education Agents under National Code)\b", "", value))
            conf = 0.85

        # Confidence drops if the value looks empty or suspiciously long/short.
        if not value:
            conf = 0.0
        elif len(value) > 400:
            conf = min(conf, 0.7)

        page = page_of[start] if start < len(page_of) else 1
        doc.fields.append(Field(key=key, group=group, label=LABELS.get(key, key),
                                value=value, page=page, confidence=round(conf, 2),
                                mandatory=mandatory))

    # Emit missing mandatory fields explicitly (value="", confidence 0).
    present = {f.key for f in doc.fields}
    for key, group, label, mandatory in SPECS:
        if mandatory and key not in present:
            doc.fields.append(Field(key=key, group=group, label=LABELS.get(key, key),
                                    value="", page=0, confidence=0.0, mandatory=True))
    return doc
