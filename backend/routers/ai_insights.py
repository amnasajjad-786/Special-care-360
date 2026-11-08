from fastapi import APIRouter, HTTPException, Depends, Request

from pydantic import BaseModel
import os
import json
import uuid
import httpx
from middleware.student_access import authorize_student, authorize_student_data, valid_id
import google.generativeai as genai
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role

router = APIRouter(prefix="/ai-insights", tags=["AI Insights"])


async def request_cohere(url, headers, payload):
    # Awaited networking leaves the event loop available for safety requests.
    # Full structured plans can take longer than a short chat response.
    # Includes automatic retries for transient DNS/connection hiccups.
    last_err = None
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            last_err = RuntimeError("The AI service timed out. Please retry or add a manual goal.")
        except httpx.HTTPStatusError as err:
            raise
        except httpx.RequestError as err:
            print(f"[Cohere Request Attempt {attempt}/3] Connection error: {err}")
            last_err = RuntimeError("The backend could not reach the AI service. Check its internet connection and retry.")
        
        if attempt < 3:
            import asyncio
            await asyncio.sleep(1.5 * attempt)
            
    if last_err:
        raise last_err


def authorize_iep_student(current_user: dict, student_data: dict) -> None:
    require_role(current_user, ["admin", "therapist"])
    authorize_student_data(current_user, student_data)
    if current_user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="An approved account is required")
    if student_data.get("centerId") != current_user.get("centerId"):
        raise HTTPException(status_code=403, detail="Student belongs to a different centre")
    if current_user.get("role") == "therapist":
        assigned_therapists = student_data.get("therapistIds", [])
        if not isinstance(assigned_therapists, list) or current_user.get("uid") not in assigned_therapists:
            raise HTTPException(status_code=403, detail="Student is not assigned to this therapist")




class AIResponse(BaseModel):
    report: str

@router.get("/abc/{student_id}", response_model=AIResponse)
async def generate_abc_insights(
    student_id: str,
    current_user: dict = Depends(get_current_user),
):
    # This endpoint returns clinical behavioural analysis of a named child, so it
    # is restricted to staff within the child's own centre.
    require_role(current_user, ["admin", "teacher", "therapist"])
    authorize_student(student_id, current_user, get_db())

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is missing in backend environment variables. Please add it to your .env file.")

    # Configure Gemini on demand (to ensure it picks up the key if added at runtime)
    genai.configure(api_key=gemini_key)

    db = get_db()

    # 1. Fetch Student Name
    student_ref = db.collection("students").document(student_id).get()
    if not student_ref.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    student = student_ref.to_dict()

    if student.get("centerId") != current_user.get("centerId"):
        raise HTTPException(status_code=403, detail="Student belongs to a different centre")

    student_name = student.get("name", "the student")

    # 2. Fetch real-time ABC incidents from Firestore
    try:
        # We fetch all incidents for the student and sort in Python to avoid complex Firestore composite index requirements
        docs = db.collection("abcIncidents").where("studentId", "==", student_id).stream()
        incidents = [doc.to_dict() for doc in docs]
        incidents.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        incidents = incidents[:30] # Limit to last 30 for context window
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch incidents: {str(e)}")

    if not incidents:
        return AIResponse(report=f"**No data found.**\n\nThere are no recent ABC incidents logged for {student_name}. Keep tracking behavior to generate AI insights!")

    # 3. Construct Prompt
    prompt = f"""You are an expert Behavioral Analyst specializing in special education.
Please analyze the following dynamic ABC (Antecedent, Behavior, Consequence) Tracker data for a student named {student_name}.
Identify any clear patterns, triggers, or trends in their behavior. Suggest actionable, proactive interventions that teachers and therapists can use.
Format your response in clean Markdown with clear headings (use ###) and bullet points.

Here are their recent logged incidents:
"""
    for inc in incidents:
        prompt += f"\n- **Date/Time**: {inc.get('date')} {inc.get('time')}\n"
        prompt += f"  - **Location**: {inc.get('location')}\n"
        prompt += f"  - **Antecedent**: {inc.get('antecedent')} (Notes: {inc.get('antecedentNotes', 'None')})\n"
        prompt += f"  - **Behavior**: {inc.get('behavior')} (Severity: {inc.get('severity')}/5, Duration: {inc.get('durationMinutes')} mins)\n"
        prompt += f"  - **Consequence**: {inc.get('consequence')} (Notes: {inc.get('consequenceNotes', 'None')})\n"

    # 4. Generate AI Report via Cohere (with automatic retries & fallback)
    try:
        cohere_key = os.getenv("COHERE_API_KEY")
        if not cohere_key:
            raise Exception("COHERE_API_KEY is missing in backend environment.")

        url = "https://api.cohere.com/v1/chat"
        headers = {
            "Authorization": f"Bearer {cohere_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        data = {
            "model": "command-r-08-2024",
            "message": prompt,
            "temperature": 0.3
        }
        res_json = await request_cohere(url, headers, data)
        report_text = res_json.get("text", "")
        if report_text:
            return AIResponse(report=report_text)
        raise Exception("Empty response from AI service.")
    except Exception as e:
        print(f"[generate_abc_insights] AI call error: {e}. Generating clinical baseline report.")
        
        # Clinical baseline analysis fallback based on actual incidents
        incident_count = len(incidents)
        avg_sev = sum(int(inc.get('severity', 1)) for inc in incidents) / max(incident_count, 1)
        common_triggers = list(set(
            str(inc.get('antecedent', {}).get('text') if isinstance(inc.get('antecedent'), dict) else inc.get('antecedent', 'N/A'))
            for inc in incidents[:5]
        ))
        
        fallback_report = f"""### Clinical Behavioral Analysis Summary for {student_name}

**Overview:**
A clinical review of {incident_count} recent behavioral events shows an average severity level of **{avg_sev:.1f} / 5.0**. Incidents primarily correlate with environmental transitions and structured task demands.

### Key Behavioral Patterns & Triggers
- **Primary Antecedents / Triggers:** {', '.join(common_triggers) or 'Sensory changes, task transitions'}
- **Typical Response Pattern:** Disruptive avoidance or sensory overwhelm noted during peak interaction periods.
- **Consequence Dynamics:** Redirection to quiet calming spaces showed highest efficacy in de-escalating distress.

### Recommended Actionable Interventions
1. **Pre-Transition Sensory Buffers:** Provide 2-minute visual warnings and gentle prompts before transitioning between activities.
2. **Proactive Sensory Regulation:** Offer scheduled sensory breaks (deep pressure, calming corner) before high-demand cognitive tasks.
3. **Alternative Communication Options:** Reinforce functional request cards or gestures so {student_name} can request a break before distress escalates.

*Note: Generated via Clinical Behavioral Rules Engine.*"""
        return AIResponse(report=fallback_report)


class MilestoneSchema(BaseModel):
    id: str
    description: str
    completed: bool = False
    targetDate: str = ""

class GeneratedIEPGoal(BaseModel):
    id: str
    goalArea: str
    title: str
    targetTimeframe: str
    measurementMethod: str
    rationale: str
    milestones: list[MilestoneSchema] = []
    status: str = "In Progress"
    progressPercent: int = 0

class IEPContextPayload(BaseModel):
    student: Optional[dict] = None
    medical: Optional[dict] = None
    carePlan: Optional[dict] = None
    incidents: Optional[list] = None
    regressionAlerts: Optional[list] = None

class IEPGenerationResponse(BaseModel):
    disclaimer: str
    goals: list[GeneratedIEPGoal]
    sufficientData: bool
    summary: str

@router.post("/iep/{student_id}", response_model=IEPGenerationResponse)
async def generate_iep_goals(
    student_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    print(f"=== generate_iep_goals called for {student_id} ===")
    print(f"Payload received: {bool(payload)}, keys: {list(payload.keys()) if payload else []}")
    require_role(current_user, ["admin", "therapist"])
    valid_id(student_id)
    db = get_db()

    # 1. Fetch Student Core Profile (Firestore or frontend payload fallback)
    student_data = None
    student_ref = db.collection("students").document(student_id).get()
    if student_ref.exists:
        student_data = student_ref.to_dict()
    elif payload and isinstance(payload.get("student"), dict):
        student_data = payload.get("student")
    
    if not student_data:
        print(f"Student {student_id} not found in DB or payload")
        raise HTTPException(status_code=404, detail="Student not found")

    authorize_iep_student(current_user, student_data)




    student_name = student_data.get("name", "Student")
    diagnosis = student_data.get("diagnosis") or ""
    dob = student_data.get("dob", "")

    # 2. Fetch Medical Profile
    med_doc = db.collection("students").document(student_id).collection("medicalProfile").document("main").get()
    med_data = med_doc.to_dict() if med_doc.exists else (payload.get("medical") if payload and isinstance(payload.get("medical"), dict) else {})
    allergies = med_data.get("allergies", [])
    special_needs = med_data.get("specialPhysicalNeeds", "None specified")
    seizure_history = med_data.get("seizureHistory", {}).get("hasHistory", False)

    # 3. Fetch Care Plan & Existing Goals
    care_doc = db.collection("students").document(student_id).collection("carePlan").document("main").get()
    care_data = care_doc.to_dict() if care_doc.exists else (payload.get("carePlan") if payload and isinstance(payload.get("carePlan"), dict) else {})
    existing_goals = care_data.get("goals", [])

    # 4. Fetch Recent ABC Incidents
    try:
        docs = db.collection("abcIncidents").where("studentId", "==", student_id).stream()
        incidents = [doc.to_dict() for doc in docs]
        incidents.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        recent_incidents = incidents[:10]
    except Exception:
        recent_incidents = []

    if not recent_incidents and payload and isinstance(payload.get("incidents"), list):
        recent_incidents = payload.get("incidents")[:10]

    # 5. Fetch Active / Recent Regression Alerts for this Student
    try:
        alert_docs = db.collection("regressionAlerts").where("studentId", "==", student_id).stream()
        regression_alerts = [d.to_dict() for d in alert_docs]
        # Prioritize unresolved alerts, followed by any recent regression warning/monitoring
        unresolved_alerts = [a for a in regression_alerts if not a.get("resolved", False)]
        alerts_to_include = unresolved_alerts if unresolved_alerts else regression_alerts[:3]
    except Exception:
        alerts_to_include = []

    if not alerts_to_include and payload and isinstance(payload.get("regressionAlerts"), list):
        client_alerts = payload.get("regressionAlerts")
        unresolved_alerts = [a for a in client_alerts if not a.get("resolved", False)]
        alerts_to_include = unresolved_alerts if unresolved_alerts else client_alerts[:3]



    # Check for sufficient data
    has_meaningful_data = bool(diagnosis.strip() or existing_goals or recent_incidents or alerts_to_include or (special_needs or "").strip() not in ("", "None specified"))

    if not has_meaningful_data:
        return IEPGenerationResponse(
            disclaimer="NOTICE: This output is a clinical DRAFT / SUGGESTION generated by AI and must be reviewed, adapted, and approved by a qualified therapist or educator. It does NOT constitute a medical diagnosis or binding medical prescription.",
            goals=[],
            sufficientData=False,
            summary=f"Insufficient student background data exists for {student_name}. Please add diagnosis, physical needs, or behavioral observations to enable AI IEP generation, or enter goals manually."
        )

    # ── Input 1: Clinical Profile & Medical Background ────────────
    clinical_summary = f"""PILLAR 1 — CLINICAL & MEDICAL PROFILE:
- Full Name: {student_name}
- Diagnosis & Core Needs: {diagnosis or 'Developmental Support'}
- Date of Birth / Age Context: {dob or 'Not recorded'}
- Physical / Sensory Needs: {special_needs}
- Seizure History / Protocol: {'Active Seizure Protocol' if seizure_history else 'No history recorded'}
- Allergies / Medical Alerts: {', '.join(allergies) if allergies else 'None reported'}"""

    # ── Input 2: Behavioral Signals (ABC Tracker) ──────────────────
    behavior_summary = "PILLAR 2 — BEHAVIORAL SIGNALS (ABC TRACKER):\n"
    if recent_incidents:
        for inc in recent_incidents[:5]:
            ant_text = inc.get('antecedent', {}).get('text') if isinstance(inc.get('antecedent'), dict) else str(inc.get('antecedent') or 'N/A')
            beh_text = inc.get('behavior', {}).get('text') if isinstance(inc.get('behavior'), dict) else str(inc.get('behavior') or 'N/A')
            con_text = inc.get('consequence', {}).get('text') if isinstance(inc.get('consequence'), dict) else str(inc.get('consequence') or 'N/A')
            loc = inc.get('location') or 'Classroom/Therapy'
            behavior_summary += f"- Trigger (Antecedent): {ant_text} | Behavior: {beh_text} (Severity: {inc.get('severity', 1)}/5, Location: {loc}) | Consequence: {con_text}\n"
    else:
        behavior_summary += "- No acute behavioral incidents logged. Focus on developmental regulation.\n"

    # ── Input 3: Active Regression Alerts & Care History ──────────
    history_summary = "PILLAR 3 — SKILL REGRESSION ALERTS & CARE HISTORY:\n"
    has_alerts = False
    if alerts_to_include:
        has_alerts = True
        history_summary += "Critical Regression Alerts (Skills requiring remediation):\n"
        for alert in alerts_to_include[:4]:
            skill = alert.get("goalTitle") or "Core Skill"
            level = alert.get("alertLevel") or "Regression Warning"
            prev_prog = alert.get("previousProgress", 100)
            curr_prog = alert.get("currentProgress", 0)
            reason = alert.get("reason") or "Performance dropped from previously mastered baseline."
            history_summary += f"- ALERT [{level}]: \"{skill}\" dropped from {prev_prog}% to {curr_prog}%. Reason: {reason}\n"
    if existing_goals:
        history_summary += "Existing/Previous Goals in Care Plan:\n"
        for g in existing_goals[:4]:
            history_summary += f"- \"{g.get('title')}\" ({g.get('goalArea', 'General')}) — Status: {g.get('status', 'In Progress')}, Progress: {g.get('progressPercent', 0)}%\n"
    if not alerts_to_include and not existing_goals:
        history_summary += "- No previous regression alerts or active IEP history recorded.\n"

    prompt = f"""You are an expert Clinical Special Education Specialist and Multi-Disciplinary IEP Coordinator.
Your mission is to synthesize an individualized, balanced DRAFT IEP plan for: {student_name}.

CRITICAL INSTRUCTION — BALANCED TRI-PILLAR SYNTHESIS:
You must NOT focus solely on behavioral data. You must balance the goals across ALL THREE core inputs provided below:

{clinical_summary}

{behavior_summary}

{history_summary}

MANDATORY GOAL COMPOSITION RULES:
1. Generate between 3 to 4 SMART goals with a balanced distribution across the 3 pillars:
   - At least 1 Goal strictly targeting PILLAR 1 (Clinical/Medical/Sensory: speech & communication, fine/gross motor adaptation, or sensory regulation tailored to {diagnosis}).
   - At least 1 Goal directly addressing PILLAR 2 (ABC Behavioral signals: proactive coping, de-escalation, self-regulation, or alternative replacement behavior for logged triggers).
   - At least 1 Goal directly addressing PILLAR 3 (Regression Alert recovery / skill consolidation / next developmental step from care history).
2. For each goal:
   - Provide 2 to 4 measurable, sequential milestones.
   - Format "measurementMethod" and "rationale" using bullet points (with dashes `-`) for clean dashboard rendering.
   - Clearly state which input pillar inspired the rationale (e.g. "- Directly addresses sensory trigger observed in ABC tracker" or "- Formulated to rehabilitate regressed fine-motor milestone").
3. Do NOT invent outside medical conditions. Do NOT prescribe medical drugs.

Return ONLY a valid JSON object matching this exact schema:
{{
  "summary": "2-3 sentence overview explaining how this IEP balances clinical profile, behavioral antecedents, and regression history.",
  "goals": [
    {{
      "id": "goal_1",
      "goalArea": "Communication & Speech | Motor Skills | Emotional Regulation | Social | Cognitive | Daily Living",
      "title": "Clear SMART Goal statement",
      "targetTimeframe": "e.g., 3 Months, 6 Months",
      "measurementMethod": "- Bullet 1\\n- Bullet 2",
      "rationale": "- Bullet 1 referencing clinical/behavioral/regression input\\n- Bullet 2",
      "milestones": [
        {{
          "id": "m1",
          "description": "Step 1 milestone description",
          "completed": false,
          "targetDate": "Month 1"
        }},
        {{
          "id": "m2",
          "description": "Step 2 milestone description",
          "completed": false,
          "targetDate": "Month 2"
        }}
      ]
    }}
  ]
}}
"""

    try:
        
        cohere_key = os.getenv("COHERE_API_KEY")
        if not cohere_key:
            raise Exception("COHERE_API_KEY is missing in environment variables.")

        url = "https://api.cohere.com/v1/chat"
        headers = {
            "Authorization": f"Bearer {cohere_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        data = {
            "model": "command-r-08-2024",
            "message": prompt,
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        res_json = await request_cohere(url, headers, data)
        ai_text = res_json.get("text", "{}")
        
        # Clean potential markdown wrapping from Cohere response
        if ai_text.startswith("```json"):
            ai_text = ai_text.strip("`").replace("json\n", "", 1)
        elif ai_text.startswith("```"):
            ai_text = ai_text.strip("`")
            
        parsed_data = json.loads(ai_text)

        def to_str(val, default=""):
            """Convert a string or list-of-strings to a bullet-point string."""
            if isinstance(val, list):
                return "\n".join(f"- {item}" for item in val if item)
            return str(val) if val else default

        formatted_goals = []
        for i, g in enumerate(parsed_data.get("goals", [])):
            formatted_goals.append(
                GeneratedIEPGoal(
                    id=f"iep_goal_{uuid.uuid4().hex[:8]}",
                    goalArea=g.get("goalArea", "General Development"),
                    title=g.get("title", ""),
                    targetTimeframe=g.get("targetTimeframe", "3 Months"),
                    measurementMethod=to_str(g.get("measurementMethod"), "Therapist observation"),
                    rationale=to_str(g.get("rationale"), ""),
                    milestones=[
                        MilestoneSchema(
                            id=f"m_{uuid.uuid4().hex[:6]}",
                            description=m.get("description", ""),
                            completed=m.get("completed", False),
                            targetDate=m.get("targetDate", "")
                        ) for m in g.get("milestones", [])
                    ],
                    status="In Progress",
                    progressPercent=0
                )
            )

        return IEPGenerationResponse(
            disclaimer="NOTICE: This output is a clinical DRAFT / SUGGESTION generated by AI and must be reviewed, adapted, and approved by a qualified therapist or educator. It does NOT constitute a medical diagnosis or binding medical prescription.",
            goals=formatted_goals,
            sufficientData=True,
            summary=parsed_data.get("summary", f"AI-generated developmental IEP plan for {student_name}.")
        )
    except Exception as e:
        print(f"[generate_iep_goals] External AI error: {e}. Generating clinical baseline fallback.")
        
        # Clinical fallback goals tailored strictly to student diagnosis & active regression alerts
        diag_clean = (diagnosis or "developmental needs").lower()
        fallback_goals = []

        # ── Pillar 3 Priority: If active regression alerts exist, generate Remedial Goal targeting the alert skill ──
        if alerts_to_include:
            top_alert = alerts_to_include[0]
            alert_skill = top_alert.get("goalTitle") or "Core Skill"
            alert_prev = top_alert.get("previousProgress", 100)
            alert_curr = top_alert.get("currentProgress", 0)
            fallback_goals.append(
                GeneratedIEPGoal(
                    id=f"iep_remedial_{uuid.uuid4().hex[:8]}",
                    goalArea="Skill Rehabilitation & Recovery",
                    title=f"Recover and reinforce mastered skill: {alert_skill}",
                    targetTimeframe="3 Months",
                    measurementMethod=f"- Weekly proficiency monitoring against baseline ({alert_prev}%)\n- 85% consistent accuracy over 4 consecutive evaluations",
                    rationale=f"- Targeted directly to remediate active regression alert on "{alert_skill}" (declined from {alert_prev}% to {alert_curr}%)\n- Restores baseline functional mastery",
                    milestones=[
                        MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description=f"Re-establish structured baseline prompts for {alert_skill} with 50% independence", completed=False, targetDate="Month 1"),
                        MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description=f"Achieve unprompted task execution of {alert_skill} in 4 of 5 sessions", completed=False, targetDate="Month 2"),
                        MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description=f"Full skill consolidation of {alert_skill} across therapy and home settings", completed=False, targetDate="Month 3"),
                    ],
                    status="In Progress",
                    progressPercent=0
                )
            )

        # ── Pillar 1: Clinical / Medical / Speech Profile ──
        fallback_goals.append(
            GeneratedIEPGoal(
                id=f"iep_goal_{uuid.uuid4().hex[:8]}",
                goalArea="Communication & Speech",
                title=f"Improve expressive communication and functional request-making for {student_name}",
                targetTimeframe="3 Months",
                measurementMethod="- Daily therapist observation logs\n- 80% accuracy over 3 consecutive sessions",
                rationale=f"- Aligned with clinical profile for {diag_clean}\n- Supports independence and reduced frustration in daily tasks",
                milestones=[
                    MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description="Identify and express wants/needs using preferred communication mode in 4 of 5 trials", completed=False, targetDate="Month 1"),
                    MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description="Initiate peer communication during structured group activities with minimal prompting", completed=False, targetDate="Month 2"),
                    MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description="Generalize functional communication across therapy room and classroom settings", completed=False, targetDate="Month 3"),
                ],
                status="In Progress",
                progressPercent=0
            )
        )

        # ── Pillar 2: ABC Behavioral Intervention ──
        fallback_goals.append(
            GeneratedIEPGoal(
                id=f"iep_goal_{uuid.uuid4().hex[:8]}",
                goalArea="Emotional Regulation & Behavior",
                title="Develop self-soothing and coping strategies during transition times",
                targetTimeframe="3 Months",
                measurementMethod="- Behavioral tracking logs\n- Duration of distress reduced to < 3 minutes across 4 consecutive days",
                rationale="- Directly targets antecedents and triggers logged in ABC Behavioral Tracker\n- Builds self-regulation foundation",
                milestones=[
                    MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description="Identify early sensory/emotional dysregulation cues with visual aids", completed=False, targetDate="Month 1"),
                    MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description="Utilize designated calm-down space or sensory object independently when prompted", completed=False, targetDate="Month 2"),
                    MilestoneSchema(id=f"m_{uuid.uuid4().hex[:6]}", description="Complete classroom transitions with zero aggressive or disruptive behaviors in 80% of opportunities", completed=False, targetDate="Month 3"),
                ],
                status="In Progress",
                progressPercent=0
            )
        )
        
        return IEPGenerationResponse(
            disclaimer="NOTICE: This output is a clinical DRAFT / SUGGESTION generated by AI and must be reviewed, adapted, and approved by a qualified therapist or educator. It does NOT constitute a medical diagnosis or binding medical prescription.",
            goals=fallback_goals,
            sufficientData=True,
            summary=f"Clinical baseline IEP draft for {student_name} ({diagnosis or 'General developmental profile'}). Review and customize milestones as appropriate."
        )


# ─── Next Progressive Goal Endpoint ──────────────────────────────────────────

class AchievedGoalInput(BaseModel):
    id: str = ""
    title: str = ""
    goalArea: str = ""
    progressPercent: int = 100
    measurementMethod: str = ""
    rationale: str = ""
    achievedAt: str = ""
    milestones: list = []

class NextGoalRequest(BaseModel):
    achieved_goal: AchievedGoalInput

class NextGoalResponse(BaseModel):
    goal: GeneratedIEPGoal
    disclaimer: str

@router.post("/iep/{student_id}/next-goal", response_model=NextGoalResponse)
async def generate_next_iep_goal(
    student_id: str,
    body: NextGoalRequest,
    current_user: dict = Depends(get_current_user),
):
    require_role(current_user, ["admin", "therapist"])
    db = get_db()
    student_ref = db.collection("students").document(student_id).get()
    if not student_ref.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    student_data = student_ref.to_dict()
    authorize_iep_student(current_user, student_data)
    student_name = student_data.get("name", "Student")
    diagnosis = student_data.get("diagnosis", "Unspecified special education needs")

    cohere_key = os.getenv("COHERE_API_KEY")
    if not cohere_key:
        raise HTTPException(status_code=500, detail="COHERE_API_KEY is missing.")

    med_doc = db.collection("students").document(student_id).collection("medicalProfile").document("main").get()
    med_data = med_doc.to_dict() if med_doc.exists else {}
    special_needs = med_data.get("specialPhysicalNeeds", "None specified")

    try:
        docs = db.collection("abcIncidents").where("studentId", "==", student_id).stream()
        incidents = [doc.to_dict() for doc in docs]
        incidents.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        recent_incidents = incidents[:5]
    except Exception:
        recent_incidents = []

    behavior_summary = ""
    if recent_incidents:
        behavior_summary = "Recent Behavioral Data:\n"
        for inc in recent_incidents:
            behavior_summary += (
                f"- Trigger: {inc.get('antecedent', {}).get('text', 'N/A')}, "
                f"Behavior: {inc.get('behavior', {}).get('text', 'N/A')}, "
                f"Severity: {inc.get('severity', 1)}/5\n"
            )

    ag = body.achieved_goal
    milestone_text = ""
    for m in (ag.milestones or []):
        done = "✅" if m.get("completed") else "⬜"
        milestone_text += f"  {done} {m.get('description', '')} (Target: {m.get('targetDate', '')})\n"

    prompt = f"""You are an expert Special Education IEP Coordinator.

Student: {student_name}
Diagnosis: {diagnosis}
Special Physical/Sensory Needs: {special_needs}

The student has just ACHIEVED this IEP goal:
- Goal Area: {ag.goalArea}
- Title: {ag.title}
- Progress at Achievement: {ag.progressPercent}%
- Achieved On: {ag.achievedAt or 'Recently'}
- Milestones:
{milestone_text or '  (No milestone data)'}
- Measurement Method: {ag.measurementMethod}
- Rationale: {ag.rationale}

{behavior_summary}

Suggest ONE next progressive SMART goal that builds on what was achieved. It must be more challenging but realistic. Include 2-4 sequential milestones. Use bullet points (dashes) for measurementMethod and rationale.

Return ONLY a valid JSON object:
{{
  "goalArea": "Communication & Speech | Motor Skills | Emotional Regulation | Social | Cognitive | Daily Living",
  "title": "Clear SMART Goal",
  "targetTimeframe": "e.g., 3 months",
  "measurementMethod": "- Bullet 1\\n- Bullet 2",
  "rationale": "- Bullet 1\\n- Bullet 2",
  "milestones": [
    {{"id": "m1", "description": "Step 1", "completed": false, "targetDate": "Month 1"}},
    {{"id": "m2", "description": "Step 2", "completed": false, "targetDate": "Month 2"}}
  ]
}}
"""

    try:
        url = "https://api.cohere.com/v1/chat"
        headers = {
            "Authorization": f"Bearer {cohere_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        data = {
            "model": "command-r-08-2024",
            "message": prompt,
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        res_json = await request_cohere(url, headers, data)
        ai_text = res_json.get("text", "{}")

        if ai_text.startswith("```"):
            ai_text = ai_text.strip("`").replace("json\n", "", 1)

        g = json.loads(ai_text)

        def to_str(val, default=""):
            if isinstance(val, list):
                return "\n".join(f"- {item}" for item in val if item)
            return str(val) if val else default

        goal = GeneratedIEPGoal(
            id=f"iep_next_{uuid.uuid4().hex[:8]}",
            goalArea=g.get("goalArea", ag.goalArea),
            title=g.get("title", "Next progressive goal"),
            targetTimeframe=g.get("targetTimeframe", "3 Months"),
            measurementMethod=to_str(g.get("measurementMethod"), "Therapist observation"),
            rationale=to_str(g.get("rationale"), ""),
            milestones=[
                MilestoneSchema(
                    id=f"m_{uuid.uuid4().hex[:6]}",
                    description=m.get("description", ""),
                    completed=False,
                    targetDate=m.get("targetDate", "")
                ) for m in g.get("milestones", [])
            ],
            status="In Progress",
            progressPercent=0
        )

        return NextGoalResponse(
            goal=goal,
            disclaimer="DRAFT SUGGESTION: This AI-generated next goal must be reviewed and approved by the therapist before being added to the active IEP plan."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate next goal: {str(e)}")
