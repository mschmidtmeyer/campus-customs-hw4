"""Check that the audit trail (output/audit_trail.json) is intact.

Verifies the file parses as a JSON array, `seq` runs 1, 2, 3, ... with no gaps, and
every entry's `prev_hash` / `hash` link up (SHA-256 hash chain, see backend/audit.py).
Prints OK with the head hash, or the first broken seq. Exit code 0 = OK, 1 = broken.
Read-only: it never changes the file.

Usage (from HW 4/backend):  .venv/bin/python scripts/verify_audit_trail.py [path]
Default path: env AUDIT_TRAIL_PATH, else HW 4/output/audit_trail.json.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/

import audit  # noqa: E402


def main(argv: list[str]) -> int:
    ok, message = audit.verify(argv[1] if len(argv) > 1 else None)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
