import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from firebase_admin_init import get_db

def send_panic_email_alert(alert_data: dict) -> bool:
    """
    Sends an HTML email alert to all center admins and the default recipient
    configured in the environment variables when a panic alert is triggered.
    """
    # Load SMTP config from environment variables
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT", "587")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)
    default_recipient = os.getenv("PANIC_ALERT_RECIPIENT_EMAIL")

    if not smtp_host or not smtp_user or not smtp_password:
        logging.warning(
            "[Email Alert] SMTP configuration is missing! Email notifications will be skipped.\n"
            "To enable email alerts, configure the following in backend/.env:\n"
            "SMTP_HOST, SMTP_USER, SMTP_PASSWORD, PANIC_ALERT_RECIPIENT_EMAIL"
        )
        return False

    recipients = []
    if default_recipient:
        recipients.append(default_recipient.strip())

    # Dynamically fetch all administrators in this center
    center_id = alert_data.get("centerId", "demo-center-001")
    try:
        db = get_db()
        admin_docs = (
            db.collection("users")
            .where("centerId", "==", center_id)
            .where("role", "==", "admin")
            .stream()
        )
        for admin in admin_docs:
            admin_data = admin.to_dict()
            email = admin_data.get("email")
            if email and email.strip() and email.strip() not in recipients:
                recipients.append(email.strip())
    except Exception as db_err:
        logging.error(f"[Email Alert] Failed to fetch center admins from Firestore: {db_err}")

    if not recipients:
        logging.warning(f"[Email Alert] No recipients found for center '{center_id}'. Skipping email.")
        return False

    # Construct HTML Email Body
    emergency_type = alert_data.get("emergencyType", "Emergency")
    location = alert_data.get("location", "Unknown Location")
    reported_by = alert_data.get("reportedBy", {})
    reporter_name = reported_by.get("name", "Staff Member") if isinstance(reported_by, dict) else str(reported_by)
    description = alert_data.get("description", "") or "No additional description provided."
    timestamp = alert_data.get("timestamp", "Just now")

    subject = f"🚨 PANIC ALERT: {emergency_type} in {location}"

    body_html = f"""
    <html>
    <head>
        <style>
            .container {{
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                border: 3px solid #e53e3e;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
            }}
            .header {{
                background-color: #e53e3e;
                color: white;
                text-align: center;
                padding: 20px;
                margin: 0;
            }}
            .content {{
                padding: 24px;
                background-color: #fffaf0;
            }}
            .alert-table {{
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
            }}
            .alert-table td {{
                padding: 12px;
                border-bottom: 1px solid #e2e8f0;
                font-size: 15px;
            }}
            .label {{
                font-weight: bold;
                color: #4a5568;
                width: 35%;
            }}
            .value {{
                color: #2d3748;
            }}
            .value-highlight {{
                color: #e53e3e;
                font-weight: bold;
            }}
            .footer {{
                background-color: #edf2f7;
                padding: 16px;
                text-align: center;
                font-size: 12px;
                color: #718096;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0; font-size: 24px; letter-spacing: 0.05em;">🚨 PANIC ALERT TRIGGERED 🚨</h1>
            </div>
            <div class="content">
                <p style="font-size: 16px; margin-top: 0; color: #2d3748; line-height: 1.5;">
                    An emergency panic alert has been triggered at your center. Please inspect the details below and take immediate action.
                </p>
                <table class="alert-table">
                    <tr>
                        <td class="label">Emergency Type</td>
                        <td class="value value-highlight">{emergency_type}</td>
                    </tr>
                    <tr>
                        <td class="label">Location</td>
                        <td class="value" style="font-weight: 600;">{location}</td>
                    </tr>
                    <tr>
                        <td class="label">Reported By</td>
                        <td class="value">{reporter_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Timestamp</td>
                        <td class="value">{timestamp}</td>
                    </tr>
                    <tr>
                        <td class="label">Details</td>
                        <td class="value" style="font-style: italic;">{description}</td>
                    </tr>
                </table>
                <p style="color: #c53030; font-weight: bold; font-size: 14px; text-align: center; margin: 24px 0 0;">
                    Please contact the classroom or locate the student immediately.
                </p>
            </div>
            <div class="footer">
                This is an automated notification from Special Care 360 Emergency System.
            </div>
        </div>
    </body>
    </html>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(body_html, "html"))

        # Setup server connection
        port = int(smtp_port)
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_host, port)
        else:
            server = smtplib.SMTP(smtp_host, port)
            if port == 587:
                server.starttls()

        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_from, recipients, msg.as_string())
        server.quit()

        logging.info(f"[Email Alert] Panic alert successfully emailed to: {', '.join(recipients)}")
        return True
    except Exception as err:
        logging.error(f"[Email Alert] Failed to send email alert: {err}")
        return False
