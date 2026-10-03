"""Append-only audit trail of the agent loop → output/audit_trail.json (Problem 12).

CONTRACT (Worker K calls log_event/actor_key from main.py; agent.run_chat calls record_run):

    log_event(kind, *, actor, **fields)   # never raises; never deletes anything
    actor_key(user_id, ip) -> str           # salted hash, e.g. "u:3f9a1c…" / "g:7b2e…"

kinds: "tool_call", "run_end", "blocked", "error" (plus one "genesis" entry that starts the file)
fields (all optional, short): tool, args, result, stop_reason, usage, latency_ms, detail
(also run_id, model, matches, show_on_page, at; other short scalar fields are kept too).
Every value is cleaned HERE, so a caller cannot leak data by mistake: strings are cut
short and emails, phone numbers, and secrets are redacted. Never pass chat message text.

FILE FORMAT — a JSON array, one entry per line, valid JSON after every append:

    [
    {"seq": 1, "time": "2026-10-03T17:00:00.000Z", "actor": "system", "kind": "genesis", ..., "prev_hash": "000…", "hash": "…"},
    {"seq": 2, "time": "…", "run_id": "9f2c41aa", "actor": "u:3f9a1c0b2d", "kind": "tool_call", "tool": "search_catalogue", ...}
    ]

Append = lock the file (fcntl.flock), find the closing "\\n]", write ",\\n{entry}\\n]\\n" over
it, fsync. Earlier entries are never rewritten, the file is never truncated, and this
module has no delete or clear function. Tamper evidence: `hash` = SHA-256 of the entry's
canonical JSON without `hash` (sorted keys, compact, ASCII) and `prev_hash` = the previous
entry's hash, so editing, removing, or inserting an entry breaks the chain.
`verify()` / scripts/verify_audit_trail.py check it. Path: env AUDIT_TRAIL_PATH, else
HW 4/output/audit_trail.json. Actor ids are HMAC-SHA256 with AUDIT_SALT (backend/.env,
generated on first use; never logged).
"""

from __future__ import annotations

import fcntl
import hashlib
import hmac
import io
import json
import logging
import math
import os
import re
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

log = logging.getLogger("campus_customs.audit")

BACKEND_DIR = Path(__file__).resolve().parent
ENV_PATH = BACKEND_DIR / ".env"
DEFAULT_PATH = BACKEND_DIR.parent / "output" / "audit_trail.json"

ZERO_HASH = "0" * 64
TAIL_BYTES = 65536  # entries are < 2 KB each, so the last entry is always in this tail
ARGS_MAX, RESULT_MAX, TEXT_MAX, NAME_MAX = 160, 120, 200, 64
OUTPUT_TOOL = "final_result"  # Pydantic AI's output tool: its args hold the reply text
FIELD_ORDER = (
    "tool", "args", "result", "at", "stop_reason", "usage", "latency_ms", "model",
    "matches", "show_on_page", "detail",
)
RESERVED = {"seq", "time", "run_id", "actor", "kind", "prev_hash", "hash"}
USAGE_KEYS = ("requests", "tool_calls", "input_tokens", "output_tokens")
SECRET_ENV = ("PORTKEY_API_KEY", "OPENAI_API_KEY", "CHAT_ENCRYPTION_KEY", "AUDIT_SALT")

_write_lock = threading.Lock()  # threads in this process; flock covers other processes
_salt_lock = threading.Lock()
_salt_value: bytes | None = None


def trail_path() -> Path:
    return Path(os.environ.get("AUDIT_TRAIL_PATH") or DEFAULT_PATH)


def new_run_id() -> str:
    """Short random id that groups the entries of one chat turn."""
    return secrets.token_hex(4)


# --------------------------------------------------------------------------
# Privacy: redaction and short summaries
# --------------------------------------------------------------------------

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
_PHONE = re.compile(r"\+?\(?\d[\d\s().\-]{5,20}\d")
_TOKEN = re.compile(r"[A-Za-z0-9_\-]{32,}")
_HEX = re.compile(r"[0-9a-fA-F]{32,}")
_SENSITIVE_KEY = re.compile(r"pass|token|secret|api_?key|auth|cookie|session|card|ssn", re.I)


def _phone_sub(m: re.Match) -> str:
    digits = sum(c.isdigit() for c in m.group())
    return "[phone]" if 9 <= digits <= 15 else m.group()


def _token_sub(m: re.Match) -> str:
    s = m.group()
    mixed = any(c.isupper() for c in s) and any(c.islower() for c in s) and any(c.isdigit() for c in s)
    return "[secret]" if mixed or _HEX.fullmatch(s) else s  # product ids are lowercase slugs


def redact(text: str) -> str:
    """Remove emails, phone numbers, and secret-looking tokens from a string."""
    for name in SECRET_ENV:
        value = os.environ.get(name, "").strip()
        if len(value) >= 8 and value in text:
            text = text.replace(value, "[secret]")
    text = _EMAIL.sub("[email]", text)
    text = _TOKEN.sub(_token_sub, text)  # before phones, so digits inside a key don't split it
    return _PHONE.sub(_phone_sub, text)


def _cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _clean(text: Any, limit: int) -> str:
    return _cut(redact(str(text)), limit)


def compact_args(args: Any) -> str:
    """Tool args as compact JSON (nulls dropped, sensitive keys masked), redacted, ≤160 chars."""
    if isinstance(args, str):
        try:
            args = json.loads(args or "{}")
        except ValueError:
            return _clean(args, ARGS_MAX)
    if isinstance(args, dict):
        args = {
            str(k): ("[redacted]" if _SENSITIVE_KEY.search(str(k)) else v)
            for k, v in args.items()
            if v is not None
        }
    try:
        text = json.dumps(args, separators=(",", ":"), ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        text = type(args).__name__
    return _clean(text, ARGS_MAX)


def _summary(c: Any) -> str:
    n = type(c).__name__
    if c is None:
        return "None"
    if isinstance(c, str):
        return c  # only Pydantic AI's own notes, e.g. "Final result processed."
    if isinstance(c, (bool, int, float)):
        return f"{n}: {c}"
    if n == "SearchResults":
        return f"SearchResults: {c.total_matches} matches" + (", did_you_mean" if c.did_you_mean else "")
    if n == "ProductDetail":
        return f"ProductDetail: {c.product_id}, ${c.price:.2f}, sold out: {','.join(c.sizes_sold_out) or 'none'}"
    if n == "StockResult":
        if len(c.sizes) == 1:
            z = c.sizes[0]
            state = f"{z.quantity} in stock in {z.size}" if z.in_stock else f"sold out in {z.size}"
            return f"StockResult: {c.product_id} {state}"
        if not c.sizes:
            return f"StockResult: {c.product_id} size not carried"
        ins = ",".join(z.size for z in c.sizes if z.in_stock) or "none"
        outs = ",".join(z.size for z in c.sizes if not z.in_stock) or "none"
        return f"StockResult: {c.product_id} in stock {ins}; sold out {outs}"
    if n == "CatalogueFacts":
        return f"CatalogueFacts: {len(c.garment_types)} types, {len(c.colors)} colors"
    if n == "CustomerProfile":  # never the name, email, or phone
        return f"CustomerProfile: signed_in={str(c.signed_in).lower()}"
    if n == "PastInterests":  # never the question text
        return f"PastInterests: {len(c.products)} products, {len(c.recent_questions)} questions"
    if n == "PageContext":
        return f"PageContext: {c.page}" + (f", {c.product_id}" if c.product_id else "")
    if n == "WishlistSummary":
        return f"WishlistSummary: signed_in={str(c.signed_in).lower()}, {c.count} items"
    if n == "SeasonalPicks":
        return f"SeasonalPicks: {c.season}, {len(c.products)} products"
    if isinstance(c, dict):
        return "dict: " + ",".join(str(k) for k in list(c)[:6])
    if isinstance(c, (list, tuple, set)):
        return f"{n}: {len(c)} items"
    return n  # unknown type: class name only, never field values


def summarize_result(content: Any) -> str:
    """Short, PII-free summary of a tool's return value (≤120 chars)."""
    try:
        text = _summary(content)
    except Exception:
        text = type(content).__name__
    return _clean(text, RESULT_MAX)


def usage_dict(usage: Any) -> dict[str, int] | None:
    """{requests, tool_calls, input_tokens, output_tokens} from a RunUsage or a dict."""
    if usage is None:
        return None
    if callable(usage):  # older Pydantic AI: result.usage() was a method
        usage = usage()
    get = usage.get if isinstance(usage, dict) else (lambda k, d=0: getattr(usage, k, d))
    return {k: int(get(k, 0) or 0) for k in USAGE_KEYS}


def _scalar(value: Any, limit: int) -> Any:
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return round(value, 3) if math.isfinite(value) else None
    if isinstance(value, (dict, list, tuple)):
        return compact_args(value)
    return _clean(value, limit)


def _iso(ts: Any) -> str | None:
    if not isinstance(ts, datetime):
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _now() -> str:
    return _iso(datetime.now(timezone.utc))  # type: ignore[return-value]


def _body(kind: str, actor: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Entry without seq/time/prev_hash/hash, every value cleaned, readable key order."""
    body: dict[str, Any] = {}
    if fields.get("run_id"):
        body["run_id"] = _clean(fields["run_id"], 32)
    body["actor"] = _clean(actor or "unknown", 40)
    body["kind"] = _clean(kind or "event", 24)
    extras = [k for k in fields if k not in FIELD_ORDER and k not in RESERVED]
    for key in (*FIELD_ORDER, *extras[:12]):
        value = fields.get(key)
        if value is None or not re.fullmatch(r"[a-z_][a-z0-9_]{0,31}", key):
            continue
        if key == "args":
            body[key] = compact_args(value)
        elif key == "result":
            body[key] = _clean(value, RESULT_MAX) if isinstance(value, str) else summarize_result(value)
        elif key == "usage":
            body[key] = usage_dict(value)
        elif key == "latency_ms":
            body[key] = int(value)
        elif key in ("tool", "stop_reason", "model", "at"):
            body[key] = _clean(value, NAME_MAX)
        else:
            body[key] = _scalar(value, TEXT_MAX if key == "detail" else RESULT_MAX)
    return body


# --------------------------------------------------------------------------
# The append-only writer (hash chain)
# --------------------------------------------------------------------------


def entry_hash(entry: dict[str, Any]) -> str:
    """SHA-256 of the entry's canonical JSON without "hash" (includes prev_hash → chain)."""
    body = {k: v for k, v in entry.items() if k != "hash"}
    blob = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return hashlib.sha256(blob.encode("ascii")).hexdigest()


def _line(entry: dict[str, Any]) -> bytes:
    return json.dumps(entry, separators=(", ", ": "), ensure_ascii=True, allow_nan=False).encode("ascii")


def _genesis() -> dict[str, Any]:
    return {
        "actor": "system",
        "kind": "genesis",
        "detail": "Audit trail created. Append-only JSON array; each hash covers the previous one (SHA-256).",
    }


def _tail_state(fd: int, size: int) -> tuple[int, str, int, bool]:
    """(last seq, last hash, byte offset to write at, file has entries) from the file's tail."""
    start = max(0, size - TAIL_BYTES)
    tail = os.pread(fd, size - start, start)
    stripped = tail.rstrip(b" \t\r\n")
    if not stripped.endswith(b"]"):
        raise ValueError("audit trail does not end with ']' (not appending; nothing is rewritten)")
    close = len(stripped) - 1
    pos = close - 1 if close > 0 and tail[close - 1 : close] == b"\n" else close
    before = tail[:pos].rstrip()
    if before.endswith(b"["):  # empty array
        return 0, ZERO_HASH, start + pos, False
    last_line = before.rsplit(b"\n", 1)[-1].strip().rstrip(b",")
    try:
        last = json.loads(last_line)
    except ValueError:  # hand-formatted file: fall back to a full parse
        last = json.loads(os.pread(fd, size, 0))[-1]
    if not isinstance(last, dict) or not isinstance(last.get("seq"), int) or not last.get("hash"):
        raise ValueError("last audit entry has no seq/hash")
    return last["seq"], str(last["hash"]), start + pos, True


def _append(bodies: list[dict[str, Any]]) -> None:
    """Append entries under an exclusive lock. Creates the file (with genesis) if missing."""
    path = trail_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _write_lock:
        fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            size = os.fstat(fd).st_size
            if size == 0:
                seq, prev, pos, has_entries = 0, ZERO_HASH, 0, False
            else:
                seq, prev, pos, has_entries = _tail_state(fd, size)
            if seq and not bodies:
                return  # ensure_trail() on an existing file: nothing to write
            if seq == 0:
                bodies = [_genesis(), *bodies]
            out = bytearray(b"[" if size == 0 else b"")
            for body in bodies:
                seq += 1
                entry = {"seq": seq, "time": _now(), **body, "prev_hash": prev}
                entry["hash"] = prev = entry_hash(entry)
                out += (b",\n" if has_entries else b"\n") + _line(entry)
                has_entries = True
            out += b"\n]\n"
            os.pwrite(fd, bytes(out), pos)  # overwrites only the closing "\n]\n"
            os.fsync(fd)
        finally:
            os.close(fd)  # also releases the flock


def ensure_trail() -> Path:
    """Create the trail with its genesis entry if it doesn't exist yet. Never raises."""
    try:
        _append([])
    except Exception as exc:
        log.warning("Audit trail init failed (%s)", type(exc).__name__)
    return trail_path()


def log_event(kind: str, *, actor: str, **fields: Any) -> None:
    """Append one entry. Never raises; a failed write is only a log warning."""
    try:
        _append([_body(kind, actor, fields)])
    except Exception as exc:
        log.warning("Audit trail write failed (%s); %s event not recorded", type(exc).__name__, str(kind)[:24])


# --------------------------------------------------------------------------
# Actor ids (salted, so the trail never holds a raw user id or IP)
# --------------------------------------------------------------------------


def _env_value(text: str, key: str) -> str:
    from dotenv import dotenv_values

    return (dotenv_values(stream=io.StringIO(text)).get(key) or "").strip()


def _load_or_create_salt() -> str:
    value = os.environ.get("AUDIT_SALT", "").strip()
    if value:
        return value
    try:
        fd = os.open(ENV_PATH, os.O_RDWR | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            size = os.fstat(fd).st_size
            existing = os.pread(fd, size, 0).decode("utf-8", "replace") if size else ""
            value = _env_value(existing, "AUDIT_SALT")
            if not value:
                value = secrets.token_hex(32)
                sep = "" if not existing or existing.endswith("\n") else "\n"
                os.write(fd, f"{sep}AUDIT_SALT={value}\n".encode())
                os.fsync(fd)
                log.warning("Generated a new AUDIT_SALT in backend/.env")
        finally:
            os.close(fd)
        os.chmod(ENV_PATH, 0o600)
    except OSError as exc:
        value = secrets.token_hex(32)
        log.warning("Could not save AUDIT_SALT (%s); actor ids reset on restart", type(exc).__name__)
    os.environ["AUDIT_SALT"] = value
    return value


def _salt() -> bytes:
    global _salt_value
    if _salt_value is None:
        with _salt_lock:
            if _salt_value is None:
                _salt_value = _load_or_create_salt().encode()
    return _salt_value


def actor_key(user_id: int | None, ip: str | None) -> str:
    """"u:" + 10 hex of HMAC-SHA256(user id), or "g:" + 10 hex of HMAC(ip). Never raises."""
    try:
        if user_id is not None:
            msg, prefix = f"user:{user_id}", "u:"
        elif ip:
            msg, prefix = f"ip:{ip}", "g:"
        else:
            return "g:anon"
        return prefix + hmac.new(_salt(), msg.encode(), hashlib.sha256).hexdigest()[:10]
    except Exception:
        return "g:anon"


# --------------------------------------------------------------------------
# One agent run → tool_call entries + run_end / error entry (called by agent.run_chat)
# --------------------------------------------------------------------------


def this_run(messages: Iterable[Any], history_len: int = 0) -> list[Any]:
    """The messages created by the latest run (drops replayed history), via run_id."""
    msgs = list(messages or [])
    rid = next((m.run_id for m in reversed(msgs) if getattr(m, "run_id", None)), None)
    return [m for m in msgs if getattr(m, "run_id", None) == rid] if rid else msgs[history_len:]


def _is_output_tool(name: str) -> bool:
    return name == OUTPUT_TOOL or name.startswith(OUTPUT_TOOL + "_")


def _call_args(part: Any, is_output: bool) -> str:
    try:
        args = part.args_as_dict()
    except Exception:
        args = getattr(part, "args", None)
    if is_output:  # the reply text lives here: keep only counts
        args = args if isinstance(args, dict) else {}
        args = {"matches": len(args.get("matches") or []), "show_on_page": bool(args.get("show_on_page"))}
    return compact_args(args)


def _retry_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    try:  # validation errors: field locations and types only, never the rejected input
        errs = list(content)
        locs = "; ".join(f"{'.'.join(map(str, e.get('loc', ())))}: {e.get('type', '')}" for e in errs[:3])
        return f"invalid args ({len(errs)}): {locs}"
    except Exception:
        return "invalid args"


def _outcome(ret: Any) -> str:
    if ret is None:
        return "no result (run stopped)"
    if getattr(ret, "part_kind", None) == "retry-prompt":
        return _clean("retry: " + _retry_text(ret.content), RESULT_MAX)
    text = summarize_result(ret.content)
    outcome = getattr(ret, "outcome", None) or "success"
    return text if outcome == "success" else _clean(f"{outcome}: {text}", RESULT_MAX)


def _tool_bodies(msgs: list[Any], actor: str, run_id: str) -> list[dict[str, Any]]:
    returns: dict[str, Any] = {}
    for m in msgs:
        if getattr(m, "kind", None) == "request":
            for p in m.parts:
                if getattr(p, "part_kind", None) in ("tool-return", "retry-prompt") and getattr(p, "tool_call_id", None):
                    returns[p.tool_call_id] = p
    bodies = []
    for m in msgs:
        if getattr(m, "kind", None) != "response":
            continue
        for p in m.parts:
            if getattr(p, "part_kind", None) != "tool-call":
                continue
            name = str(p.tool_name)
            ret = returns.get(p.tool_call_id)
            fields = {
                "run_id": run_id,
                "tool": name,
                "args": _call_args(p, _is_output_tool(name)),
                "result": _outcome(ret),
                "at": _iso(getattr(ret, "timestamp", None)),
            }
            bodies.append(_body("tool_call", actor, fields))
    return bodies


def _summed_usage(msgs: list[Any]) -> dict[str, int]:
    """Usage of a run that raised: add up what each model response reported."""
    responses = [m for m in msgs if getattr(m, "kind", None) == "response"]
    calls = sum(
        1
        for m in msgs
        if getattr(m, "kind", None) == "request"
        for p in m.parts
        if getattr(p, "part_kind", None) == "tool-return" and not _is_output_tool(str(p.tool_name))
    )
    return {
        "requests": len(responses),
        "tool_calls": calls,
        "input_tokens": sum(int(getattr(r.usage, "input_tokens", 0) or 0) for r in responses),
        "output_tokens": sum(int(getattr(r.usage, "output_tokens", 0) or 0) for r in responses),
    }


def error_reason(exc: BaseException) -> str:
    name = type(exc).__name__
    if name == "ContentFilterError" or "content_filter" in str(exc).lower():
        return "content_filter"
    return name


def _error_detail(exc: BaseException) -> str | None:
    if type(exc).__name__ == "UsageLimitExceeded":  # formulaic: "Exceeded the ... limit of N (...)"
        return _clean(exc, RESULT_MAX)
    status = getattr(exc, "status_code", None)
    return f"HTTP {status}" if isinstance(status, int) else None


def record_run(
    messages: Iterable[Any],
    *,
    actor: str,
    run_id: str,
    latency_ms: int,
    model: str | None = None,
    usage: Any = None,
    error: BaseException | None = None,
    matches: int | None = None,
    show_on_page: bool | None = None,
    history_len: int | None = None,
) -> int | None:
    """Log one agent run: a tool_call entry per tool call in `messages` (this run's new
    messages, or a callable returning them; with `history_len`, captured messages are
    trimmed to this run), then a run_end entry (or an error entry when `error` is set)
    with stop reason, usage, latency, and model. Returns the run's total tokens (for
    budgets). Never raises."""
    tokens = None
    try:
        msgs = messages() if callable(messages) else messages
        msgs = this_run(msgs, history_len) if history_len is not None else list(msgs or [])
        u = usage_dict(usage) if usage is not None else _summed_usage(msgs)
        tokens = u["input_tokens"] + u["output_tokens"]
        last = next((m for m in reversed(msgs) if getattr(m, "kind", None) == "response"), None)
        end: dict[str, Any] = {
            "run_id": run_id,
            "usage": u,
            "latency_ms": latency_ms,
            "model": getattr(last, "model_name", None) or model,
        }
        if error is None:
            end.update(stop_reason=getattr(last, "finish_reason", None) or "stop", matches=matches, show_on_page=show_on_page)
            kind = "run_end"
        else:
            end.update(stop_reason=error_reason(error), detail=_error_detail(error))
            kind = "error"
        _append([*_tool_bodies(msgs, actor, run_id), _body(kind, actor, end)])
    except Exception as exc:
        log.warning("Audit trail run log failed (%s)", type(exc).__name__)
    return tokens


# --------------------------------------------------------------------------
# Verification (scripts/verify_audit_trail.py)
# --------------------------------------------------------------------------


def verify(path: str | os.PathLike[str] | None = None) -> tuple[bool, str]:
    """Check the file parses as a JSON array, seq is 1,2,3… and every hash links.
    Returns (ok, message); the message names the first broken seq."""
    p = Path(path) if path else trail_path()
    try:
        with open(p, "rb") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_SH)  # wait for an in-flight append
            raw = fh.read()
    except FileNotFoundError:
        return False, f"MISSING: {p}"
    try:
        data = json.loads(raw)
    except ValueError as exc:
        return False, f"INVALID JSON: {exc}"
    if not isinstance(data, list) or not data:
        return False, "INVALID: expected a non-empty JSON array"
    prev = ZERO_HASH
    for i, entry in enumerate(data, 1):
        seq = entry.get("seq") if isinstance(entry, dict) else None
        if seq != i or isinstance(seq, bool):
            return False, f"BROKEN at seq {i}: found seq {seq!r} (entries missing, added, or reordered)"
        if entry.get("prev_hash") != prev:
            return False, f"BROKEN at seq {i}: prev_hash does not match the hash of seq {i - 1}"
        try:
            ok = entry.get("hash") == entry_hash(entry)
        except (TypeError, ValueError):
            ok = False
        if not ok:
            return False, f"BROKEN at seq {i}: hash mismatch (entry was edited)"
        prev = entry["hash"]
    return True, f"OK: {len(data)} entries, seq 1..{len(data)} contiguous, hash chain intact (head {prev[:16]})"
