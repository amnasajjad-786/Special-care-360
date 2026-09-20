"""
cleanup_orphans.py -- delete records that point at students which do not exist.

WHY
---
The old admin console generated billing from a hardcoded mock student list, so
`invoices` and `payments` accumulated rows naming students who were never in the
database. Separately, deleting a student left their daily care journals behind.

After the security-rules migration these records carry no usable centerId or
parentId, so the app cannot see them at all -- they are dead weight that still
shows up in collection scans and exports.

WHAT COUNTS AS ORPHANED
-----------------------
  dailyCareJournals   studentId names a student document that does not exist
  invoices, payments  no studentId AND studentName matches no student

A record is NEVER treated as orphaned just because its student name is close to
a real one. `Ali Hassan` and `Ali Hassaan` are different students as far as this
script is concerned; guessing otherwise is the bug the migration existed to fix.
Near-misses are listed separately so a human can decide.

SAFETY
------
Dry run by default. Before deleting anything, every affected document is written
to a timestamped JSON file in this directory, so a mistake is recoverable:

    python cleanup_orphans.py                  # report only
    python cleanup_orphans.py --apply          # back up, then delete

Restoring from the backup is a manual `set()` per document -- the file records
the collection, the document id and the full contents.
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from firebase_admin_init import init_firebase, get_db  # noqa: E402

BATCH_LIMIT = 400


def jsonable(value):
    """Firestore values (timestamps, refs) are not all JSON-serialisable."""
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def similar(a: str, b: str) -> bool:
    """Cheap near-miss check, used only to flag names for human review."""
    a, b = a.casefold().replace(" ", ""), b.casefold().replace(" ", "")
    if a == b:
        return True
    if abs(len(a) - len(b)) > 2:
        return False
    # count shared characters in order
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    i = 0
    for ch in longer:
        if i < len(shorter) and shorter[i] == ch:
            i += 1
    return i >= len(shorter) - 1


def main():
    parser = argparse.ArgumentParser(
        description="Delete journals, invoices and payments whose student no longer exists."
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Back up and then delete. Without it, the script only reports.",
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

    print("Special Care 360 -- orphaned record cleanup")
    print("=" * 62)
    print("Mode:        {}".format("APPLY (deletes enabled)" if args.apply else "DRY RUN (no deletes)"))
    print()

    student_ids = set()
    student_names = []
    for doc in db.collection("students").stream():
        data = doc.to_dict() or {}
        student_ids.add(doc.id)
        if data.get("name"):
            student_names.append(data["name"].strip())

    print("{} students on file.".format(len(student_ids)))
    print()

    doomed = []       # (collection, doc_id, data, reason)
    near_misses = []  # names worth a human look

    for doc in db.collection("dailyCareJournals").stream():
        data = doc.to_dict() or {}
        sid = data.get("studentId")
        if sid not in student_ids:
            doomed.append((
                "dailyCareJournals", doc.id, data,
                "studentId {!r} does not exist".format(sid),
            ))

    for collection in ("invoices", "payments"):
        for doc in db.collection(collection).stream():
            data = doc.to_dict() or {}
            if data.get("studentId"):
                continue
            name = (data.get("studentName") or "").strip()
            if name in student_names:
                continue
            doomed.append((
                collection, doc.id, data,
                "studentName {!r} matches no student".format(name),
            ))
            for real in student_names:
                if name and similar(name, real):
                    near_misses.append((collection, doc.id, name, real))

    by_collection = {}
    for collection, _, _, _ in doomed:
        by_collection[collection] = by_collection.get(collection, 0) + 1

    print("{:<22}{:>12}".format("Collection", "orphaned"))
    print("-" * 34)
    for collection in ("dailyCareJournals", "invoices", "payments"):
        print("{:<22}{:>12}".format(collection, by_collection.get(collection, 0)))
    print("-" * 34)
    print("{:<22}{:>12}".format("TOTAL", len(doomed)))
    print()

    if near_misses:
        print("NEAR MISSES -- these are being deleted, but the name is close to a")
        print("real student. Check them before applying:")
        seen = set()
        for collection, doc_id, name, real in near_misses:
            key = (name, real)
            if key in seen:
                continue
            seen.add(key)
            print("  {!r} is similar to student {!r}".format(name, real))
        print()

    if not doomed:
        print("Nothing to clean up.")
        return

    if not args.apply:
        print("Dry run complete. {} record(s) would be deleted.".format(len(doomed)))
        print("Re-run with --apply to back them up and delete them.")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(
        os.path.dirname(__file__), "orphan-backup-{}.json".format(stamp)
    )
    payload = [
        {"collection": c, "id": i, "reason": r, "data": jsonable(d)}
        for c, i, d, r in doomed
    ]
    with open(backup_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    print("Backed up {} record(s) to {}".format(len(payload), os.path.basename(backup_path)))

    deleted = 0
    batch = db.batch()
    pending = 0
    for collection, doc_id, _, _ in doomed:
        batch.delete(db.collection(collection).document(doc_id))
        pending += 1
        deleted += 1
        if pending >= BATCH_LIMIT:
            batch.commit()
            batch = db.batch()
            pending = 0
    if pending:
        batch.commit()

    print("Deleted {} record(s).".format(deleted))
    print("Restore from the backup file if this was a mistake.")


if __name__ == "__main__":
    main()
