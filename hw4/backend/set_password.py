"""Set a new password for an existing account (e.g. the seed Test User).

The seed accounts were hashed with settings we don't have, so they can't be
verified. This re-hashes a password you choose with the current settings
(PBKDF2-SHA256, 600,000 iterations, random salt) and logs the account out
everywhere. The password is typed at a hidden prompt, never on the command line.

Usage (from HW 4/backend):
    .venv/bin/python set_password.py test@campuscustoms.yale.edu
"""

import sys
from contextlib import closing
from getpass import getpass

from auth import get_write_connection, hash_password, init_auth_tables, password_problems


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: .venv/bin/python set_password.py <email>")
    email = sys.argv[1].strip().lower()
    init_auth_tables()

    with closing(get_write_connection()) as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = ?", (email,)).fetchone()
        if row is None:
            raise SystemExit(f"No account with email {email}")
        print(f"Setting a new password for {row['name']} <{row['email']}>")

        while True:
            pw = getpass("New password: ")
            problems = password_problems(
                pw, row["first_name"] or "", row["last_name"] or "", row["email"], row["phone"] or ""
            )
            if problems:
                print("Not accepted:\n  - " + "\n  - ".join(problems))
                continue
            if getpass("Repeat password: ") != pw:
                print("Passwords don't match. Try again.")
                continue
            break

        conn.execute("UPDATE users SET password_hash = ?, password_needs_update = 0 WHERE id = ?", (hash_password(pw), row["id"]))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        conn.commit()
    print("Done. You can log in with the new password now.")


if __name__ == "__main__":
    main()
