from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings
import logging

logger = logging.getLogger("db")

def _create_engine_with_fallback():
    """Try PostgreSQL first; fall back to SQLite if unavailable."""
    if "postgresql" in settings.DB_URL:
        try:
            pg_engine = create_engine(settings.DB_URL, pool_pre_ping=True)
            # Probe the connection immediately so we know if it works
            with pg_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to PostgreSQL successfully.")
            return pg_engine
        except Exception as e:
            logger.warning(f"PostgreSQL unavailable ({e}). Falling back to SQLite.")
    sqlite_engine = create_engine(
        "sqlite:///./omniops.db",
        connect_args={"check_same_thread": False}
    )
    logger.info("Using SQLite database (omniops.db).")
    return sqlite_engine

engine = _create_engine_with_fallback()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
