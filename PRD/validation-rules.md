# Application Review — Validation & Scoring Rules (M2.6)

This document specifies exactly how the Agent Management Portal (AMP) evaluates a
submitted agent application after text is extracted from the PDF. It is written
to drop into the PRD as the reference for the review engine's behaviour.

The engine is **deterministic and rule-based**. It never fabricates data, and
where a fact can only be confirmed by an external authority (a government
registry), it deliberately stops short of auto-confirming and routes the check to
a human with a verification link. An **advisory AI layer** sits on top; it only
summarises and advises — it never approves, rejects, or changes a value.

Source of truth in code: `backend/validate.py` (field rules + scoring),
`backend/review_build.py` (section roll-up), `backend/decisions.py`
(approval gate), `backend/insights.py` (advisory layer).

---

## 1. The review pipeline

```
PDF → extract (pypdf → EasyOCR fallback) → normalize (35 fields) →
      validate (per-field verdict + legitimacy score) →
      roll up into review sections → approval gate → advisory insights
```

Each extracted field carries: the value, the page it came from, an original
immutable OCR value, a validation verdict, and a **legitimacy score** (0–1).

---

## 2. Field-level validation rules

Every field produces a verdict with a **level**:

| Level  | Meaning                                        | Blocks approval?          |
| ------ | ---------------------------------------------- | ------------------------- |
| `pass` | Check satisfied (or nothing to check)          | No                        |
| `flag` | Inconclusive / soft concern — needs a human    | No (soft warning)         |
| `fail` | A mandatory requirement is not met             | Yes, if in a mandatory section |

### 2.0 Universal rule
- **Mandatory field is empty → `fail`** ("Mandatory field is missing"). Applies
  before any field-specific rule below.

### 2.1 Business identity

| Field | Rule | Result |
| --- | --- | --- |
| **ABN** | Marked N/A (overseas entity) | `pass` — "ABN not applicable", flagged for external check |
| | Fails the ATO 11-digit checksum | `flag` — "ABN checksum failed" + external check |
| | Valid checksum | `pass` — "Format valid — verify on ABN Lookup" + external check |
| **ACN** | Marked N/A | `pass` — "Not applicable" |
| | Not exactly 9 digits | `flag` — "ACN must be 9 digits" + external check |
| | 9 digits | `pass` + external check |
| **Overseas registration no.** | Contains "pending" | `flag` — "Registration pending verification" + external check |
| | Otherwise | `pass` — "Verify with the local business registry" + external check |
| **Year founded / experience** | < 1 year, or founding year ≥ (current year − 1) | `flag` — "Limited operating history (< 1 yr)" |
| | Otherwise | `pass` |

**ABN checksum** (the exact algorithm used): take the 11 digits, subtract 1 from
the first digit, multiply each by the weights `[10,1,3,5,7,9,11,13,15,17,19]`,
sum them; valid when the sum is divisible by 89.

### 2.2 People & contactability

Applies to **Director/owner**, **Key contact**, and **References 1–3**:

| Rule | Result |
| --- | --- |
| No email address found in the value | `flag` — "No contactable email found" |
| Email uses a free/personal domain (gmail, yahoo, hotmail, outlook, aol, protonmail, icloud, rediffmail, live) | `flag` — "Non-corporate (free) email domain" |
| Corporate email present | `pass` |

### 2.3 Credentials (external verifications)

| Field | Rule | Result |
| --- | --- | --- |
| **MARA / Agent ID** | Contains "expired", "not registered", or "none" | `flag` — "expired or not registered" + external check |
| | Otherwise | `pass` — "verify on the MARA register" + external check |

### 2.4 Compliance declarations

| Field | Rule | Result |
| --- | --- | --- |
| **AEATC training**, **ESOS/National Code knowledge**, **Conflict-of-interest** | Answer does **not** start with "Y" | `flag` — "Declaration not affirmed" |
| | Affirmed ("Yes") | `pass` |
| **Litigation / disputes** | Starts with "Y" (disputes disclosed) | `flag` — "Disputes disclosed — review detail" |
| | Otherwise | `pass` — "None disclosed" |
| **Student visa refusals** | Starts with "Y" (refusals disclosed) | `flag` — "Refusals disclosed — review detail" |
| | Otherwise | `pass` |

### 2.5 Cross-field consistency (company name)

The applicant's company name should recur through the document. The engine takes
the first word of the company name and counts how many fields mention it:

- Mentioned in **≥ 2** fields → note appended: "Name consistent across N sections".
- Mentioned in **< 2** fields → `flag` "Company name not corroborated elsewhere —
  check for inconsistency".

### 2.6 Default

Any field without a specific rule → `pass` if a value is present.

---

## 3. Legitimacy score & confidence buckets

The verdict is converted to a **legitimacy score** — how much we trust the value
is genuine. This score (not the raw OCR confidence) drives the confidence chip
shown to the reviewer.

| Condition | Score |
| --- | --- |
| Verdict is `fail` | **0.25** |
| Verdict is `flag` | **0.50** |
| Needs external verification (cannot be self-confirmed) | **0.70** (capped at "Review") |
| Clean internal pass | **0.92** |

**Confidence buckets** (used for the chip and the "low confidence" signals):

| Bucket | Range |
| --- | --- |
| High | ≥ 0.85 |
| Neutral | 0.60 – 0.84 |
| Low | < 0.60 |

> **Design principle:** anything requiring a government registry (ABN, ACN,
> overseas registration, MARA ID) is capped at **Review (0.70)** — the system
> never auto-confirms an external fact; it routes it to a human with a link.

---

## 4. Section roll-up

The 35 fields roll up into five reviewer-facing sections. Each section gets a
**system status** and an **automation class**.

| Section | Fields from groups | Mandatory (gates approval) | Automation class |
| --- | --- | --- | --- |
| Agent Company Overview | business, people, credentials | **Yes** | Assist |
| Compliance & Declarations | compliance | **Yes** | Assist |
| Recruitment | recruitment | No | Automate |
| References | references | **Yes** | Assist |
| Declaration | declaration | No | Human |

**Section system status:**
- `fail` if **any** field in the section failed.
- `flag` if any field is flagged, **or** a passing field has low legitimacy
  (a low-confidence pass is downgraded to a flag for reviewer attention).
- `pass` otherwise.

Automation classes describe how much the system does vs. the human:
**Automate** (system decides), **Assist** (system informs, human decides),
**Human** (system defers entirely).

---

## 5. Two-tier sign-off & the approval gate

Every section carries **two** independent statuses:
- **System tier** — set by the scan (`pass` / `flag` / `fail`).
- **Admin tier** — set by a human reviewer (`approved` / `rejected` / `pending`).

The **approval gate** combines both:

| Condition | Effect |
| --- | --- |
| A **mandatory** section's system check **failed** | **Hard block** |
| A section was **rejected** by the reviewer | **Hard block** |
| Any section has an automated **flag** | **Soft warning** (override with a logged reason) |
| A section is **not yet approved** by a human | **Soft warning** |
| Application not scanned yet | **Soft warning** |

- **Hard blocks** must be resolved before approval — no override.
- **Soft warnings** allow approval only with an **override reason**, which is
  written to the audit trail.

---

## 6. Inline correction (audit-safe)

A reviewer can correct any extracted value inline. On correction:
- The working value is updated; the **original OCR value is preserved** and never
  overwritten.
- The field is re-validated and re-scored, and its section's system status
  refreshes — **without** touching any human sign-off already recorded.
- A before → after entry is written to the audit trail.

---

## 7. Advisory AI layer (non-authoritative)

After scanning, an advisory layer produces a short, ranked list of insights
(`high` / `medium` / `low` / `info`), each with a title, detail, and a suggested
action. It **advises only** — it cannot approve, reject, or change a value.

**Two interchangeable engines behind one interface:**
1. **Rule-based (default):** deterministic reasoning over the verdicts —
   surfaces failed checks, flags, external verifications required, non-corporate
   emails, low-confidence extractions, and overall completeness.
2. **LLM (optional):** any OpenAI-compatible endpoint, selected by environment
   (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). It receives a **de-identified,
   minimised** payload — field labels, verdict levels, confidence buckets and
   counts only, never the applicant's raw personal data. If it is unconfigured,
   errors, or returns anything unparseable, the system **falls back to the rules
   transparently**, so the feature never blocks a review.

Insight severity mapping (rule engine):

| Insight | Severity |
| --- | --- |
| One or more mandatory checks failed | High |
| Fields flagged for review | Medium |
| Fields needing external verification | Medium |
| Completeness < 70% | Medium |
| Non-corporate email domain | Low |
| Low-confidence extractions | Low |
| Completeness 70–99% | Low |
| Nothing detected | Info |

---

## 8. Guarantees

- **No fabricated data.** Values only ever come from the applicant's document.
- **No auto-confirmation of external facts.** Registry-dependent fields are
  capped at "Review" and routed to a human.
- **Human stays in control.** The AI advises; the gate and sign-offs are the only
  things that move an application forward.
- **Everything is auditable.** Scans, corrections (with original value), sign-offs,
  overrides, and insight generation each write an audit event.
