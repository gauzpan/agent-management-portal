# Project Context: Stateful PWA (FastAPI Server + Supabase) on macOS

## 1. Project Paradigm
Goal: Plan and Build a functional, stateful Progressive Web App (PWA).
Architecture: Split into a static PWA Frontend and a native Python-executed FastAPI Backend.
Core Feature Plan: Follow the files in PRD folder  for PRD,  business logic, data models, and API endpoints to create and plan.
Visual Blueprint: Match UI components and layouts with the html files containing static design in the claude-design folder.

## 2. Tech Stack & State Architecture
Frontend: Vanilla ES6+, Tailwind/CSS via CDN, Supabase JS Client (CDN).
Backend: FastAPI, Pydantic v2, executed natively via programmatic Uvicorn initialization.
State Layer: Supabase (Auth, PostgreSQL DB, Row Level Security).
Sync Model: Frontend reads/writes locally (IndexedDB/LocalForage) -> syncs to FastAPI/Supabase when online.

## 3. PWA & API Integration Rules
Auth: Use Supabase JWTs. Pass tokens in the Authorization: Bearer <token> header to FastAPI.
Service Worker: sw.js caches static assets and intercepts FastAPI requests for offline fallback.
API Clients: Isolate all fetch() calls to FastAPI into a dedicated api.js client module.

## 4. Coding Conventions
Frontend: Modular, component-scoped JS. Handle loading, empty, and network-error states gracefully.
Backend: Restful design, explicit type hinting, strict CORS configurations, modular routers.
Main Script: Server entrypoint must contain if __name__ == "__main__": uvicorn.run(...).

## 5. macOS Development Workflow Commands
Environment Setup: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
Run Backend: python3 main.py (Binds to http://127.0.0.1:8000)
Run Frontend: python3 -m http.server 8080 (Binds to http://127.0.0.1:8080)
API Docs: Interactive Swagger UI available at http://127.0.0

## 6. Stop Conditions
Scheme Mismatch: Halt if Frontend data models deviate from FastAPI Pydantic schemas.
Auth Gaps: Halt if a feature requires user identity but lack an explicit Supabase Auth state check.
Sync Conflict: Ask for clarification if offline-to-online data merging behavior is ambiguous.