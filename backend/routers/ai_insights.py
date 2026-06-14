from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import google.generativeai as genai
from firebase_admin_init import get_db

router = APIRouter(prefix="/ai-insights", tags=["AI Insights"])

class AIResponse(BaseModel):
    report: str

@router.get("/abc/{student_id}", response_model=AIResponse)
async def generate_abc_insights(student_id: str):
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
    student_name = student_ref.to_dict().get("name", "the student")

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
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        return AIResponse(report=response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")
