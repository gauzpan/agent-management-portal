# Corridor

**Corridor** (formerly *AMP — the Agent Management Portal*) is a functional PWA for
onboarding and managing education-agent partners: intake → document review →
approval → active-agent management → registration compliance.

> **Status:** Live on Render + Supabase. Milestones M1–M4 complete; M5 (PRISMS
> compliance) partial. See [`PROGRESS.md`](PROGRESS.md) for the milestone log and
> [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full technical design.

---

## What it does

- **Admin onboarding loop** — applications list → detail review → approve / reject /
  request-info → agreement → invite, with a persisted audit trail per action.
- **Two-tier review integrity** — system-verified document scan (pypdf + EasyOCR
  fallback) plus human admin sign-off per section, gated by a tiered approval check.
- **Real document extraction** — label-anchored parser pulls ~35 fields from submitted
  PDFs, with ABN/ACN/email/consistency validation and confidence buckets.
- **Advisory AI** — pluggable OpenAI-compatible LLM path with a deterministic
  rule-based fallback.
- **Active-agent management** — agent directory + individual profiles, 1–5★ ratings,
  terminate/delete actions, and dashboard activity + top-agent widgets.
- **PRISMS compliance tracker** — 30-day registration clock keyed to signed agreements.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES modules), custom hash router, PWA |
| Styling | Plain CSS with design tokens |
| Backend | Python 3 · FastAPI + Uvicorn |
| ORM / models | SQLModel (SQLAlchemy + Pydantic 2) |
| Database | Postgres (prod) / SQLite (dev), env-switched |
| Blob storage | Supabase Storage (prod) / local disk (dev), env-switched |
| Documents | pypdf (primary) + EasyOCR (fallback) |
| Hosting | Render (backend) + Supabase (data plane) |

## Run locally

**Backend**
```bash
cd backend
source venv/bin/activate
python3 main.py          # → http://127.0.0.1:8000  (API docs at /docs)
```

**Frontend**
```bash
cd frontend
python3 -m http.server 8080   # → http://127.0.0.1:8080
```

**Login** (password ignored in dev):
- `admin@kmc.edu.au` — admin
- `agent@sunriseoverseas.in` — agent

Free the ports first if needed:
```bash
pkill -f "main:app"; pkill -f "http.server 8080"
```

## Project layout

```
backend/     FastAPI app, SQLModel domain, extraction + validation pipeline
frontend/    PWA shell, hash router, one module per screen
PRD/         product requirements
ARCHITECTURE.md, PROGRESS.md   design + milestone docs
```

## License

See [`LICENSE`](LICENSE).
