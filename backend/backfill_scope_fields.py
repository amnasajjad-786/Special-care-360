"""
backfill_scope_fields.py — one-off migration for the security-rules rewrite.

WHY
---
firestore.rules now authorises records by a denormalised `centerId` (staff) and
`parentId` (guardian), and every list query filters on the matching field.
Records written before that change do not carry those fields, so they are
invisible to the new queries — old journals, incidents, alerts and invoices
simply read as empty rather than erroring.

This script fills them in from the owning student document.

  dailyCareJournals   + centerId  + parentId
  abcIncidents        + parentId              (centerId was already written)
  panicAlerts         + parentId              (centerId was already written)
  invoices            + studentId + parentId  (+ centerId if missing)
  payments            + studentId + parentId  (+ centerId if missing)
  staff               + centerId              (only if missing)

Invoices and payments are the awkward case: they were keyed on `studentName`
with no id at all. This script resolves the name back to a student, and when a
name is ambiguous or unknown it REPORTS the record and leaves it alone rather
than guessing — guessing is what the original studentName join did, and it is
exactly the bug that let two families see each other's billing.

A student with no linked guardian gets `parentId: None`, not "". The seed data
uses an empty string, which is falsy but still a string, and `"" == uid` is
never true — storing null keeps the intent explicit.

USAGE
-----
Dry run (default — reads only, writes nothing):

    python backfill_scope_fields.py

Apply the changes:

    python backfill_scope_fields.py --apply

Limit to one collection:

    python backfill_scope_fields.py --collection invoices
    python backfill_scope_fields.py --collection invoices --apply

Safe to re-run: records that already carry the fields are skipped.
Requires serviceAccountKey.json — it refuses to touch the mock database.
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from firebase_admin_init import init_firebase, get_db  # noqa: E402

# Firestore allows 500 operations per batch; leave headroom.
BATCH_LIMIT = 400

COLLECTIONS = [
    "dailyCareJournals",
    "abcIncidents",
    "panicAlerts",
    "invoices",
    "payments",
    "staff",
]


def normalise_parent_id(value):
    """Empty or whitespace-only means no guardian linked; return None for it."""
    if not value or not str(value).strip():
        return None
    return str(value).strip()


class Backfiller:
    def __init__(self, db, apply_changes: bool):
        self.db = db
        self.apply = apply_changes
        self.pending = []          # (doc_ref, updates) awaiting commit
        self.stats = {}            # collection -> counters
        self.problems = []         # human-readable notes

    # ── bookkeeping ───────────────────────────────────────────────────────

    def counter(self, collection: str):
        return self.stats.setdefault(
            collection, {"scanned": 0, "updated": 0, "skipped": 0, "unresolved": 0}
        )

    def queue(self, collection: str, doc_ref, updates: dict):
        self.counter(collection)["updated"] += 1
        self.pending.append((doc_ref, updates))
        if len(self.pending) >= BATCH_LIMIT:
            self.flush()

    def flush(self):
        if not self.pending:
            return
        if self.apply:
            batch = self.db.batch()
            for doc_ref, updates in self.pending:
                batch.update(doc_ref, updates)
            batch.commit()
        self.pending = []

    # ── student lookup tables ─────────────────────────────────────────────

    def load_students(self):
        by_id = {}
        by_name = {}

        for doc in self.db.collection("students").stream():
            data = doc.to_dict() or {}
            record = {
                "id": doc.id,
                "name": (data.get("name") or "").strip(),
                "centerId": data.get("centerId"),
                "parentId": normalise_parent_id(data.get("parentId")),
            }
            by_id[doc.id] = record
            if record["name"]:
                by_name.setdefault(record["name"].casefold(), []).append(record)

        return by_id, by_name

    # ── per-collection passes ─────────────────────────────────────────────

    def backfill_by_student_id(self, collection: str, students, fields):
        """
        For collections that already store a usable studentId.
        `fields` lists which of centerId/parentId to ensure.
        """
        counts = self.counter(collection)

        for doc in self.db.collection(collection).stream():
            counts["scanned"] += 1
            data = doc.to_dict() or {}

            student_id = data.get("studentId")
            if not student_id:
                counts["unresolved"] += 1
                self.problems.append(
                    f"{collection}/{doc.id}: no studentId — cannot resolve, left untouched"
                )
                continue

            student = students.get(student_id)
            if not student:
                counts["unresolved"] += 1
                self.problems.append(
                    f"{collection}/{doc.id}: studentId '{student_id}' does not exist "
                    f"(deleted student?) — left untouched"
                )
                continue

            updates = {}
            if "centerId" in fields and not data.get("centerId"):
                updates["centerId"] = student["centerId"]
            # Absent, or present but empty — an empty string is not a usable
            # guardian reference and should become an explicit null.
            if "parentId" in fields and normalise_parent_id(data.get("parentId")) is None:
                if data.get("parentId", "__absent__") != student["parentId"]:
                    updates["parentId"] = student["parentId"]

            if updates:
                self.queue(collection, doc.reference, updates)
            else:
                counts["skipped"] += 1

    def backfill_billing(self, collection: str, students, students_by_name):
        """
        invoices / payments — resolve the legacy studentName back to an id.
        """
        counts = self.counter(collection)

        for doc in self.db.collection(collection).stream():
            counts["scanned"] += 1
            data = doc.to_dict() or {}

            student = None
            student_id = data.get("studentId")

            if student_id:
                student = students.get(student_id)
                if not student:
                    counts["unresolved"] += 1
                    self.problems.append(
                        f"{collection}/{doc.id}: studentId '{student_id}' does not exist "
                        f"— left untouched"
                    )
                    continue
            else:
                name = (data.get("studentName") or "").strip()
                if not name:
                    counts["unresolved"] += 1
                    self.problems.append(
                        f"{collection}/{doc.id}: neither studentId nor studentName — "
                        f"left untouched"
                    )
                    continue

                matches = students_by_name.get(name.casefold(), [])
                if len(matches) == 1:
                    student = matches[0]
                elif len(matches) == 0:
                    counts["unresolved"] += 1
                    self.problems.append(
                        f"{collection}/{doc.id}: no student named '{name}' — left untouched"
                    )
                    continue
                else:
                    # This is the ambiguity the old studentName join silently
                    # got wrong. Refuse to pick one.
                    counts["unresolved"] += 1
                    ids = ", ".join(m["id"] for m in matches)
                    self.problems.append(
                        f"{collection}/{doc.id}: '{name}' matches {len(matches)} students "
                        f"({ids}) — AMBIGUOUS, needs manual assignment"
                    )
                    continue

            updates = {}
            if not data.get("studentId"):
                updates["studentId"] = student["id"]
            if normalise_parent_id(data.get("parentId")) is None:
                if data.get("parentId", "__absent__") != student["parentId"]:
                    updates["parentId"] = student["parentId"]
            if not data.get("centerId"):
                updates["centerId"] = student["centerId"]

            if updates:
                self.queue(collection, doc.reference, updates)
            else:
                counts["skipped"] += 1

    def backfill_staff(self, default_center_id: str):
        """staff records predate centerId scoping in some cases."""
        counts = self.counter("staff")

        for doc in self.db.collection("staff").stream():
            counts["scanned"] += 1
            data = doc.to_dict() or {}

            if data.get("centerId"):
                counts["skipped"] += 1
                continue

            if not default_center_id:
                counts["unresolved"] += 1
                self.problems.append(
                    f"staff/{doc.id}: no centerId and no default could be inferred "
                    f"— left untouched"
                )
                continue

            self.queue("staff", doc.reference, {"centerId": default_center_id})


def main():
    parser = argparse.ArgumentParser(
        description="Backfill centerId/parentId/studentId onto pre-migration records."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write the changes. Without it, the script only reports.",
    )
    parser.add_argument(
        "--collection",
        choices=COLLECTIONS,
        help="Limit the run to a single collection.",
    )
    args = parser.parse_args()

    init_firebase()
    db = get_db()

    # The mock client has no batch() and backfilling it would be pointless.
    if not hasattr(db, "batch"):
        print(
            "This script needs real Firestore. serviceAccountKey.json was not found,\n"
            "so the backend fell back to the in-memory mock database. Add the key and\n"
            "re-run."
        )
        sys.exit(1)

    targets = [args.collection] if args.collection else COLLECTIONS

    print("Special Care 360 — scope field backfill")
    print("=" * 62)
    print(f"Mode:        {'APPLY (writes enabled)' if args.apply else 'DRY RUN (no writes)'}")
    print(f"Collections: {', '.join(targets)}")
    print()

    students, students_by_name = None, None
    runner = Backfiller(db, args.apply)

    needs_students = any(t != "staff" for t in targets)
    if needs_students:
        students, students_by_name = runner.load_students()
        print(f"Loaded {len(students)} students.")
        linked = sum(1 for s in students.values() if s["parentId"])
        print(f"  {linked} have a guardian linked; {len(students) - linked} do not.")
        duplicates = {n: m for n, m in students_by_name.items() if len(m) > 1}
        if duplicates:
            print(f"  WARNING: {len(duplicates)} name(s) shared by more than one student.")
            print("  Billing records for those names cannot be resolved automatically.")
        print()

    # Infer a default centre for staff records that lack one.
    default_center_id = None
    if "staff" in targets:
        centres = {s["centerId"] for s in (students or {}).values() if s.get("centerId")}
        if len(centres) == 1:
            default_center_id = centres.pop()
        elif not students:
            from config import DEFAULT_CENTER_ID
            default_center_id = DEFAULT_CENTER_ID

    if "dailyCareJournals" in targets:
        runner.backfill_by_student_id(
            "dailyCareJournals", students, fields={"centerId", "parentId"}
        )
    if "abcIncidents" in targets:
        runner.backfill_by_student_id(
            "abcIncidents", students, fields={"centerId", "parentId"}
        )
    if "panicAlerts" in targets:
        runner.backfill_by_student_id(
            "panicAlerts", students, fields={"centerId", "parentId"}
        )
    if "invoices" in targets:
        runner.backfill_billing("invoices", students, students_by_name)
    if "payments" in targets:
        runner.backfill_billing("payments", students, students_by_name)
    if "staff" in targets:
        runner.backfill_staff(default_center_id)

    runner.flush()

    # ── report ────────────────────────────────────────────────────────────
    print(f"{'Collection':<22}{'scanned':>9}{'to update':>11}{'ok already':>12}{'unresolved':>12}")
    print("-" * 66)
    total_updates = 0
    total_unresolved = 0
    for collection in targets:
        c = runner.stats.get(collection, {"scanned": 0, "updated": 0, "skipped": 0, "unresolved": 0})
        total_updates += c["updated"]
        total_unresolved += c["unresolved"]
        print(
            f"{collection:<22}{c['scanned']:>9}{c['updated']:>11}{c['skipped']:>12}{c['unresolved']:>12}"
        )
    print("-" * 66)
    print(f"{'TOTAL':<22}{'':>9}{total_updates:>11}{'':>12}{total_unresolved:>12}")
    print()

    if runner.problems:
        print(f"Records needing attention ({len(runner.problems)}):")
        for note in runner.problems[:40]:
            print(f"  - {note}")
        if len(runner.problems) > 40:
            print(f"  ... and {len(runner.problems) - 40} more")
        print()
        print("These were NOT modified. Ambiguous billing records must be assigned a")
        print("studentId by hand — the whole point of the migration is that a name is")
        print("not a safe key.")
        print()

    if args.apply:
        print(f"Done. {total_updates} record(s) updated.")
    else:
        print(f"Dry run complete. {total_updates} record(s) would be updated.")
        print("Re-run with --apply to write the changes.")


if __name__ == "__main__":
    main()
