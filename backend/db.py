"""SQLite engine + session helpers for AMP (M1: local dev persistence).

Swapped for Supabase/Postgres in a later milestone. Kept intentionally thin so
the domain model in models.py is the single source of truth.
"""
from pathlib import Path
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

# amp.db lives next to this file so it is stable regardless of CWD.
DB_PATH = Path(__file__).resolve().parent / "amp.db"
SQLITE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is required because FastAPI serves requests across
# threads while sharing one SQLite connection pool.
engine = create_engine(SQLITE_URL, echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    """Create all tables. Import models first so they register with metadata."""
    import models  # noqa: F401  (registers SQLModel tables)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped DB session."""
    with Session(engine) as session:
        yield session
