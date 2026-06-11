from fastapi import APIRouter, Depends, Query
from models.schemas import ABCIncidentCreate
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone
from collections import Counter
import uuid

router = APIRouter(prefix="/api/abc", tags=["abc-tracker"])

MOCK_INCIDENTS = [
    {"id": "i1", "studentId": "s1", "timestamp": "2026-04-22T09:00:00Z",
     "antecedent": {"text": "Loud announcement on intercom", "tags": ["Loud Noise"]},
     "behavior": {"text": "Covered ears, started rocking", "tags": ["Screaming"]},
     "consequence": {"text": "Moved to quiet corner", "tags": ["Redirected"]},
     "severity": 3, "durationMinutes": 8, "location": "Classroom A"},
    {"id": "i2", "studentId": "s1", "timestamp": "2026-04-21T13:30:00Z",
     "antecedent": {"text": "Activity changed without warning", "tags": ["Transition", "Unexpected Change"]},
     "behavior": {"text": "Threw material off desk", "tags": ["Hitting", "Screaming"]},
     "consequence": {"text": "Verbal prompt to calm down", "tags": ["Verbal Prompt"]},
     "severity": 4, "durationMinutes": 15, "location": "Classroom A"},
    {"id": "i3", "studentId": "s1", "timestamp": "2026-04-20T10:00:00Z",
     "antecedent": {"text": "Request denied", "tags": ["Denied Request"]},
     "behavior": {"text": "Crying and withdrawal", "tags": ["Crying", "Withdrawal"]},
     "consequence": {"text": "Ignored briefly then redirected", "tags": ["Ignored", "Redirected"]},
     "severity": 2, "durationMinutes": 5, "location": "Therapy Room"},
    {"id": "i4", "studentId": "s1", "timestamp": "2026-04-19T14:00:00Z",
     "antecedent": {"text": "Crowded lunch hall", "tags": ["Crowded Space"]},
     "behavior": {"text": "Self-stimulatory behavior", "tags": ["Self-harm"]},
     "consequence": {"text": "Physical support provided", "tags": ["Physical Support"]},
     "severity": 4, "durationMinutes": 12, "location": "Cafeteria"},
    {"id": "i5", "studentId": "s1", "timestamp": "2026-04-18T09:30:00Z",
     "antecedent": {"text": "Loud music in therapy room", "tags": ["Loud Noise"]},
     "behavior": {"text": "Running out of room", "tags": ["Running away"]},
     "consequence": {"text": "Teacher followed calmly", "tags": ["Physical Support"]},
     "severity": 3, "durationMinutes": 6, "location": "Therapy Room"},
]


def _get_db_safe():
    try:
        return get_db()
    except RuntimeError:
        return None


@router.post("/incidents")
async def log_incident(
    body: ABCIncidentCreate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["teacher", "therapist", "admin"])
    incident_id = str(uuid.uuid4())
    data = body.model_dump()
    data["id"] = incident_id
    data["createdAt"] = datetime.now(timezone.utc).isoformat()

    db = _get_db_safe()
    if not db:
        return {"message": "Incident logged (placeholder mode)", "id": incident_id}

    db.collection("abcIncidents").document(incident_id).set(data)
    return {"message": "Incident logged", "id": incident_id}


@router.get("/incidents/{student_id}")
async def list_incidents(
    student_id: str,
    limit: int = Query(50),
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    if not db:
        return [i for i in MOCK_INCIDENTS if i["studentId"] == student_id]

    docs = (
        db.collection("abcIncidents")
        .where("studentId", "==", student_id)
        .order_by("timestamp", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    incidents = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        incidents.append(data)
    return incidents


@router.get("/patterns/{student_id}")
async def get_patterns(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Pure aggregation — count-based pattern analysis."""
    db = _get_db_safe()

    if not db:
        incidents = [i for i in MOCK_INCIDENTS if i["studentId"] == student_id]
    else:
        docs = (
            db.collection("abcIncidents")
            .where("studentId", "==", student_id)
            .limit(100)
            .stream()
        )
        incidents = [doc.to_dict() for doc in docs]

    if not incidents:
        return {
            "topAntecedents": [],
            "topBehaviors": [],
            "topConsequences": [],
            "peakHours": [],
            "avgSeverity": 0,
            "totalIncidents": 0,
            "insights": []
        }

    antecedent_tags: list[str] = []
    behavior_tags: list[str] = []
    consequence_tags: list[str] = []
    hours: list[int] = []
    severities: list[int] = []

    for inc in incidents:
        antecedent_tags += inc.get("antecedent", {}).get("tags", [])
        behavior_tags += inc.get("behavior", {}).get("tags", [])
        consequence_tags += inc.get("consequence", {}).get("tags", [])
        ts = inc.get("timestamp", "")
        if "T" in ts:
            try:
                hours.append(int(ts.split("T")[1].split(":")[0]))
            except Exception:
                pass
        severities.append(inc.get("severity", 1))

    top_antecedents = [{"tag": k, "count": v} for k, v in Counter(antecedent_tags).most_common(5)]
    top_behaviors = [{"tag": k, "count": v} for k, v in Counter(behavior_tags).most_common(5)]
    top_consequences = [{"tag": k, "count": v} for k, v in Counter(consequence_tags).most_common(5)]
    peak_hours = [{"hour": k, "count": v} for k, v in Counter(hours).most_common(3)]
    avg_severity = round(sum(severities) / len(severities), 1) if severities else 0

    # Generate rule-based insights
    insights = []
    if top_antecedents:
        insights.append(f"Most common trigger: '{top_antecedents[0]['tag']}' ({top_antecedents[0]['count']} incidents)")
    if top_behaviors:
        insights.append(f"Most frequent behavior: '{top_behaviors[0]['tag']}' observed {top_behaviors[0]['count']} times")
    if peak_hours:
        hour = peak_hours[0]['hour']
        period = "AM" if hour < 12 else "PM"
        insights.append(f"Peak incident time: {hour % 12 or 12}:00 {period}")
    if avg_severity >= 3.5:
        insights.append(f"Average severity is high ({avg_severity}/5) — consider a behavior intervention plan review")
    elif avg_severity < 2:
        insights.append(f"Average severity is low ({avg_severity}/5) — student is showing improvement")

    return {
        "topAntecedents": top_antecedents,
        "topBehaviors": top_behaviors,
        "topConsequences": top_consequences,
        "peakHours": peak_hours,
        "avgSeverity": avg_severity,
        "totalIncidents": len(incidents),
        "insights": insights,
    }


@router.get("/heatmap/{student_id}")
async def get_heatmap(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Returns heatmap data: list of {day (Mon-Sun), hour (0-23), count, avgSeverity}."""
    db = _get_db_safe()

    if not db:
        incidents = [i for i in MOCK_INCIDENTS if i["studentId"] == student_id]
    else:
        docs = (
            db.collection("abcIncidents")
            .where("studentId", "==", student_id)
            .limit(200)
            .stream()
        )
        incidents = [doc.to_dict() for doc in docs]

    # Build day × severity grid (7 days × 5 severity levels)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    grid: dict = {day: {s: 0 for s in range(1, 6)} for day in days}

    for inc in incidents:
        ts = inc.get("timestamp", "")
        sev = inc.get("severity", 1)
        if "T" in ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                day_name = days[dt.weekday()]
                grid[day_name][sev] = grid[day_name].get(sev, 0) + 1
            except Exception:
                pass

    result = []
    for day in days:
        for severity in range(1, 6):
            result.append({"day": day, "severity": severity, "count": grid[day][severity]})

    return result
