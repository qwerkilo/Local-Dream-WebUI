import json
import logging
import uuid
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import g, request

_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOGGERS: dict[str, logging.Logger] = {}


# ─── correlation ID ────────────────────────────────────────────────────────


def get_corr_id() -> str:
    try:
        return getattr(g, "_ldw_corr_id", "N/A")
    except RuntimeError:
        return "N/A"


def set_corr_id(corr_id: str | None = None) -> str:
    g._ldw_corr_id = corr_id or uuid.uuid4().hex[:12]
    return g._ldw_corr_id


# ─── per-category logger ───────────────────────────────────────────────────


def _ensure_logger(category: str) -> logging.Logger:
    if category not in _LOGGERS:
        _LOGGERS[category] = _build_logger(category)
    return _LOGGERS[category]


def _build_logger(category: str) -> logging.Logger:
    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(f"ldw.{category}")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    handler = RotatingFileHandler(
        _LOG_DIR / f"{category}.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(_JsonFormatter(category))
    logger.addHandler(handler)
    return logger


class _JsonFormatter(logging.Formatter):
    def __init__(self, category: str):
        super().__init__()
        self._category = category

    def format(self, record: logging.LogRecord) -> str:
        return record.getMessage()


# ─── public helpers ────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _base(category: str, level: str, **extra) -> str:
    payload = {
        "time": _now(),
        "level": level,
        "category": category,
        "corr_id": get_corr_id(),
        **extra,
    }
    return json.dumps(payload, ensure_ascii=False)


def info(category: str, message: str, **extra):
    _ensure_logger(category).info(_base(category, "INFO", message=message, **extra))


def error(category: str, message: str, exc_info=None, **extra):
    _ensure_logger(category).error(
        _base(category, "ERROR", message=message, **extra),
        exc_info=exc_info,
    )


def debug(category: str, message: str, **extra):
    _ensure_logger(category).debug(_base(category, "DEBUG", message=message, **extra))


# ─── domain shortcuts ──────────────────────────────────────────────────────


def log_request(method: str, path: str, status: int, duration_ms: float):
    _ensure_logger("request").info(
        _base(
            "request",
            "INFO",
            method=method,
            path=path,
            status=status,
            duration_ms=round(duration_ms, 1),
        )
    )


def log_operation(message: str, **extra):
    _ensure_logger("operation").info(_base("operation", "INFO", message=message, **extra))


def log_error(message: str, exc_info=None, **extra):
    _ensure_logger("error").error(
        _base("error", "ERROR", message=message, **extra),
        exc_info=exc_info,
    )


def log_sse(event_type: str | None, data_size: int, duration_ms: float = 0, **extra):
    _ensure_logger("sse").info(
        _base(
            "sse",
            "INFO",
            event_type=event_type,
            data_size=data_size,
            duration_ms=round(duration_ms, 1),
            **extra,
        )
    )


def log_debug(message: str, **extra):
    _ensure_logger("debug").debug(_base("debug", "DEBUG", message=message, **extra))


# ─── Flask integration ────────────────────────────────────────────────────


def init_app(flask_app):
    @flask_app.before_request
    def _init_context():
        set_corr_id()
        g._ldw_start = datetime.now(timezone.utc)

    @flask_app.after_request
    def _log_response(response):
        start = getattr(g, "_ldw_start", datetime.now(timezone.utc))
        dur = (datetime.now(timezone.utc) - start).total_seconds() * 1000
        log_request(request.method, request.path, response.status_code, dur)
        return response

    @flask_app.teardown_request
    def _log_teardown(exc=None):
        if exc:
            log_error(str(exc), exc_info=exc)
