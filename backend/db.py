"""Database engine + session helpers for AMP.

Persistence is environment-driven so the same code runs locally and on a hosted
web server:

- DATABASE_URL set (e.g. Supabase/Render Postgres) -> use Postgres. Required in
  production: a hosted container's local disk is ephemeral, so a file-based
  SQLite DB does NOT survive deploys/restarts.
- otherwise -> local SQLite (backend/amp.db) for development.

Kept intentionally thin so the domain model in models.py is the single source of
truth.
"""
import os
from pathlib import Path
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # SQLAlchemy needs the postgresql:// scheme; some providers hand out the
    # legacy postgres:// alias. pool_pre_ping recycles connections dropped by
    # the server (common with pooled Postgres like Supabase's pooler).
    url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(url, echo=False, pool_pre_ping=True)
else:
    # amp.db lives next to this file so it is stable regardless of CWD.
    # check_same_thread=False is required because FastAPI serves requests across
    # threads while sharing one SQLite connection pool.
    DB_PATH = Path(__file__).resolve().parent / "amp.db"
    engine = create_engine(
        f"sqlite:///{DB_PATH}", echo=False,
        connect_args={"check_same_thread": False})


def init_db() -> None:
    """Create all tables. Import models first so they register with metadata."""
    import models  # noqa: F401  (registers SQLModel tables)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped DB session."""
    with Session(engine) as session:
        yield session
