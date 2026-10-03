"""Accounts for Campus Customs: sign-up, login, logout, current user.

Passwords
    Stored as PBKDF2-HMAC-SHA256 with a random 16-byte salt:
        pbkdf2_sha256$<iterations>$<salt>$<hex digest>
    The seed accounts that shipped with the database use an older 3-part form
    without the iteration count (pbkdf2_sha256$<salt>$<hex digest>). At login
    the typed password is checked against that hash with the standard PBKDF2
    iteration counts (LEGACY_ITERATION_CANDIDATES). On success the hash is
    upgraded to the current format and the account is flagged
    password_needs_update, so the site asks the shopper to pick a new,
    rule-compliant password.

Recovery codes
    Whenever a password is set (register, change, reset) the account gets 8
    fresh single-use codes (XXXX-XXXX, alphabet without 0/O/1/I). Only a
    salted PBKDF2-SHA256 hash of each code is stored in `recovery_codes`;
    the plaintext is returned once in that API response and never again.

Sessions
    A random token goes to the browser in an HttpOnly cookie. Only its SHA-256
    hash is stored in the `sessions` table, so a leaked DB cannot be replayed.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel, Field

log = logging.getLogger("campus_customs.auth")

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "campus_customs.db"
COMMON_PASSWORDS_PATH = Path(__file__).resolve().parent / "common_passwords.txt"

PBKDF2_ITERATIONS = 600_000
SESSION_COOKIE = "cc_session"
SESSION_DAYS = 7
MIN_PASSWORD_LENGTH = 10  # "more than nine characters"

# Iteration counts used by common PBKDF2-SHA256 defaults (hashlib examples,
# Django and Werkzeug releases, OWASP guidance). Old hashes don't record theirs.
LEGACY_ITERATION_CANDIDATES = (1, 1_000, 10_000, 100_000, 120_000, 150_000, 180_000, 200_000, 260_000, 310_000, 390_000, 600_000)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------


def get_write_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_auth_tables() -> None:
    """Idempotent migration: add users.phone and the sessions table."""
    with closing(get_write_connection()) as conn:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        if "phone" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        if "password_needs_update" not in cols:
            conn.execute(
                "ALTER TABLE users ADD COLUMN password_needs_update INTEGER NOT NULL DEFAULT 0"
            )
        # Any account still on the old 3-part hash must pick a new password.
        conn.execute(
            """UPDATE users SET password_needs_update = 1
               WHERE password_hash LIKE 'pbkdf2_sha256$%'
                 AND password_hash NOT LIKE 'pbkdf2_sha256$%$%$%'"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS recovery_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                used_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )"""
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes (user_id)"
        )
        conn.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")
        conn.commit()


# --------------------------------------------------------------------------
# Password hashing
# --------------------------------------------------------------------------


def _pbkdf2(password: str, salt: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${_pbkdf2(password, salt, PBKDF2_ITERATIONS)}"


def is_legacy_hash(stored: str) -> bool:
    parts = stored.split("$")
    return len(parts) == 3 and parts[0] == "pbkdf2_sha256"


def _legacy_matches(password: str, salt: str, digest: str) -> bool:
    """Check an old 3-part hash: salt used as text or as hex bytes, standard iteration counts."""
    salts = [salt.encode()]
    try:
        salts.append(bytes.fromhex(salt))
    except ValueError:
        pass
    matched = False
    for salt_bytes in salts:
        for iterations in LEGACY_ITERATION_CANDIDATES:
            candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt_bytes, iterations).hex()
            # No early exit: every login on a legacy account costs the same time.
            matched |= hmac.compare_digest(candidate, digest)
    return matched


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if parts[0] != "pbkdf2_sha256":
        return False
    if len(parts) == 4 and parts[1].isdigit():
        _, iterations, salt, digest = parts
        return hmac.compare_digest(_pbkdf2(password, salt, int(iterations)), digest)
    if len(parts) == 3:
        _, salt, digest = parts
        return _legacy_matches(password, salt, digest)
    return False


# Spend the same time on unknown emails as on real ones (no user enumeration by timing).
_DUMMY_HASH = hash_password(secrets.token_hex(8))


# --------------------------------------------------------------------------
# Validation rules (mirrored in frontend/src/auth/passwordRules.ts)
# --------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _load_common_passwords() -> set[str]:
    if not COMMON_PASSWORDS_PATH.exists():
        return set()
    return {
        line.strip().lower()
        for line in COMMON_PASSWORDS_PATH.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    }


COMMON_PASSWORDS = _load_common_passwords()


def normalize_phone(phone: str) -> str:
    return re.sub(r"\D", "", phone)


def password_problems(
    password: str, first_name: str, last_name: str, email: str, phone: str
) -> list[str]:
    """Every rule the password breaks, in plain English. Empty list = OK."""
    problems: list[str] = []
    lower = password.lower()

    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Use at least {MIN_PASSWORD_LENGTH} characters.")
    if not re.search(r"\d", password):
        problems.append("Include at least one number.")
    if not re.search(r"[^A-Za-z0-9]", password):
        problems.append("Include at least one symbol (like ! ? # $).")

    # Common passwords, also with digits/symbols stripped ("Password123!" -> "password").
    letters_only = re.sub(r"[^a-z]", "", lower)
    if lower in COMMON_PASSWORDS or (len(letters_only) >= 4 and letters_only in COMMON_PASSWORDS):
        problems.append("That password is too common. Pick something less guessable.")

    for part in (first_name, last_name):
        part = part.strip().lower()
        if len(part) >= 3 and part in lower:
            problems.append("Don't use your name in your password.")
            break

    local = email.strip().lower().split("@")[0]
    if len(local) >= 3 and (local in lower or email.strip().lower() in lower):
        problems.append("Don't use your email address in your password.")

    digits = normalize_phone(phone)
    pw_digits = re.sub(r"\D", "", password)
    if len(digits) >= 7 and (digits[-7:] in pw_digits or digits[-4:] * 2 in pw_digits):
        problems.append("Don't use your phone number in your password.")

    return problems


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=254)
    phone: str = Field(max_length=30)
    password: str = Field(max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class User(BaseModel):
    id: int
    name: str
    first_name: str | None
    last_name: str | None
    email: str
    phone: str | None
    password_needs_update: bool = False
    created_at: str | None = None


class UserWithCodes(User):
    """A user plus the plaintext recovery codes, sent exactly once after a password is set."""

    recovery_codes: list[str] | None = None


def _row_to_user(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        name=row["name"],
        first_name=row["first_name"],
        last_name=row["last_name"],
        email=row["email"],
        phone=row["phone"],
        password_needs_update=bool(row["password_needs_update"]),
        created_at=row["created_at"],
    )


# --------------------------------------------------------------------------
# Recovery codes
# --------------------------------------------------------------------------

RECOVERY_CODE_COUNT = 8
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
RECOVERY_ITERATIONS = 100_000  # codes are ~40 random bits; this is plenty


def _new_recovery_code() -> str:
    raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalize_recovery_code(code: str) -> str:
    """Accept lower case, spaces, missing dash; return the canonical XXXX-XXXX (or '')."""
    raw = re.sub(r"[^A-Za-z0-9]", "", code).upper()
    return f"{raw[:4]}-{raw[4:]}" if len(raw) == 8 else ""


def _hash_recovery_code(code: str) -> str:
    salt = secrets.token_hex(16)
    return f"pbkdf2_sha256${RECOVERY_ITERATIONS}${salt}${_pbkdf2(code, salt, RECOVERY_ITERATIONS)}"


def issue_recovery_codes(conn: sqlite3.Connection, user_id: int) -> list[str]:
    """Replace every recovery code of this user with 8 new ones; return the plaintext once."""
    codes = [_new_recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    conn.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user_id,))
    conn.executemany(
        "INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)",
        [(user_id, _hash_recovery_code(c)) for c in codes],
    )
    return codes


_DUMMY_CODE_HASH = _hash_recovery_code(_new_recovery_code())


def _match_recovery_code(conn: sqlite3.Connection, user_id: int | None, code: str) -> int | None:
    """Id of the unused code that matches, else None. Always hashes RECOVERY_CODE_COUNT
    times so unknown emails / users without codes take the same time."""
    rows = []
    if user_id is not None:
        rows = conn.execute(
            "SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL",
            (user_id,),
        ).fetchall()
    stored = [(r["id"], r["code_hash"]) for r in rows][:RECOVERY_CODE_COUNT]
    stored += [(None, _DUMMY_CODE_HASH)] * (RECOVERY_CODE_COUNT - len(stored))
    match = None
    for code_id, code_hash in stored:
        if verify_password(code or "-", code_hash) and code_id is not None and match is None:
            match = code_id
    return match


# In-memory limiter for reset attempts (per process; resets on restart).
RESET_MAX_FAILS = 5  # per email
RESET_MAX_FAILS_PER_IP = 20  # looser: many shoppers can share one campus IP
RESET_WINDOW_SECONDS = 15 * 60
_reset_fails: dict[str, deque[float]] = defaultdict(deque)


def _reset_blocked(key: str, limit: int = RESET_MAX_FAILS) -> bool:
    q = _reset_fails[key]
    cutoff = time.monotonic() - RESET_WINDOW_SECONDS
    while q and q[0] < cutoff:
        q.popleft()
    return len(q) >= limit


def _note_reset_fail(*keys: str) -> None:
    now = time.monotonic()
    for key in keys:
        _reset_fails[key].append(now)


# --------------------------------------------------------------------------
# Sessions
# --------------------------------------------------------------------------


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _start_session(conn: sqlite3.Connection, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (_token_hash(token), user_id, expires.strftime("%Y-%m-%d %H:%M:%S")),
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=False,  # local dev over http; set True behind https
        path="/",
    )


def get_current_user(token: str | None) -> User | None:
    """Look up the logged-in user from a session cookie value. Reused by the chat agent."""
    if not token:
        return None
    with closing(get_write_connection()) as conn:
        row = conn.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > datetime('now')""",
            (_token_hash(token),),
        ).fetchone()
    return _row_to_user(row) if row else None


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserWithCodes, status_code=201)
def register(body: RegisterRequest, response: Response) -> UserWithCodes:
    first, last = body.first_name.strip(), body.last_name.strip()
    email = body.email.strip().lower()
    phone_digits = normalize_phone(body.phone)

    errors: dict[str, list[str]] = {}
    if not first:
        errors["first_name"] = ["Enter your first name."]
    if not last:
        errors["last_name"] = ["Enter your last name."]
    if not EMAIL_RE.match(email):
        errors["email"] = ["Enter a valid email address."]
    if not 10 <= len(phone_digits) <= 15:
        errors["phone"] = ["Enter a phone number with 10 to 15 digits."]
    pw = password_problems(body.password, first, last, email, body.phone)
    if pw:
        errors["password"] = pw
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    with closing(get_write_connection()) as conn:
        if conn.execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
            raise HTTPException(
                status_code=409,
                detail={"errors": {"email": ["An account with this email already exists. Try logging in."]}},
            )
        cur = conn.execute(
            """INSERT INTO users (name, email, password_hash, first_name, last_name, phone)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (f"{first} {last}", email, hash_password(body.password), first, last, phone_digits),
        )
        user_id = cur.lastrowid
        codes = issue_recovery_codes(conn, user_id)
        _start_session(conn, response, user_id)
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return UserWithCodes(**_row_to_user(row).model_dump(), recovery_codes=codes)


LOGIN_MAX_FAILS = 10  # per email per window — stops password guessing on one account
LOGIN_MAX_FAILS_PER_IP = 50  # per IP per window — looser, campus networks share IPs


@router.post("/login", response_model=User)
def login(body: LoginRequest, request: Request, response: Response) -> User:
    email = body.email.strip().lower()
    email_key = f"login:email:{email}"
    ip_key = f"login:ip:{request.client.host if request.client else 'unknown'}"
    if _reset_blocked(email_key, LOGIN_MAX_FAILS) or _reset_blocked(ip_key, LOGIN_MAX_FAILS_PER_IP):
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Please wait 15 minutes and try again.")
    with closing(get_write_connection()) as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = ?", (email,)).fetchone()
        ok = verify_password(body.password, row["password_hash"] if row else _DUMMY_HASH)
        if not row or not ok:
            _note_reset_fail(email_key, ip_key)
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        _reset_fails.pop(email_key, None)  # a successful sign-in clears this account's count
        if is_legacy_hash(row["password_hash"]):
            # Re-store the same password in the current format right away; the
            # flag stays on until the shopper picks a new password.
            conn.execute(
                "UPDATE users SET password_hash = ?, password_needs_update = 1 WHERE id = ?",
                (hash_password(body.password), row["id"]),
            )
            log.info("Upgraded legacy password hash for user %s", row["id"])
        _start_session(conn, response, row["id"])
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
    return _row_to_user(row)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


@router.post("/change-password", response_model=UserWithCodes)
def change_password(
    body: ChangePasswordRequest, response: Response, cc_session: str | None = Cookie(default=None)
) -> UserWithCodes:
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Please log in first.")
    with closing(get_write_connection()) as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone()
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(
                status_code=422,
                detail={"errors": {"current_password": ["Your current password is incorrect."]}},
            )
        problems = password_problems(
            body.new_password, row["first_name"] or "", row["last_name"] or "", row["email"], row["phone"] or ""
        )
        if body.new_password == body.current_password:
            problems.append("Choose a password different from your current one.")
        if problems:
            raise HTTPException(status_code=422, detail={"errors": {"new_password": problems}})
        conn.execute(
            "UPDATE users SET password_hash = ?, password_needs_update = 0 WHERE id = ?",
            (hash_password(body.new_password), user.id),
        )
        # Sign out every other device; keep this browser signed in with a fresh session.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user.id,))
        codes = issue_recovery_codes(conn, user.id)
        _start_session(conn, response, user.id)
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone()
    return UserWithCodes(**_row_to_user(row).model_dump(), recovery_codes=codes)


class RegenerateCodesRequest(BaseModel):
    current_password: str = Field(max_length=128)


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


@router.post("/regenerate-recovery-codes", response_model=RecoveryCodesResponse)
def regenerate_recovery_codes(
    body: RegenerateCodesRequest, cc_session: str | None = Cookie(default=None)
) -> RecoveryCodesResponse:
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Please log in first.")
    with closing(get_write_connection()) as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user.id,)).fetchone()
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(
                status_code=422,
                detail={"errors": {"current_password": ["Your current password is incorrect."]}},
            )
        codes = issue_recovery_codes(conn, user.id)
        conn.commit()
    log.info("Regenerated recovery codes for user %s", user.id)
    return RecoveryCodesResponse(recovery_codes=codes)


class ResetPasswordRequest(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(max_length=32)
    new_password: str = Field(max_length=128)


RESET_MISMATCH = "That email and recovery code don't match."


@router.post("/reset-password", response_model=UserWithCodes)
def reset_password(body: ResetPasswordRequest, request: Request, response: Response) -> UserWithCodes:
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    email_key, ip_key = f"email:{email}", f"ip:{ip}"
    if _reset_blocked(email_key) or _reset_blocked(ip_key, RESET_MAX_FAILS_PER_IP):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait 15 minutes and try again.")
    code = normalize_recovery_code(body.code)
    with closing(get_write_connection()) as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = ?", (email,)).fetchone()
        code_id = _match_recovery_code(conn, row["id"] if row else None, code)
        if row is None or code_id is None:
            _note_reset_fail(email_key, ip_key)
            raise HTTPException(status_code=400, detail=RESET_MISMATCH)
        problems = password_problems(
            body.new_password, row["first_name"] or "", row["last_name"] or "", row["email"], row["phone"] or ""
        )
        if problems:  # the code is not used up; the shopper can fix the password and retry
            raise HTTPException(status_code=422, detail={"errors": {"new_password": problems}})
        conn.execute(
            "UPDATE users SET password_hash = ?, password_needs_update = 0 WHERE id = ?",
            (hash_password(body.new_password), row["id"]),
        )
        conn.execute("UPDATE recovery_codes SET used_at = datetime('now') WHERE id = ?", (code_id,))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        codes = issue_recovery_codes(conn, row["id"])  # replaces the old set, used one included
        _start_session(conn, response, row["id"])
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
    _reset_fails.pop(email_key, None)
    log.info("Password reset with a recovery code for user %s", row["id"])
    return UserWithCodes(**_row_to_user(row).model_dump(), recovery_codes=codes)


@router.post("/logout", status_code=204)
def logout(response: Response, cc_session: str | None = Cookie(default=None)) -> Response:
    if cc_session:
        with closing(get_write_connection()) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(cc_session),))
            conn.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=User)
def me(cc_session: str | None = Cookie(default=None)) -> User:
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in.")
    return user
