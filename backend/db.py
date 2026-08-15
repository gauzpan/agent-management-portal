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

from sqlalchemy import inspect, text
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
    """Create all tables, then apply additive column migrations.

    Import models first so they register with metadata. `create_all` creates any
    missing *tables* but never ALTERs an existing one, so a model gaining a new
    column would break queries against an already-deployed table (Postgres 500s
    on the unknown column). `_run_additive_migrations` closes that gap.
    """
    import models  # noqa: F401  (registers SQLModel tables)

    SQLModel.metadata.create_all(engine)
    _run_additive_migrations()


def _run_additive_migrations() -> None:
    """Add any model columns missing from an already-existing table (ADD COLUMN).

    Purely additive and idempotent — safe to run on every startup. Columns are
    added nullable (no NOT NULL constraint) with the model's Python default
    backfilling existing rows, so no data is touched. Non-additive changes
    (renames, drops, type changes) are out of scope and still need a real
    migration.
    """
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    for table in SQLModel.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all just made it fresh with every column
        db_cols = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in db_cols:
                continue
            coltype = col.type.compile(dialect=engine.dialect)
            default_sql = ""
            arg = getattr(col.default, "arg", None) if col.default is not None else None
            if arg is not None and not callable(arg):
                default_sql = f" DEFAULT {arg!r}" if isinstance(arg, str) else f" DEFAULT {arg}"
            ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {coltype}{default_sql}'
            try:
                with engine.begin() as conn:
                    conn.execute(text(ddl))
            except Exception as exc:  # noqa: BLE001 — never let one column crash startup
                print(f"[migrate] skipped {table.name}.{col.name}: {exc}")


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped DB session."""
    with Session(engine) as session:
        yield session
