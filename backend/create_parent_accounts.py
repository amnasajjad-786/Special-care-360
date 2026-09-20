"""
create_parent_accounts.py -- provision a guardian account per unlinked student.

WHY
---
Parent-facing pages (Students, Daily Care, Fees, Teletherapy, Home Plan) are
authorised by `students.parentId == request.auth.uid`. A student with no
guardian account therefore has no parent-side view at all, which makes those
features impossible to demonstrate or test.

This creates one Firebase Auth user per student that has no parentId, writes
the matching users/{uid} profile, and links it to the child.

ACCOUNTS ARE CREATED APPROVED
-----------------------------
Self-registration through the UI always lands in the pending queue and cannot
grant its own role -- that is enforced in firestore.rules and is deliberate.
This script runs through the Admin SDK, which bypasses those rules, and is the
supported way for an administrator to provision an account directly. It is the
same path seed_firestore.py and create_parent.py already use.

PASSWORDS
---------
By default each account gets its own generated password, printed once and
written to a timestamped, gitignored file in this directory. Set
SEED_PARENT_PASSWORD to use one shared password instead, which is easier when
you just want to click through a demo.

USAGE
-----
    python create_parent_accounts.py                    # report only
    python create_parent_accounts.py --apply            # create and link

Safe to re-run: students that already have a guardian are skipped, and an
existing Auth account for a derived address is reused rather than duplicated.
"""

import argparse
import datetime
import json
import os
import re
import secrets
import string
import sys

sys.path.insert(0, os.path.dirname(__file__))

from firebase_admin import auth  # noqa: E402
from firebase_admin_init import init_firebase, get_db  # noqa: E402

EMAIL_DOMAIN = "specialcare360.com"


def slugify(name: str) -> str:
    """'Ayesha Liaqat' -> 'ayesha.liaqat'. Full name, not first name, so two
    students sharing a first name do not collide onto one address."""
    cleaned = re.sub(r"[^a-z0-9\s]", "", name.casefold()).strip()
    return ".".join(part for part in cleaned.split() if part) or "guardian"


def generate_password() -> str:
    """Satisfies the registration rules the UI enforces: >=8 chars, upper,
    lower, digit and symbol."""
    alphabet = string.ascii_letters + string.digits
    body = "".join(secrets.choice(alphabet) for _ in range(12))
    return "Sc{}!{}".format(secrets.choice(string.ascii_uppercase), body)


def main():
    parser = argparse.ArgumentParser(
        description="Create and link a guardian account for every student without one."
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually create the accounts. Without it, the script only reports.",
    )
    args = parser.parse_args()

    init_firebase()
    db = get_db()

    if not hasattr(db, "batch"):
        print(
            "This script needs real Firestore. serviceAccountKey.json was not found,\n"
            "so the backend fell back to the in-memory mock database."
        )
        sys.exit(1)

    shared_password = os.getenv("SEED_PARENT_PASSWORD")

    print("Special Care 360 -- guardian account provisioning")
    print("=" * 66)
    print("Mode:     {}".format("APPLY (accounts will be created)" if args.apply else "DRY RUN (no changes)"))
    print("Password: {}".format(
        "shared, from SEED_PARENT_PASSWORD" if shared_password else "generated per account"
    ))
    print()

    unlinked = []
    for doc in db.collection("students").stream():
        data = doc.to_dict() or {}
        parent_id = (data.get("parentId") or "").strip()
        if parent_id:
            continue
        unlinked.append({
            "id": doc.id,
            "name": (data.get("name") or "Unknown").strip(),
            "centerId": data.get("centerId"),
        })

    if not unlinked:
        print("Every student already has a guardian linked. Nothing to do.")
        return

    print("{:<18}{:<40}".format("Student", "Guardian address"))
    print("-" * 58)
    for student in unlinked:
        student["email"] = "parent.{}@{}".format(slugify(student["name"]), EMAIL_DOMAIN)
        print("{:<18}{:<40}".format(student["name"][:17], student["email"]))
    print("-" * 58)
    print("{} account(s) to provision.".format(len(unlinked)))
    print()

    if not args.apply:
        print("Dry run complete. Re-run with --apply to create and link them.")
        return

    created = []
    for student in unlinked:
        email = student["email"]
        password = shared_password or generate_password()

        try:
            uid = auth.get_user_by_email(email).uid
            status = "reused existing Auth account"
            password = None  # untouched, so we must not claim to know it
        except Exception:
            try:
                uid = auth.create_user(
                    email=email,
                    password=password,
                    display_name="Guardian of {}".format(student["name"]),
                ).uid
                status = "created"
            except Exception as err:
                print("FAILED {}: {}".format(email, err))
                continue

        db.collection("users").document(uid).set({
            "uid": uid,
            "name": "Guardian of {}".format(student["name"]),
            "email": email,
            "role": "parent",
            "centerId": student["centerId"],
            "status": "approved",
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
        db.collection("students").document(student["id"]).update({"parentId": uid})

        created.append({
            "student": student["name"],
            "studentId": student["id"],
            "email": email,
            "uid": uid,
            "password": password,
            "status": status,
        })
        print("{:<18} {:<40} {}".format(student["name"][:17], email, status))

    print()
    if not created:
        print("No accounts were created.")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(os.path.dirname(__file__), "parent-credentials-{}.json".format(stamp))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(created, fh, indent=2, ensure_ascii=False)

    print("Credentials written to {}".format(os.path.basename(path)))
    print("That file is gitignored (backend/*.json). Keep it somewhere safe or")
    print("delete it once the passwords are recorded -- they cannot be recovered")
    print("afterwards, only reset.")
    print()
    print("{:<20}{:<42}{}".format("Student", "Email", "Password"))
    print("-" * 80)
    for row in created:
        print("{:<20}{:<42}{}".format(
            row["student"][:19], row["email"], row["password"] or "(unchanged)"
        ))


if __name__ == "__main__":
    main()
