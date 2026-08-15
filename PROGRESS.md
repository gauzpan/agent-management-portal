# AMP Build — Progress Log

Agent Management Portal (AMP) — functional PWA for onboarding & managing education-agent
partners. Built in vertical-slice milestones. Full roadmap:
`~/.claude/plans/help-me-plan-to-cuddly-mochi.md`.

## Where to resume
**Next up: M3 — Agent-side portal** (agent login → dashboard → marketing collateral
download → profile) + the public/invited **application intake form** feeding M2's list.
M3 is where real **file upload** + local `./uploads` storage first lands.

## How to run
- Backend: `cd backend && source venv/bin/activate && python3 main.py` → http://127.0.0.1:8000 (docs at `/docs`)
- Frontend: `cd frontend && python3 -m http.server 8080` → http://127.0.0.1:8080
- Login: `admin@kmc.edu.au` (admin) or `agent@sunriseoverseas.in` (agent); password ignored in M1.
- Free ports first if needed: `pkill -f "main:app"; pkill -f "http.server 8080"`

## Decisions locked
- SQLite now → Supabase (Auth + Postgres + RLS) in M6
- Stub login now → real auth (SSO/MFA) in M6
- Mock AI doc-review/OCR now → real ZDR OCR (Document AI/Textract) in M6

## Milestones
- [x] **M1 — Foundation** (done 2026-08-10, verified via Playwright, zero console errors)
  - Backend: FastAPI + SQLite; `/health`, `/seed`, `/auth/login`, list endpoints; 10 SQLModel tables + seed
  - Frontend: design tokens, green app shell (sidebar + topbar), hash router, auth + role gating, PWA (manifest + service worker)
  - Dashboard shows live backend counts (wiring proof); other screens are labelled placeholders
- [x] **M2 — Admin onboarding loop** (done 2026-08-10, 12/12 Playwright checks, zero console errors)
  - Applications list (filter chips) → detail (Business/Documents/Referees tabs + sidebar) → Approve/Reject/Request-info → Agreement (send) → Invite (send)
  - State-real: status persists across reload, `AuditEvent` per action. Endpoints: `GET/PATCH/POST /applications/{id}/...`; status map in `backend/decisions.py`
  - Per PM: dashboard left static, AI review UI skipped, emails/e-sign stubbed. Rich detail seeded for App-2087; others synthesized light
- [x] **M2.5 — Review Integrity** (done 2026-08-10, 13/13 Playwright checks, zero console errors)
  - Two-tier review: system-verified (local PDF scan via `formscan.py` + pypdf) + human admin sign-off per section
  - 4 form-aligned sections (Company & Directors / Compliance / Documents / References), confidence chips, dual badges, sidebar checklist timeline, Run-scan
  - Tiered approval gate (`decisions.evaluate_gate`): hard-block on failed mandatory check / missing req doc / rejected section; soft-warn + logged override otherwise
  - New: `ReviewSection` table, `Application.form_data`, `backend/app-forms/` doc store; endpoints `POST /scan`, `GET/PATCH /review`. OCR is local-simulated (real cloud OCR still M6); applies to App-2087
- [~] **M2.6 — Real extraction + advisory AI** (Step A done 2026-08-11, 11/11 Playwright checks)
  - **Step A (done):** real document pipeline — `backend/extract/` (pypdf primary + EasyOCR fallback, modular), `normalize.py` (label-anchored parser → 35 fields from the real filled PDF), `validate.py` (email/ABN/ACN/consistency + Low/Neutral/High confidence + external-verify links). New `ExtractedField` table; `/scan` rewritten (real pipeline for source_pdf apps, simulated fallback for form_data apps). Frontend: Processing state, summary widget (completeness%/needs-attention/submitted), 7 form-section tabs, confidence chips (% on hover), source-page tooltips. Showcase = **App-2090 Sino-Aus** (real `app-forms/app-2090.pdf`); App-2087 stays unscanned Sunrise.
  - **Step B (todo):** inline field correction w/ audit (`PATCH /fields/{key}`, keep ocr_value), advisory **claude-opus-5** insights widget (de-identified, structured, rule-based fallback — needs `ANTHROPIC_API_KEY`/`ant auth login` for real LLM).
- [ ] **M3 — Agent portal**: intake form + approved-agent marketing downloads
- [x] **M4 — Active-agent management** (done 2026-08-16; verified in-browser, zero console errors) — *license-expiry tracking deferred per PM*
  - Agent directory (Slice A) → **individual agent profile** (admin view, `#/agent/{id}`): performance, rating, and the agent's own audit-trail slice
  - **Ratings**: 1–5 star rating + note per agent (`PATCH /agents/{id}/rating`, audited); interactive star picker; seeded rating data
  - **Management actions**: terminate-with-reason + hard-delete, shared across the directory and profile (`agent-actions.js`); each audited
  - **Dashboard widgets** (updated 2026-08-16, per PM): compliance snapshot removed; dashboard now shows a **Recent Activity** audit feed + **Top 5 active agents by enrolment** (KPI stat cards retained)
  - **Compliance score removed** from agent-facing views (admin profile, agent self-profile, and the directory column) — the `Agent.comp` field is retained in the model, just no longer displayed
  - New: `Agent.rating/rating_count/rating_note`; endpoints `GET /agents/{id}`, `PATCH /agents/{id}/rating|terminate`, `DELETE /agents/{id}`
  - **Deferred:** certification/license validity + expiry-flag tracking (explicitly out of scope for this pass)
- [~] **M5 (partial) — PRISMS registration compliance** (done 2026-08-16; browser-verified, zero console errors)
  - **30-day tracker**: `PrismsCompliance` — clock starts when a signed agreement is verified (`Pending Upload`), flips to `Completed` when the agent's PRISMS Agent ID is detected
  - **Mocked PRISMS API** (`mock_prisms.py` + `PrismsRecord`): `GET/POST /mock/prisms/providers/{provider}/agents` ("get agent status for provider" + register)
  - **Background poller** (daemon thread, `PRISMS_POLL_INTERVAL`s, default 30) reconciles automatically; also `POST /prisms-compliance/check` (poll-now) and `/{id}/simulate-registration` (demo)
  - **Compliance Tracker page** (`#/compliance`, new nav item): live countdown, status pills (Pending Upload / Overdue / Completed), progress bars, auto-refresh; plus a compact PRISMS status banner on the agreement card. Seeds 4 illustrative trackers (2 completed, 1 pending, 1 overdue)
- [ ] **M5 (rest) — Gov reg / invoices / settings / offboarding**
- [ ] **M6 — Productionize**: Supabase, real auth, real ZDR OCR, WCAG 2.2 AA
