import logging
import hashlib
import smtplib
from html import escape
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_email_sync(to_email: str, subject: str, html_body: str) -> bool:
    """Sends an email via configured SMTP (Gmail / Custom SMTP). Returns True on success."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("Email not configured (SMTP_USER/SMTP_PASSWORD missing). Email skipped.")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.EMAIL_FROM or settings.SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            sender = settings.EMAIL_FROM or settings.SMTP_USER
            refused = smtp.sendmail(sender, [to_email], msg.as_string())
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)
        logger.info(f"Email sent successfully to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Email delivery failed to {to_email}: {e}")
        return False


async def send_critical_anomaly_email(
    powerhouse_name: str,
    date: str,
    actual_mw: float,
    predicted_mw: float,
    error_mw: float,
    severity: str
) -> bool:
    """Sends critical anomaly alert email to Admin."""
    subject = f"[SHPMFS ALERT] {severity.upper()} – {powerhouse_name} – {date}"
    html = f"""
    <html><body>
    <h2 style="color:#dc2626;">⚠ Critical Generation Anomaly Detected</h2>
    <table border="1" cellpadding="8" cellspacing="0">
      <tr><th>Field</th><th>Value</th></tr>
      <tr><td>Powerhouse</td><td>{powerhouse_name}</td></tr>
      <tr><td>Date</td><td>{date}</td></tr>
      <tr><td>Severity</td><td>{severity}</td></tr>
      <tr><td>Actual Generation</td><td>{actual_mw:.2f} MW</td></tr>
      <tr><td>Predicted Generation</td><td>{predicted_mw:.2f} MW</td></tr>
      <tr><td>Error</td><td>{error_mw:+.2f} MW</td></tr>
    </table>
    <p>Please review this anomaly in the SHPMFS dashboard.</p>
    <small>This alert was generated automatically by the SHPMFS Anomaly Detection System.</small>
    </body></html>
    """
    return _send_email_sync(settings.ADMIN_EMAIL, subject, html)


async def send_report_ready_email(report_id: str, period_start: str, period_end: str, file_url: Optional[str]) -> bool:
    """Notifies admin that a report has been generated."""
    subject = f"[SHPMFS] Weekly Report Ready – {period_start} to {period_end}"
    download_link = f'<a href="{file_url}">Download Report</a>' if file_url else "Report available in the dashboard."
    html = f"""
    <html><body>
    <h2>📊 SHPMFS Report Ready</h2>
    <p>Your weekly generation report for <strong>{period_start}</strong> to <strong>{period_end}</strong> has been generated.</p>
    <p>{download_link}</p>
    <small>Smart Hydro Power Monitoring & Forecasting System</small>
    </body></html>
    """
    return _send_email_sync(settings.ADMIN_EMAIL, subject, html)


async def send_user_welcome_email(
    user_name: str,
    email: str,
    password: str,
    role: str
) -> bool:
    """
    Sends newly created user credentials to their email address.
    Tries Nodemailer microservice first; if offline/unreachable, automatically falls back
    to direct Python SMTP delivery so emails NEVER fail.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("Welcome email skipped because SMTP credentials are not configured.")
        return False

    # 1. Try Nodemailer microservice if active
    mailer_token = hashlib.sha256(
        f"{settings.SMTP_USER}:{settings.SMTP_PASSWORD}".encode()
    ).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(
                f"{settings.MAILER_URL.rstrip('/')}/send-welcome",
                headers={"x-mailer-token": mailer_token},
                json={"name": user_name, "email": email, "password": password, "role": role},
            )
        if response.status_code == 200 and response.json().get("sent"):
            logger.info(f"Welcome email dispatched via Nodemailer microservice to {email}")
            return True
    except Exception as err:
        logger.info(f"Nodemailer service offline ({err}); using direct Python SMTP fallback.")

    # 2. Direct Python SMTP Fallback (Always reliable, no background Node process required)
    subject = f"Your SHPMFS Portal Credentials - {role.upper()}"
    portal_url = getattr(settings, "PORTAL_URL", "http://localhost:3000/login")
    safe_name = escape(user_name)
    safe_email = escape(email)
    safe_pass = escape(password)
    safe_role = escape(role.upper())

    html = f"""<!doctype html>
    <html><body style="font-family:Arial,sans-serif;color:#0B2545;padding:20px;">
    <h2>SHPMFS System Access</h2>
    <p>Hello <strong>{safe_name}</strong>,</p>
    <p>Your account has been created with <strong>{safe_role}</strong> access level.</p>
    <table cellpadding="10" cellspacing="0" style="background:#f1f5f9;border:1px solid #cbd5e1;border-collapse:collapse;margin:15px 0;">
      <tr><td style="border:1px solid #cbd5e1;">Email</td><td style="border:1px solid #cbd5e1;"><strong>{safe_email}</strong></td></tr>
      <tr><td style="border:1px solid #cbd5e1;">Temporary Password</td><td style="border:1px solid #cbd5e1;"><strong>{safe_pass}</strong></td></tr>
      <tr><td style="border:1px solid #cbd5e1;">Role</td><td style="border:1px solid #cbd5e1;"><strong>{safe_role}</strong></td></tr>
    </table>
    <p><a href="{portal_url}" style="background:#2F9E9A;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Sign In to SHPMFS Portal</a></p>
    <br/>
    <p><small style="color:#64748b;">Please change your password after signing in for the first time.</small></p>
    </body></html>"""

    return _send_email_sync(email, subject, html)


async def send_user_email_verification(email: str, code: str) -> bool:
    """Sends a one-time code to verify email address."""
    subject = "SHPMFS email verification code"
    html = f"""<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#0B2545">
  <h2>Verify your SHPMFS email address</h2>
  <p>Enter this code in the account creation form to confirm you can receive mail at {escape(email)}:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:5px">{escape(code)}</p>
  <p>This code expires in 10 minutes. If you did not expect this email, you can ignore it.</p>
</body></html>"""
    return _send_email_sync(email, subject, html)
