import base64
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # dotenv is optional
    pass


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    def __init__(self) -> None:
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.gemini_rpm = int(os.getenv("GEMINI_RPM", "8"))
        self.gemini_timeout = float(os.getenv("GEMINI_TIMEOUT", "45"))
        self.gemini_fallback_stub = _bool("GEMINI_FALLBACK_STUB", True)
        self.recall_semantic = _bool("RECALL_SEMANTIC", True)
        self.coach_deep = _bool("COACH_DEEP", True)
        self.database_path = os.getenv("DATABASE_PATH", "./data/plica.db")
        self.session_ttl_hours = int(os.getenv("SESSION_TTL_HOURS", "168"))
        self.pinata_jwt = os.getenv("PINATA_JWT", "").strip()
        self.cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
        self.unused_after_days = int(os.getenv("UNUSED_AFTER_DAYS", "7"))
        self._master_key_b64 = os.getenv("MASTER_KEY", "").strip()
        self._master_key: bytes | None = None

    @property
    def master_key(self) -> bytes:
        """Key-encryption key that wraps every per-item key. Never leaves the server."""
        if self._master_key is None:
            if self._master_key_b64:
                key = base64.b64decode(self._master_key_b64)
            else:
                path = Path(self.database_path).resolve().parent / "master.key"
                path.parent.mkdir(parents=True, exist_ok=True)
                if path.exists():
                    key = base64.b64decode(path.read_text().strip())
                else:
                    key = os.urandom(32)
                    path.write_text(base64.b64encode(key).decode())
                    try:
                        os.chmod(path, 0o600)
                    except OSError:
                        pass
            if len(key) != 32:
                raise ValueError("MASTER_KEY must be base64 of exactly 32 bytes")
            self._master_key = key
        return self._master_key


settings = Settings()
