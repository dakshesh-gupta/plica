import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from .config import settings

_lock = threading.RLock()  # serialises writers; SQLite is single-writer anyway

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE, did TEXT, public_jwk TEXT,
  private_wrapped BLOB, private_nonce BLOB, created_at REAL, expires_at REAL);
CREATE TABLE IF NOT EXISTS memories(
  id TEXT PRIMARY KEY, user_id TEXT, scope TEXT, sensitivity TEXT, ciphertext BLOB, nonce BLOB,
  commitment TEXT, version INTEGER DEFAULT 1, ttl_days INTEGER, expires_at REAL, max_uses INTEGER,
  uses INTEGER DEFAULT 0, is_style INTEGER DEFAULT 0, created_at REAL, confirmed_at REAL,
  status TEXT DEFAULT 'active', forgotten_at REAL, consent_sig TEXT, supersedes TEXT);
CREATE INDEX IF NOT EXISTS ix_mem_user ON memories(user_id, status);
CREATE TABLE IF NOT EXISTS item_keys(memory_id TEXT PRIMARY KEY, wrapped BLOB, nonce BLOB);
CREATE TABLE IF NOT EXISTS tombstones(
  id TEXT PRIMARY KEY, user_id TEXT, memory_id TEXT, commitment TEXT, created_at REAL, anchor TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS runs(
  id TEXT PRIMARY KEY, user_id TEXT, created_at REAL, prompt TEXT, memory_block TEXT, answer TEXT,
  scope TEXT, personal_intent INTEGER, receipt TEXT, xray TEXT, used_ids TEXT, model_label TEXT);
CREATE INDEX IF NOT EXISTS ix_runs_user ON runs(user_id, created_at);
CREATE TABLE IF NOT EXISTS snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, created_at REAL, root TEXT, reason TEXT, items TEXT);
CREATE TABLE IF NOT EXISTS dismissals(user_id TEXT, key TEXT, PRIMARY KEY(user_id, key));
CREATE TABLE IF NOT EXISTS grants(
  id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT UNIQUE, scopes TEXT, purpose TEXT,
  expires_at REAL, max_uses INTEGER, uses INTEGER DEFAULT 0, revoked INTEGER DEFAULT 0, created_at REAL);
CREATE TABLE IF NOT EXISTS ledger(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, prev_hash TEXT, kind TEXT, ref TEXT, payload_hash TEXT,
  entry_hash TEXT, tx_hash TEXT UNIQUE, created_at REAL);
"""


def _connect() -> sqlite3.Connection:
    path = Path(settings.database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with db() as c:
        c.executescript(SCHEMA)


@contextmanager
def db():
    """Transactional connection. Commits on success, rolls back on error."""
    with _lock:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
