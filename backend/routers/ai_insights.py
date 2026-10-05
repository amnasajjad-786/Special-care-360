from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import os
import json
import uuid
import google.generativeai as genai
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role

router = APIRouter(prefix="/ai-insights", tags=["AI Insights"])


def authorize_iep_student(current_user: dict, student_data: dict) -> None:
    require_role(current_user, ["admin", "therapist"])
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

    # 4. Generate AI Report
    try:
        try:
            model = genai.GenerativeModel('gemini-3.8-flash')
        except Exception:
            model = genai.GenerativeModel('gemini-1.5-flash')


        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
        response = model.generate_content(prompt, safety_settings=safety_settings)
        return AIResponse(report=response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


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

class IEPGenerationResponse(BaseModel):
    disclaimer: str
    goals: list[GeneratedIEPGoal]
    sufficientData: bool
    summary: str

@router.post("/iep/{student_id}", response_model=IEPGenerationResponse)
async def generate_iep_goals(
    student_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_role(current_user, ["admin", "therapist"])
    db = get_db()

    # 1. Fetch Student Core Profile
    student_ref = db.collection("students").document(student_id).get()
    if not student_ref.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    student_data = student_ref.to_dict()
    authorize_iep_student(current_user, student_data)

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is missing in backend environment variables. Please add it to your .env file."
        )

    genai.configure(api_key=gemini_key)

    student_name = student_data.get("name", "Student")
    diagnosis = student_data.get("diagnosis", "Unspecified special education needs")
    dob = student_data.get("dob", "")

    # 2. Fetch Medical Profile
    med_doc = db.collection("students").document(student_id).collection("medicalProfile").document("main").get()
    med_data = med_doc.to_dict() if med_doc.exists else {}
    allergies = med_data.get("allergies", [])
    special_needs = med_data.get("specialPhysicalNeeds", "None specified")
    seizure_history = med_data.get("seizureHistory", {}).get("hasHistory", False)

    # 3. Fetch Care Plan & Existing Goals
    care_doc = db.collection("students").document(student_id).collection("carePlan").document("main").get()
    care_data = care_doc.to_dict() if care_doc.exists else {}
    existing_goals = care_data.get("goals", [])

    # 4. Fetch Recent ABC Incidents
    try:
        docs = db.collection("abcIncidents").where("studentId", "==", student_id).stream()
        incidents = [doc.to_dict() for doc in docs]
        incidents.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        recent_incidents = incidents[:10]
    except Exception:
        recent_incidents = []

    # Check for sufficient data
    has_meaningful_data = bool(diagnosis or existing_goals or recent_incidents or special_needs != "None specified")

    if not has_meaningful_data:
        return IEPGenerationResponse(
            disclaimer="NOTICE: This output is a clinical DRAFT / SUGGESTION generated by AI and must be reviewed, adapted, and approved by a qualified therapist or educator. It does NOT constitute a medical diagnosis or binding medical prescription.",
            goals=[],
            sufficientData=False,
            summary=f"Insufficient student background data exists for {student_name}. Please add diagnosis, physical needs, or behavioral observations to enable AI IEP generation, or enter goals manually."
        )

    # Construct Prompt for structured JSON response
    behavior_summary = ""
    if recent_incidents:
        behavior_summary = "Recent Behavioral Data:\n"
        for inc in recent_incidents[:5]:
            behavior_summary += f"- Trigger: {inc.get('antecedent', {}).get('text', 'N/A')}, Behavior: {inc.get('behavior', {}).get('text', 'N/A')}, Severity: {inc.get('severity', 1)}/5\n"

    existing_goals_summary = ""
    if existing_goals:
        existing_goals_summary = "Current/Past Goals:\n"
        for g in existing_goals:
            existing_goals_summary += f"- {g.get('title')} (Status: {g.get('status')}, Progress: {g.get('progressPercent', 0)}%)\n"

    prompt = f"""You are an expert Special Education Specialist and Clinical IEP Coordinator.
Generate an individualized DRAFT IEP (Individualized Education Program) goal plan for student: {student_name}.

Student Information:
- Diagnosis / Needs: {diagnosis}
- Date of Birth / Age Range: {dob}
- Special Physical / Sensory Needs: {special_needs}
- Seizure History: {'Yes' if seizure_history else 'No'}
- Allergies: {', '.join(allergies) if allergies else 'None'}
{behavior_summary}
{existing_goals_summary}

RULES & CONSTRAINTS:
1. Generate between 3 to 5 realistic, high-impact SMART goals across relevant developmental areas (e.g. Communication, Motor Skills, Emotional Regulation, Social Interaction, Daily Living).
2. For each goal, provide 2 to 4 measurable milestones broken down in progressive sequence.
3. For "measurementMethod" and "rationale", ALWAYS format the text using bullet points (using dashes `-`) to make it easy to read on the dashboard.
4. Clearly ground the rationale strictly in the provided student details (do not hallucinate outside conditions).
5. Do NOT make a formal medical diagnosis or prescribe medical treatments.

Return ONLY a valid JSON object matching this exact schema:
{{
  "summary": "Short 2-3 sentence overview of the IEP direction tailored to the student",
  "goals": [
    {{
      "id": "goal_1",
      "goalArea": "Communication & Speech | Motor Skills | Emotional Regulation | Social | Cognitive",
      "title": "Clear SMART Goal statement",
      "targetTimeframe": "e.g., 3 months, 6 months, End of Academic Term",
      "measurementMethod": "e.g., Weekly behavioral frequency charting, 80% accuracy over 3 consecutive sessions",
      "rationale": "Rationale tied to student's diagnosis and needs",
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
        import urllib.request
        import urllib.error
        
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
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='POST')
        
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
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
        raise HTTPException(status_code=500, detail=f"Failed to generate IEP goals: {str(e)}")


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
        import urllib.request as _req
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
        request = _req.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
        with _req.urlopen(request) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
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
