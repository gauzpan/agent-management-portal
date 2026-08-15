# Corridor — Technical Architecture

**Corridor** (formerly AMP, the *Agent Management Portal*) is a functional PWA for
onboarding and managing education-agent partners. This document describes the
production architecture as built.

- **Status:** Live on Render + Supabase. Milestones M1–M4 complete
  (M4 excludes certification/licence-expiry tracking, deferred to a later release).
- **Audience:** engineers, and PMs/stakeholders who need to reason about the system.
- **Last updated:** 2026-08-16.

---

## 1. Stack at a glance

| Layer | Technology | Where |
|---|---|---|
| Frontend | Vanilla JS (ES modules), custom hash router, PWA | `frontend/` |
| Styling | Plain CSS with design tokens | `frontend/css/` |
| Backend | Python 3 · FastAPI 0.115 + Uvicorn 0.34 | `backend/` |
| API models | Pydantic 2 schemas | `backend/schemas.py` |
| ORM / domain model | SQLModel 0.0.22 (SQLAlchemy + Pydantic) | `backend/models.py` |
| Database | Postgres (prod) / SQLite (dev), env-switched | `backend/db.py` |
| Blob storage | Supabase Storage (prod) / local disk (dev), env-switched | `backend/storage.py` |
| Document pipeline | pypdf (primary) + EasyOCR (fallback) | `backend/extract/` |
| Field parsing / validation | Label-anchored parser + rule validators | `backend/normalize.py`, `backend/validate.py` |
| Advisory AI | Pluggable OpenAI-compatible LLM + rule-based fallback | `backend/insights.py` |
| Auth | Stub token+role (→ Supabase Auth planned, M6) | `backend/main.py`, `frontend/js/store.js` |
| Hosting | Render (backend container) + Supabase (data plane) | — |

---

## 2. System diagram

```
Browser (installable PWA)
  ├─ index.html → app.js → router.js        hash-based routing
  ├─ store.js                                session (token + role) in localStorage
  ├─ api.js                                  fetch wrapper → backend REST
  ├─ pages/*.js                              one module per screen
  └─ service worker (sw.js)                  network-first for code; cache = offline fallback
        │
        │  HTTPS / JSON  (CORS allow-list — no wildcard in prod)
        ▼
FastAPI application  (Render container, Uvicorn)
  ├─ main.py            app factory, CORS, endpoint surface
  ├─ routers/           route modules
  ├─ schemas.py         request/response DTOs (Pydantic 2)
  ├─ decisions.py       onboarding state machine + tiered approval gate
  ├─ formscan.py        system-verified form scan (pypdf)
  ├─ extract/           pypdf → EasyOCR extraction pipeline
  ├─ normalize.py       label-anchored parser (→ ~35 fields)
  ├─ validate.py        ABN/ACN/email/consistency checks + confidence buckets
  ├─ insights.py        advisory AI (LLM path or deterministic rules)
  ├─ seed.py            demo/seed data
  ├─ storage.py ──────────────────────►  Supabase Storage   (PDFs, uploads, agreements)
  └─ db.py / models.py ────────────────►  Supabase Postgres  (domain tables via SQLModel)
```

---

## 3. The governing constraint

The single most important fact driving the design: **the Render container's
filesystem is ephemeral** — anything written at runtime is lost on every deploy
or restart. Two thin, environment-driven seams externalize all durable state:

- **`db.py`** — if `DATABASE_URL` is set, use Postgres (Supabase); otherwise fall
  back to local SQLite (`backend/amp.db`) for development. Handles the legacy
  `postgres://` → `postgresql://` scheme fix and `pool_pre_ping` for pooled
  connections.
- **`storage.py`** — if `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set, use
  Supabase Storage over the REST API (stdlib `urllib`, no extra deps); otherwise
  write to local disk (`backend/app-forms/`).

Consequence: **the same code runs locally and in production** — only environment
variables change. Static assets that ship inside the image (e.g. the blank
application-form template) are not managed by `storage.py`; they persist as part
of the deploy.

---

## 4. Frontend

- **No framework.** ES modules loaded from `index.html` via `app.js`.
- **Routing:** hash-based (`router.js`), with auth + role gating.
- **State/session:** `store.js` keeps `{ token, role }` in `localStorage` under
  `amp.session`.
- **API layer:** `api.js` centralizes fetch calls to the backend.
- **Styling:** design tokens (`css/tokens.css`) + app shell styles (`css/app.css`);
  green brand theme, sidebar + topbar shell.
- **PWA:** `manifest.webmanifest` + `sw.js`. The service worker is **network-first
  for app code** (so edits are never masked by a stale cache) and uses the cache
  only as an offline fallback. Bump the `CACHE` version constant in `sw.js` when
  changing the precached shell list.

**Pages** (`frontend/js/pages/`): `login`, `dashboard`, `applications`,
`application`, `agreement`, `invite`, `agents`, `agent-dashboard`,
`agent-profile`, `intake`, `marketing`, `audit`, plus `shell` and `placeholder`.

---

## 5. Backend

FastAPI app factory in `main.py`. CORS is an explicit allow-list — local dev
origins plus the deployed frontend origin from `FRONTEND_ORIGIN`; never wildcarded
in production.

### Domain model (`models.py`, SQLModel tables)

`User`, `Agent`, `Application`, `Document`, `Reference`, `Agreement`,
`GovRegistration`, `Invoice`, `MarketingAsset`, `AuditEvent`, `ExtractedField`,
`ReferenceFeedback`, `ReviewSection`.

`models.py` is the single source of truth for the schema; `db.init_db()` creates
all tables from SQLModel metadata.

### Onboarding state machine (`decisions.py`)

- `apply_decision(...)` moves an application through its status lifecycle
  (approve / reject / request-info).
- `evaluate_gate(...)` is a **tiered approval gate**: a hard block on a failed
  mandatory check, a missing required document, or a rejected review section;
  otherwise a soft warning with a logged override.
- Every state-changing action writes a tamper-evident **`AuditEvent`**.

### Review integrity (two tiers)

1. **System-verified** — `formscan.py` scans the PDF form via pypdf.
2. **Human sign-off** — per-section admin approval, tracked in `ReviewSection`.

### Document extraction pipeline (`extract/`)

Modular, base-class-driven: `pypdf_extractor.py` (primary) → `easyocr_extractor.py`
(fallback), orchestrated by `pipeline.py`. Output flows through `normalize.py`
(label-anchored parser → ~35 fields) and `validate.py` (email/ABN/ACN/consistency
checks with Low/Neutral/High confidence buckets and external-verify links).
Results persist as `ExtractedField` rows. Fields are correctable inline
(`PATCH /applications/{id}/fields/{key}`), preserving the original OCR value.

> Note: production-grade **ZDR cloud OCR** (Document AI / Textract) is planned for
> M6; the current pipeline is local (pypdf + EasyOCR).

### Advisory AI (`insights.py`)

Produces a short, ranked list of *advisory* reviewer insights (what to look at,
why, suggested action). Two engines behind one interface:

- **Rule-based** (default) — deterministic reasoning over validation verdicts and
  the review summary. No external calls; always available.
- **LLM** (optional) — any **OpenAI-compatible** Chat Completions endpoint,
  selected purely by environment (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`,
  optional `LLM_TIMEOUT`). Not hardcoded to a single provider.

The LLM path is fed a **de-identified, minimized** payload — field labels, verdict
levels/messages, confidence buckets, summary counts — never raw applicant names,
emails, or ABNs. Any failure transparently falls back to the rules, so the
feature never blocks a review.

---

## 6. API surface (selected)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/seed` | Seed demo data |
| POST | `/auth/login` | Stub login → token + role |
| GET | `/agent/me` | Current agent |
| GET/POST | `/applications` | List / create applications |
| POST | `/applications/upload` | Upload source PDF application |
| POST | `/intake` | Public/invited intake form submission |
| GET/DELETE | `/applications/{id}` | Detail / remove |
| POST | `/applications/{id}/scan` | Run extraction + form scan |
| GET/PATCH | `/applications/{id}/review[/{section_key}]` | Review sections |
| PATCH | `/applications/{id}/fields/{key}` | Correct an extracted field |
| POST | `/applications/{id}/insights` | Advisory AI insights |
| POST/PUT | `/applications/{id}/references/{ref_key}/...` | Reference request / feedback |
| PATCH | `/applications/{id}/decision` | Approve / reject / request-info |
| POST/GET | `/applications/{id}/agreement/...` | Send / fetch / upload / verify agreement |
| POST | `/applications/{id}/invite` | Invite onboarded agent |
| GET | `/agents` | Live agent directory |
| GET | `/agents/{id}` | Single agent profile + its audit activity |
| PATCH | `/agents/{id}/rating` | Set a partner rating (1–5) + note |
| PATCH | `/agents/{id}/terminate` | End partnership with a recorded reason |
| DELETE | `/agents/{id}` | Permanently remove an agent row |
| GET | `/marketing`, `/marketing/{id}/download` | Marketing collateral |
| GET | `/application-form/download` | Blank form template |
| GET/PATCH | `/documents/{id}[/download]` | Document fetch / status |
| GET | `/audit` | Audit trail |

Interactive API docs are served at `/docs` (FastAPI/OpenAPI).

---

## 7. Environments & configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (Supabase). Unset → SQLite dev fallback. |
| `SUPABASE_URL` | Supabase project URL (Storage). |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Storage service key. |
| `SUPABASE_BUCKET` | Storage bucket (default `app-forms`). |
| `FRONTEND_ORIGIN` | Deployed frontend origin, added to CORS allow-list. |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_TIMEOUT` | Optional advisory-AI LLM path. |

### Running locally

```
# Backend
cd backend && source venv/bin/activate && python3 main.py
#   → http://127.0.0.1:8000  (docs at /docs)

# Frontend
cd frontend && python3 -m http.server 8080
#   → http://127.0.0.1:8080

# Demo logins (password ignored in stub auth):
#   admin@kmc.edu.au (admin) · agent@sunriseoverseas.in (agent)
```

---

## 8. Known gaps & planned work (M6 productionization)

- **Auth is a stub.** Token + role are stored unsigned in `localStorage` and the
  password is ignored. Suitable for demos only — planned replacement is **Supabase
  Auth** (SSO/MFA) with Row-Level Security. This is the largest real-world gap:
  the audit/approval story assumes trustworthy identity.
- **OCR is local** (pypdf + EasyOCR) — planned replacement is **ZDR cloud OCR**
  (Document AI / Textract).
- **Emails / e-signature are stubbed** in the onboarding loop.
- **Accessibility:** WCAG 2.2 AA pass is planned for M6.
- **Advisory-AI provider:** the code path is provider-agnostic (any
  OpenAI-compatible endpoint via `LLM_*`). Reconcile any docs that reference a
  specific model/key with the generic `LLM_*` wiring before enabling in prod.

---

## 9. Design principles worth preserving

1. **Environment-driven seams over hardcoding.** DB and storage backends switch
   on env vars; the domain code is unaware of which backend is live.
2. **Single source of truth for the schema** — `models.py` (SQLModel), nothing
   duplicated.
3. **Graceful degradation** — advisory AI always falls back to rules; the app is
   installable and offline-capable via the service worker.
4. **Auditability by default** — every state change emits an `AuditEvent`.
5. **Data minimization** — the LLM never sees raw PII.
