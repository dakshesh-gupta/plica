import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .api import router
from .config import settings
from .db import init_db
from .gemini import GeminiError
from .vault import VaultError

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Plica backend", version=__version__,
              description="Encrypted memory vault, approved recall, provenance receipts, Gemini chat.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["*"])


@app.on_event("startup")
def _startup() -> None:
    init_db()
    _ = settings.master_key  # fail fast on a bad MASTER_KEY


@app.exception_handler(VaultError)
async def vault_error(_: Request, e: VaultError):
    return JSONResponse({"error": str(e)}, status_code=e.status)


@app.exception_handler(GeminiError)
async def gemini_error(_: Request, e: GeminiError):
    return JSONResponse({"error": str(e), "hint": "Check GEMINI_API_KEY / free-tier quota, or set GEMINI_FALLBACK_STUB=true"},
                        status_code=502)


@app.get("/")
def root():
    return {"name": "Plica backend", "version": __version__, "docs": "/docs", "health": "/api/health"}


app.include_router(router)
