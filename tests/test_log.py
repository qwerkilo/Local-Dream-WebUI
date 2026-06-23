"""lib/log.py 单元测试：日志写入、分类隔离、correlation ID 传播。"""

import json
import tempfile
from pathlib import Path

import pytest

from lib import log


@pytest.fixture(autouse=True)
def tmp_dir(monkeypatch):
    """每个测试使用独立临时目录写日志文件，避免交叉污染。"""
    tmp = tempfile.mkdtemp()
    monkeypatch.setattr(log, "_LOG_DIR", Path(tmp))
    log._LOGGERS.clear()
    yield tmp
    log._LOGGERS.clear()


# ─── correlation ID ────────────────────────────────────────────────────────


def test_corr_id_generated_outside_request():
    """无 Flask 请求上下文时 get_corr_id 返回 'N/A'。"""
    assert log.get_corr_id() == "N/A"


# ─── 日志写入验证 ──────────────────────────────────────────────────────────


def _read_log(tmp_dir: str, category: str) -> list[dict]:
    path = Path(tmp_dir) / f"{category}.log"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").strip().splitlines() if line]


def test_log_operation_writes_to_operation_log(tmp_dir):
    log.log_operation("test-op", key="val")
    entries = _read_log(tmp_dir, "operation")
    assert len(entries) == 1
    assert entries[0]["message"] == "test-op"
    assert entries[0]["key"] == "val"
    assert entries[0]["category"] == "operation"
    assert entries[0]["level"] == "INFO"


def test_log_error_writes_to_error_log(tmp_dir):
    try:
        raise ValueError("boom")
    except ValueError:
        log.log_error("test-error", exc_info=True)

    entries = _read_log(tmp_dir, "error")
    assert len(entries) == 1
    assert entries[0]["message"] == "test-error"
    assert entries[0]["level"] == "ERROR"
    assert entries[0]["category"] == "error"


def test_log_error_without_exc_info(tmp_dir):
    log.log_error("plain-error")
    entries = _read_log(tmp_dir, "error")
    assert len(entries) == 1
    assert entries[0]["message"] == "plain-error"


def test_log_sse_writes_to_sse_log(tmp_dir):
    log.log_sse("progress", data_size=128, duration_ms=5.2)
    entries = _read_log(tmp_dir, "sse")
    assert len(entries) == 1
    assert entries[0]["event_type"] == "progress"
    assert entries[0]["data_size"] == 128
    assert entries[0]["duration_ms"] == 5.2


def test_log_debug_writes_to_debug_log(tmp_dir):
    log.log_debug("debug-msg", detail="xyz")
    entries = _read_log(tmp_dir, "debug")
    assert len(entries) == 1
    assert entries[0]["message"] == "debug-msg"
    assert entries[0]["detail"] == "xyz"
    assert entries[0]["level"] == "DEBUG"


def test_log_request_writes_to_request_log(tmp_dir):
    log.log_request("POST", "/test", 200, 42.0)
    entries = _read_log(tmp_dir, "request")
    assert len(entries) == 1
    assert entries[0]["method"] == "POST"
    assert entries[0]["path"] == "/test"
    assert entries[0]["status"] == 200
    assert entries[0]["duration_ms"] == 42.0


def test_log_request_has_corr_id(tmp_dir):
    from flask import Flask
    app_ = Flask(__name__)
    with app_.app_context():
        from lib.log import set_corr_id
        set_corr_id("test-corr")
        log.log_request("GET", "/x", 404, 10.0)
    entries = _read_log(tmp_dir, "request")
    assert entries[0]["corr_id"] == "test-corr"


# ─── 分类隔离 ──────────────────────────────────────────────────────────────


def test_categories_are_separate_files(tmp_dir):
    """每个分类写入各自的日志文件，互不交叉。"""
    log.log_operation("op")
    log.log_error("err")
    log.log_debug("dbg")
    log.log_sse("complete", 0)
    log.log_request("GET", "/", 200, 0)

    for cat in ("operation", "error", "debug", "sse", "request"):
        assert _read_log(tmp_dir, cat), f"{cat}.log should not be empty"


# ─── json 合法性 ────────────────────────────────────────────────────────────


def test_all_log_entries_are_valid_json(tmp_dir):
    """每条日志都是合法的 JSON 行。"""
    log.log_operation("msg1", n=1)
    log.log_operation("msg2", n=2)
    log.log_error("e1")
    log.log_debug("d1")

    for cat in ("operation", "error", "debug"):
        for line in _read_log(tmp_dir, cat):
            assert isinstance(line, dict)


# ─── Flask 请求中间件 ─────────────────────────────────────────────────────


def test_flask_middleware_logs_request(tmp_dir):
    """Flask 应用经过 init_app 后，每次请求自动写 request.log。"""
    from flask import Flask

    flask_app = Flask(__name__)
    log.init_app(flask_app)

    @flask_app.route("/ping")
    def ping():
        return "ok"

    client = flask_app.test_client()
    resp = client.get("/ping")
    assert resp.status_code == 200

    entries = _read_log(tmp_dir, "request")
    assert len(entries) >= 1
    assert entries[0]["method"] == "GET"
    assert entries[0]["path"] == "/ping"
    assert entries[0]["status"] == 200


def test_flask_middleware_corr_id_on_each_request(tmp_dir):
    """每个请求产生不同的 correlation ID。"""
    from flask import Flask

    flask_app = Flask(__name__)
    log.init_app(flask_app)

    @flask_app.route("/echo")
    def echo():
        return log.get_corr_id()

    client = flask_app.test_client()
    r1 = client.get("/echo")
    r2 = client.get("/echo")
    id1 = r1.data.decode()
    id2 = r2.data.decode()
    assert id1 != "N/A"
    assert id2 != "N/A"
    assert id1 != id2


def test_flask_middleware_error_logs_to_error_log(tmp_dir):
    """请求抛出异常时写 error.log（Flask 捕获后返回 500）。"""
    from flask import Flask

    flask_app = Flask(__name__)
    log.init_app(flask_app)

    @flask_app.route("/crash")
    def crash():
        raise RuntimeError("crash-test")

    client = flask_app.test_client()
    resp = client.get("/crash")
    assert resp.status_code == 500

    entries = _read_log(tmp_dir, "error")
    assert len(entries) >= 1
    assert "crash-test" in entries[0]["message"]
