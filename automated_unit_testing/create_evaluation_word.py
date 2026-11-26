import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def create_clean_text_docx():
    doc = Document()
    
    # 0.75-inch Standard Page Margins
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # Standard clean body font: Calibri clean typography
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(0x11, 0x11, 0x11)

    # Color definitions
    NAVY = RGBColor(0x1B, 0x36, 0x5D)
    TEAL = RGBColor(0x00, 0x5A, 0x70)
    DARK_GRAY = RGBColor(0x2E, 0x2E, 0x2E)

    # Document Main Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(2)
    r_title = p_title.add_run("SPECIAL CARE 360")
    r_title.bold = True
    r_title.font.size = Pt(20)
    r_title.font.color.rgb = NAVY

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(4)
    r_sub = p_sub.add_run("CLINICAL EVALUATION & EXPERT VALIDATION FORM")
    r_sub.bold = True
    r_sub.font.size = Pt(13)
    r_sub.font.color.rgb = TEAL

    p_desc = doc.add_paragraph()
    p_desc.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_desc.paragraph_format.space_before = Pt(0)
    p_desc.paragraph_format.space_after = Pt(14)
    r_desc = p_desc.add_run("Therapist Review of AI-Generated IEP Goals, Multi-Pillar Correlation & Clinical Milestones")
    r_desc.font.size = Pt(10)
    r_desc.italic = True
    r_desc.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    # Overview Box
    info_tbl = doc.add_table(rows=1, cols=1)
    info_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = info_tbl.cell(0, 0)
    cell.width = Inches(7.0)
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F4F6F9"/>')
    cell._tc.get_or_add_tcPr().append(shd)

    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="6" w:space="0" w:color="1B365D"/>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="1B365D"/>
            <w:bottom w:val="single" w:sz="6" w:space="0" w:color="1B365D"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="1B365D"/>
        </w:tcBorders>
    ''')
    cell._tc.get_or_add_tcPr().append(borders)

    def add_info_row(label, text):
        p = cell.add_paragraph() if cell.paragraphs and cell.paragraphs[0].text else cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        r1 = p.add_run(label + ": ")
        r1.bold = True
        r1.font.size = Pt(10)
        r2 = p.add_run(text)
        r2.font.size = Pt(10)

    add_info_row("Platform Name", "Special Care 360 (Special Education Centre Management Platform)")
    add_info_row("Target Core Disorders", "1. Autism Spectrum Disorder (ASD)\n2. ADHD (Attention-Deficit / Hyperactivity Disorder)\n3. Down Syndrome (Trisomy 21)\n4. Cerebral Palsy (CP)")
    add_info_row("Target Age Range", "Pediatric to Adolescent (0 to 16 Years)")
    add_info_row("Target Reviewers", "Clinical Psychologists, Occupational Therapists (OT), Speech-Language Pathologists (SLP), Special Education Experts")
    add_info_row("Scope & Focus", "Therapeutic rehabilitation, behavioral management, sensory regulation, and adaptive daily living skills (No formal academic subjects).")
    add_info_row("Clinical Data Foundation", "Tri-Pillar Model (Pillar 1: Medical Diagnosis, Pillar 2: Daily ABC Behavioral Logs, Pillar 3: Active Skill Regressions)")
    add_info_row("Therapeutic Safety Directive", "No external unverified diagnoses. No prescription drugs. All AI suggestions serve as collaborative drafts subject to licensed clinical endorsement.")

    p_sep = doc.add_paragraph()
    p_sep.paragraph_format.space_before = Pt(8)
    p_sep.paragraph_format.space_after = Pt(8)

    # Section 1 Heading
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(10)
    h1.paragraph_format.space_after = Pt(4)
    rh1 = h1.add_run("PART 1: 13 VERIFIED CLINICAL CASE STUDIES")
    rh1.bold = True
    rh1.font.size = Pt(14)
    rh1.font.color.rgb = NAVY

    p_intro = doc.add_paragraph()
    p_intro.paragraph_format.space_after = Pt(10)
    r_intro = p_intro.add_run("Below are 13 real-world patient profiles across the 4 focus disorders. Each profile includes documented Antecedent-Behavior-Consequence (ABC) logs, regression alerts, and the corresponding AI-generated SMART Goal with its sequential milestones.")
    r_intro.font.size = Pt(10)
    r_intro.italic = True

    # Helper function to render a clear text case
    def add_text_case(group_heading, case_no, student_name, condition, details_list):
        if group_heading:
            gh = doc.add_paragraph()
            gh.paragraph_format.space_before = Pt(14)
            gh.paragraph_format.space_after = Pt(4)
            gr = gh.add_run(group_heading)
            gr.bold = True
            gr.font.size = Pt(12)
            gr.font.color.rgb = TEAL

        cp = doc.add_paragraph()
        cp.paragraph_format.space_before = Pt(6)
        cp.paragraph_format.space_after = Pt(2)
        cr = cp.add_run(f"Case {case_no}: {student_name} — {condition}")
        cr.bold = True
        cr.font.size = Pt(11.5)
        cr.font.color.rgb = NAVY

        for label, text, is_italic, is_bold in details_list:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.2)
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(2)
            
            rl = p.add_run(f"•  {label}: ")
            rl.bold = True
            rl.font.size = Pt(10)
            rl.font.color.rgb = DARK_GRAY
            
            rt = p.add_run(text)
            rt.font.size = Pt(10)
            if is_italic:
                rt.italic = True
            if is_bold:
                rt.bold = True

    # 13 Cases
    # 1
    add_text_case(
        "CATEGORY A: AUTISM SPECTRUM DISORDER (ASD)",
        "01", "Ahmed Hassan", "Autism Spectrum Disorder (Level 2) with Seizure & Allergy Protocols",
        [
            ("Patient Background", "Diagnosed with ASD Level 2. High sensitivity to sudden loud sounds. Has an active seizure action plan and peanut allergy.", False, False),
            ("First ABC Incident (Auditory Overload)", "Antecedent: Loud intercom announcement played unexpectedly in activity room.\nBehavior: Pressed hands over ears, screamed loudly, rocked body for 8 minutes (Severity 3/5).\nConsequence: Escorted by therapist to quiet sensory corner.", False, False),
            ("Second ABC Incident (Unannounced Transition)", "Antecedent: Abrupt transition from preferred coloring activity to fine-motor bead-stringing task with no prior warning.\nBehavior: Threw colored pencils and papers onto the floor, refused to move (Severity 4/5).\nConsequence: Staff provided 1-on-1 verbal calming and visual timer.", False, False),
            ("AI-Synthesized SMART Goal", '"Within 3 months, when loud intercom announcements or unannounced activity transitions occur, Ahmed will independently put on noise-cancelling headphones or follow a 3-step visual picture schedule, reducing crying and material-throwing meltdowns from 4 times per week to 1 time per week."', True, False),
            ("Clinical Milestones", "Milestone 1: Put on noise-cancelling headphones within 30 seconds of an alarm with gentle verbal guidance.\nMilestone 2: Follow a personal 3-step visual picture schedule when switching therapy tasks.\nMilestone 3: Present a visual 'Quiet Card' to staff to request a calm 2-minute break in 4 out of 5 distress situations.", False, False),
            ("Clinical Correlation", "Tri-Pillar Sensory & Routine Adaptation (Pillars 1 & 2) | Match: 93%", False, True)
        ]
    )

    # 2
    add_text_case(
        None,
        "02", "Zohaib Khan", "Autism Spectrum Disorder (Auditory Defensive Profile)",
        [
            ("Patient Background", "ASD with high acoustic defensiveness.", False, False),
            ("Documented ABC Incident", "Antecedent: Scheduled centre bell rang unexpectedly.\nBehavior: Bilateral body rocking, crying, hands over ears (Severity 3/5).\nConsequence: Guided into quiet room for 10 minutes.", False, False),
            ("AI Suggested Goal", '"Within 3 months, when loud bells ring, Zohaib will independently put on noise-cancelling headphones or display a break card, reducing screaming from 4 times weekly to 1 time weekly."', True, False),
            ("Clinical Milestones", "Milestone 1: Wear headphones 5 minutes prior to scheduled bells with therapist prompt.\nMilestone 2: Point to a 'Quiet Card' whenever room sound level exceeds personal comfort.\nMilestone 3: Walk calmly through hallways wearing headphones during transitions.", False, False),
            ("Clinical Correlation", "Behavioral Auditory Modulation (Pillar 2) | Match: 92%", False, True)
        ]
    )

    # 3
    add_text_case(
        None,
        "03", "Bilal Farooq", "Autism Spectrum Disorder with Severe Food Allergies",
        [
            ("Patient Background", "ASD Level 2 with severe peanut allergy and food texture aversion.", False, False),
            ("Documented ABC Incident", "Antecedent: Mixed-texture rice and lentil sauce placed on plate.\nBehavior: Oral gagging, shoved plate off table onto floor (Severity 3/5).\nConsequence: Meal removed and table cleaned.", False, False),
            ("AI Suggested Goal", '"Within 4 months, Bilal will comfortably smell, touch, and taste 2 new verified non-allergenic food textures during snack time without gagging or plate-shoving."', True, False),
            ("Clinical Milestones", "Milestone 1: Tolerate a new safe food texture resting on a discovery plate for 10 minutes.\nMilestone 2: Interact with and touch the food item using a utensil for 1 full minute.\nMilestone 3: Taste or lick a pea-sized trial sample of safe texture on 3 separate therapy days.", False, False),
            ("Clinical Correlation", "Sensory Desensitization & Allergen Safety (Pillars 1 & 2) | Match: 89%", False, True)
        ]
    )

    # 4
    add_text_case(
        None,
        "04", "Zayan Tariq", "Autism Spectrum Disorder (Level 3, Non-Verbal Elopement Risk)",
        [
            ("Patient Background", "ASD Level 3, non-verbal, minimal awareness of outdoor and traffic danger.", False, False),
            ("Documented ABC Incident", "Antecedent: Activity room exterior door opened during group outdoor transition.\nBehavior: Ran out of the room at full speed toward the exit stairs (Severity 5/5 Emergency Elopement).\nConsequence: Staff physically intercepted and returned child safely.", False, False),
            ("AI Suggested Goal", '"Within 3 months, during open-door transitions, Zayan will pause at red boundary floor lines and hold an escort ring with staff, achieving zero unescorted corridor elopements."', True, False),
            ("Clinical Milestones", "Milestone 1: Stop feet upon reaching a visual red 'STOP' line marked at doorway thresholds.\nMilestone 2: Grasp therapist\'s walking escort ring before stepping into the open corridor.\nMilestone 3: Walk alongside staff from room to outdoor sensory garden in 9 out of 10 daily trials without breaking grasp.", False, False),
            ("Clinical Correlation", "Immediate Life Safety & Environmental Boundaries (Pillar 2) | Match: 96%", False, True)
        ]
    )

    # 5
    add_text_case(
        None,
        "05", "Hamza Raza", "Autism Spectrum Disorder (Digital Device Transition Rigidity)",
        [
            ("Patient Background", "ASD Level 1, hyper-focused interest in interactive sensory tablets, extreme resistance to ending screen time.", False, False),
            ("Documented ABC Incident", "Antecedent: Interactive tablet sensory session ended after 20 minutes.\nBehavior: Screamed loudly, hurled tablet onto floor, aggressive crying (Severity 4/5).\nConsequence: Device placed away, child required 25 minutes of co-regulation.", False, False),
            ("AI Suggested Goal", '"Within 3 months, using 5-minute and 2-minute visual countdown timers, Hamza will dock his tablet and transition to table activities within 2 minutes peacefully in 4 of 5 sessions."', True, False),
            ("Clinical Milestones", "Milestone 1: Acknowledge the 5-minute yellow visual warning alarm with a thumbs-up gesture.\nMilestone 2: Place tablet into the charging station when the final tone sounds.\nMilestone 3: Transition to table activities using a visual schedule with zero verbal or physical protest.", False, False),
            ("Clinical Correlation", "Rigid Routine Flexibility & Visual Time Management (Pillar 2) | Match: 89%", False, True)
        ]
    )

    # 6
    add_text_case(
        None,
        "06", "Daniyal Ali", "Autism Spectrum Disorder (Pragmatic Social Communication Deficit)",
        [
            ("Patient Background", "ASD (Asperger profile). Adequate functional skills but marked difficulty in peer social interactions.", False, False),
            ("Documented ABC Incident", "Antecedent: Therapist assigned collaborative paired sensory play activity.\nBehavior: Withdrew, put head down on table, refused all verbal interaction with peer (Severity 2/5).\nConsequence: Therapist engaged with child individually.", False, False),
            ("AI Suggested Goal", '"Within 4 months, during structured pair activities, Daniyal will initiate 2 task-related questions to his peer using visual dialogue prompt cards in 3 of 4 therapy sessions."', True, False),
            ("Clinical Milestones", "Milestone 1: Rehearse 2 conversation question cards with speech therapist in 1-on-1 prep.\nMilestone 2: Deliver 1 structured question to a peer partner during a paired drawing exercise.\nMilestone 3: Exchange 2 reciprocating verbal remarks regarding the shared activity.", False, False),
            ("Clinical Correlation", "Pragmatic Social Communication (Pillars 1 & 3) | Match: 86%", False, True)
        ]
    )

    # 7
    add_text_case(
        None,
        "07", "Mustafa Kamal", "Autism Spectrum Disorder (Tactile Sensitivity with Skill Regression)",
        [
            ("Patient Background", "ASD Level 2 with sensory defensive profile and active fine motor/dressing regression.", False, False),
            ("Documented ABC Incident", "Antecedent: Loud crowded cafeteria during lunchtime.\nBehavior: High-pitched screaming, covered ears, dropped to floor (Severity 4/5).\nConsequence: Staff escorted student to quiet courtyard.", False, False),
            ("Active Skill Regression Alert", "Specific Regressed Skill: 'Independent Shoe-Tying & Adaptive Dressing' declined significantly from 75% baseline down to 25% following sensory defensiveness episode.", False, False),
            ("AI Unified SMART Goal", '"Within 3 months, during noisy transitional routines, Mustafa will put on noise-cancelling earmuffs and use adaptive loop footwear fasteners, reducing meltdowns from 4 times weekly to 1 time weekly and rehabilitating dressing independence from 25% to 70%."', True, False),
            ("Clinical Milestones", "Milestone 1: Don noise-cancelling earmuffs within 30 seconds of high ambient cafeteria noise.\nMilestone 2: Fasten adaptive loop footwear with 50% independence during occupational therapy sessions.\nMilestone 3: Fasten shoes independently prior to outdoor play in 4 of 5 sessions.", False, False),
            ("Clinical Correlation", "Cross-Pillar Sensory Coping & Skill Regression Recovery (Pillars 2 & 3) | Match: 94%", False, True)
        ]
    )

    # 8
    add_text_case(
        "CATEGORY B: ATTENTION-DEFICIT / HYPERACTIVITY DISORDER (ADHD)",
        "08", "Sara Ahmed", "ADHD (Combined Inattentive & Hyperactive-Impulsive Type)",
        [
            ("Patient Background", "ADHD with high motor restlessness and vulnerability to extraneous environmental stimuli.", False, False),
            ("First ABC Incident (Sedentary Fatigue)", "Antecedent: Continuous tabletop pegboard coordination activity lasting longer than 10 minutes.\nBehavior: Tipped chair backward, left table, wandered around room, disrupted peers (Severity 2/5).\nConsequence: Therapist provided a 1-minute movement stretch.", False, False),
            ("Second ABC Incident (Window Distraction)", "Antecedent: Table faced window showing children playing outside during puzzle assembly.\nBehavior: Tapped puzzle pieces loudly, stared out window, refused task (Severity 2/5).\nConsequence: Table oriented inward away from window.", False, False),
            ("AI-Synthesized SMART Goal", '"Within 3 months, during structured tabletop activities, Sara will sustain seated on-task attention for 15 continuous minutes using an active sensory cushion, window visual shielding, and a visual sand timer in 4 of 5 sessions."', True, False),
            ("Clinical Milestones", "Milestone 1: Remain seated on an active wobble cushion with a 10-minute visual sand timer for fine-motor tasks.\nMilestone 2: Use a silent handheld tactile fidget tool at an interior-facing table to complete 1 puzzle assembly without vocal or repetitive tapping.\nMilestone 3: Proactively hold up a 'Movement Pass' to request a 1-minute scheduled motor break instead of leaving table unprompted.", False, False),
            ("Clinical Correlation", "Attention Regulation & Physical Activity Structuring (Pillar 2) | Match: 89%", False, True)
        ]
    )

    # 9
    add_text_case(
        None,
        "09", "Ayla Noor", "ADHD (Predominantly Hyperactive Impulsive Type)",
        [
            ("Patient Background", "ADHD with pronounced hyperactivity and difficulty with sustained sedentary tasks.", False, False),
            ("Documented ABC Incident", "Antecedent: 30-minute quiet therapeutic table activity.\nBehavior: Repeatedly got out of chair, drummed fingers on table, wandered to peer tables (Severity 2/5).\nConsequence: Therapist gave repeated verbal reminders.", False, False),
            ("AI Suggested Goal", '"Within 3 months, Ayla will remain seated and engaged in structured therapy activities for 15 continuous minutes using a sensory balance cushion and visual sand timer."', True, False),
            ("Clinical Milestones", "Milestone 1: Complete table activity for 5 minutes using a silent handheld fidget tool.\nMilestone 2: Complete 1 sorting activity within a 10-minute visual sand timer interval.\nMilestone 3: Request a structured 1-minute movement break via a picture card instead of standing up unannounced.", False, False),
            ("Clinical Correlation", "Attention Endurance & Motor Pacing (Pillar 2) | Match: 88%", False, True)
        ]
    )

    # 10
    add_text_case(
        None,
        "10", "Rayan Kashif", "ADHD with Proprioceptive Sensory Seeking (Motor Crashing)",
        [
            ("Patient Background", "ADHD coupled with high sensory seeking; seeks strong joint compression and movement feedback.", False, False),
            ("Documented ABC Incident", "Antecedent: Morning carpet circle gathering with group.\nBehavior: Threw body onto peers, rolled aggressively across carpet (Severity 3/5).\nConsequence: Guided out of circle to separate mat.", False, False),
            ("AI Suggested Goal", '"Within 3 months, Rayan will complete 5 minutes of targeted proprioceptive heavy-work exercises prior to circle time, remaining seated on a balance cushion for 12 minutes without peer collision."', True, False),
            ("Clinical Milestones", "Milestone 1: Push a 6-lb weighted therapy ball across the gym for 3 minutes before morning group.\nMilestone 2: Sit on a balance wobble cushion for 10 minutes during morning group session.\nMilestone 3: Squeeze resistance therapy dough when feeling an internal impulse to jump or crash.", False, False),
            ("Clinical Correlation", "Proprioceptive Neuromotor Regulation (Pillars 1 & 2) | Match: 91%", False, True)
        ]
    )

    # 11
    add_text_case(
        "CATEGORY C: DOWN SYNDROME (TRISOMY 21)",
        "11", "Omar Malik", "Down Syndrome with Speech-Language & Articulation Delay",
        [
            ("Patient Background", "Down Syndrome with expressive language impairment; uses gesture and basic vocalization.", False, False),
            ("Documented ABC Incident", "Antecedent: Peer took shared coloring crayon during group art.\nBehavior: Pushed peer's shoulder, cried loudly, grabbed crayon back (Severity 3/5).\nConsequence: Crayon removed by therapist; brief calming pause given.", False, False),
            ("AI Suggested Goal", '"Within 3 months, when Omar desires a shared toy or utensil, he will use his AAC speech tablet or hand a \'My Turn\' picture card in 80% of opportunities instead of pushing."', True, False),
            ("Clinical Milestones", "Milestone 1: Press the 'Turn' icon on speech tablet with hand guidance during therapy.\nMilestone 2: Hand 'My Turn' PECS card to instructor when wanting a shared centre object.\nMilestone 3: Wait patiently for 30 seconds after presenting request card before receiving the item in 4 of 5 trials.", False, False),
            ("Clinical Correlation", "AAC Speech Communication & Peer Socialization (Pillars 1 & 2) | Match: 90%", False, True)
        ]
    )

    # 12
    add_text_case(
        None,
        "12", "Zainab Shah", "Down Syndrome with Task Transition & Cleanup Avoidance",
        [
            ("Patient Background", "Down Syndrome, moderate intellectual developmental delay, strong attachment to ongoing play routines.", False, False),
            ("Documented ABC Incident", "Antecedent: Activity cleanup bell sounded and storage box presented.\nBehavior: Threw toy bin onto floor, yelled 'No!', dropped down onto carpet (Severity 3/5).\nConsequence: Staff provided hand-over-hand physical support to clean up.", False, False),
            ("AI Suggested Goal", '"Within 3 months, during cleanup transitions, Zainab will follow a 3-step \'First Pack-Up, Then Snack\' visual schedule to place 3 toys into bins cooperatively in 4 of 5 trials."', True, False),
            ("Clinical Milestones", "Milestone 1: Pick up and place 1 toy into storage bin with hand-over-hand physical cue.\nMilestone 2: Put away 3 toys independently following verbal prompt and visual token board.\nMilestone 3: Transition calmly to the snack table following pack-up with zero floor-dropping.", False, False),
            ("Clinical Correlation", "Behavioral Compliance & Visual Sequence Structuring (Pillar 2) | Match: 88%", False, True)
        ]
    )

    # 13
    add_text_case(
        "CATEGORY D: CEREBRAL PALSY (CP)",
        "13", "Zara Khan", "Cerebral Palsy (Spastic Diplegia with Feeding Skill Regression)",
        [
            ("Patient Background", "Cerebral Palsy (Spastic Diplegia), manual wheelchair user, fine motor grasp weakness.", False, False),
            ("Documented ABC Incident", "Antecedent: Lunch served in cafeteria with standard narrow cutlery.\nBehavior: Struggled to grip spoon, spilled soup, threw spoon onto floor in frustration and wept (Severity 3/5).\nConsequence: Assisted with hand-feeding by caregiver.", False, False),
            ("Active Skill Regression Alert", "Specific Regressed Skill: 'Palmar Utensil Grasp for Self-Feeding' dropped severely from 80% mastery down to 35% following a 3-week physical therapy hiatus.", False, False),
            ("AI-Synthesized SMART Goal", '"Within 6 months, Zara will independently eat snack and lunch using an angled ergonomic adaptive spoon for 15 minutes, rehabilitating self-feeding grasp proficiency from 35% to 75%."', True, False),
            ("Clinical Milestones", "Milestone 1: Perform 3 minutes of finger squeeze exercises with soft therapeutic putty prior to eating.\nMilestone 2: Scoop 5 spoonfuls of food independently with an angled wide-grip adaptive spoon with less than 2 spills.\nMilestone 3: Complete 75% of full snack meal independently with standby supervision only.", False, False),
            ("Clinical Correlation", "Neuromotor Rehabilitation & Functional Independence (Pillars 2 & 3) | Match: 95%", False, True)
        ]
    )

    # Page Break for Scoring Rubric
    doc.add_page_break()

    # Section 2 Heading
    h2 = doc.add_paragraph()
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(4)
    rh2 = h2.add_run("PART 2: CLINICAL SCORING RUBRIC")
    rh2.bold = True
    rh2.font.size = Pt(14)
    rh2.font.color.rgb = NAVY

    p_rub_info = doc.add_paragraph()
    p_rub_info.paragraph_format.space_after = Pt(8)
    r_ri = p_rub_info.add_run("Please rate each patient case study across the 6 clinical criteria using the standard 1 to 5 scale:\n1 = Poor  |  2 = Needs Work  |  3 = Acceptable  |  4 = Good  |  5 = Excellent")
    r_ri.font.size = Pt(9.5)
    r_ri.bold = True
    r_ri.font.color.rgb = DARK_GRAY

    # Table
    table_headers = ["Case #", "Student Name", "Core Disorder", "1. Safety", "2. Rel.", "3. SMART", "4. Pract.", "5. Pos.", "6. Corr.", "Overall Score"]
    rows_data = [
        ["01", "Ahmed Hassan", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["02", "Zohaib Khan", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["03", "Bilal Farooq", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["04", "Zayan Tariq", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["05", "Hamza Raza", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["06", "Daniyal Ali", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["07", "Mustafa Kamal", "Autism Spectrum Disorder", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["08", "Sara Ahmed", "ADHD (Inattentive/Hyperactive)", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["09", "Ayla Noor", "ADHD (Predominantly Hyperactive)", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["10", "Rayan Kashif", "ADHD (Proprioceptive Seeking)", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["11", "Omar Malik", "Down Syndrome (Trisomy 21)", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["12", "Zainab Shah", "Down Syndrome (Trisomy 21)", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["13", "Zara Khan", "Cerebral Palsy (Spastic Diplegia)", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5"],
        ["AVG", "ALL CASES COMPOSITE AVERAGE", "Multi-Disorder Benchmark", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[   ]", "[      ] / 5.0"]
    ]

    rub_tbl = doc.add_table(rows=len(rows_data)+1, cols=10)
    rub_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    widths = [Inches(0.55), Inches(1.15), Inches(1.65), Inches(0.45), Inches(0.45), Inches(0.45), Inches(0.45), Inches(0.45), Inches(0.45), Inches(0.95)]

    # Header Row
    hdr_row = rub_tbl.rows[0]
    for c_idx, h_text in enumerate(table_headers):
        cell = hdr_row.cells[c_idx]
        cell.width = widths[c_idx]
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="1B365D"/>')
        cell._tc.get_or_add_tcPr().append(shd)
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        if c_idx in [0, 3, 4, 5, 6, 7, 8, 9]:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h_text)
        r.bold = True
        r.font.size = Pt(8.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # Data Rows
    for r_idx, r_vals in enumerate(rows_data):
        row = rub_tbl.rows[r_idx + 1]
        is_avg = (r_idx == len(rows_data) - 1)
        
        for c_idx, val in enumerate(r_vals):
            cell = row.cells[c_idx]
            cell.width = widths[c_idx]
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2.5)
            p.paragraph_format.space_after = Pt(2.5)
            if c_idx in [0, 3, 4, 5, 6, 7, 8, 9]:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            r = p.add_run(val)
            r.font.size = Pt(8.5)

            if is_avg:
                r.bold = True
                r.font.color.rgb = NAVY
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="EAF0F6"/>')
                cell._tc.get_or_add_tcPr().append(shd)
            elif r_idx % 2 == 1:
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F8F9FA"/>')
                cell._tc.get_or_add_tcPr().append(shd)

            # Borders
            b_xml = parse_xml(f'''
                <w:tcBorders {nsdecls("w")}>
                    <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                    <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                    <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                </w:tcBorders>
            ''')
            cell._tc.get_or_add_tcPr().append(b_xml)

    # Section 3: Sign Off
    h3 = doc.add_paragraph()
    h3.paragraph_format.space_before = Pt(16)
    h3.paragraph_format.space_after = Pt(4)
    rh3 = h3.add_run("PART 3: EXPERT CLINICAL VALIDATION & SIGN-OFF")
    rh3.bold = True
    rh3.font.size = Pt(14)
    rh3.font.color.rgb = NAVY

    sign_tbl = doc.add_table(rows=1, cols=1)
    sign_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = sign_tbl.cell(0, 0)
    c.width = Inches(7.0)
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F4F6F9"/>')
    c._tc.get_or_add_tcPr().append(shd)

    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="6" w:space="0" w:color="1B365D"/>
            <w:left w:val="single" w:sz="20" w:space="0" w:color="1B365D"/>
            <w:bottom w:val="single" w:sz="6" w:space="0" w:color="1B365D"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="1B365D"/>
        </w:tcBorders>
    ''')
    c._tc.get_or_add_tcPr().append(borders)

    p = c.paragraphs[0]
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    
    r = p.add_run("Clinical Safety & Appropriateness Verdict:\n")
    r.bold = True
    p.add_run("[   ] Approved: The AI goals and milestones are clinically sound, constructive, and safe.\n")
    p.add_run("[   ] Approved with Minor Therapist Adjustments: Suitable as an assistive draft requiring slight personalization.\n")
    p.add_run("[   ] Not Approved: Requires substantial rework before clinical application.\n\n")

    r = p.add_run("Qualitative Remarks & Professional Feedback:\n")
    r.bold = True
    p.add_run("_________________________________________________________________________________\n" * 4)
    p.add_run("\n")

    r = p.add_run("Evaluator Credentials & Institutional Endorsement:\n")
    r.bold = True
    p.add_run("Doctor / Psychologist / Evaluator Full Name: ___________________________________________________\n")
    p.add_run("Clinical Title / Designation: _________________________________________________________________\n")
    p.add_run("Hospital / Special Education Centre / University: _____________________________________________\n")
    p.add_run("Date of Review: ______________________             Official Signature & Stamp: __________________\n")

    save_path = r"c:\Users\HP\Downloads\fyp\docs\CLINICAL_EVALUATION_FORM.docx"
    try:
        doc.save(save_path)
        print(f"Updated Clean Word Document saved successfully at: {save_path}")
    except PermissionError:
        alt_path = r"c:\Users\HP\Downloads\fyp\docs\CLINICAL_EVALUATION_FORM_UPDATED.docx"
        doc.save(alt_path)
        print(f"Original file was open in Word. Saved to: {alt_path}")

if __name__ == "__main__":
    create_clean_text_docx()
