"""
Botivate HR Support - Email Utility
Sends credential distribution and notification emails using company-configured SMTP.
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from app.config import settings
from jinja2 import Template
import asyncio


# ── Professional Email Templates ──────────────────────────

COMMON_STYLE = """
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 30px 10px; margin: 0; color: #374151; }
  .email-wrapper { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb; }
  .header { background: #2563eb; padding: 40px 20px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; }
  .body { padding: 35px; line-height: 1.5; }
  .body h2 { color: #111827; font-size: 22px; margin-top: 0; margin-bottom: 20px; text-align: center; }
  .body p { margin-bottom: 20px; color: #4b5563; font-size: 16px; text-align: center; }
  .credential-card { background: #f9fafb; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #f3f4f6; }
  .credential-row { padding: 12px 0; border-bottom: 1px solid #f3f4f6; display: block; }
  .credential-row:last-child { border-bottom: none; }
  .label { color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px; }
  .value { color: #111827; font-weight: 500; font-size: 16px; word-break: break-all; display: block; }
  .btn-container { text-align: center; margin-top: 30px; }
  .btn { display: inline-block; background: #2563eb; color: #ffffff !important; padding: 15px 35px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; }
  .footer { background: #f9fafb; padding: 25px; text-align: center; border-top: 1px solid #f3f4f6; }
  .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
"""

WELCOME_TEMPLATE = Template(f"""
<!DOCTYPE html>
<html>
<head><style>{COMMON_STYLE}</style></head>
<body>
<div class="email-wrapper">
  <div class="header"><h1>{{{{ company_name }}}}</h1></div>
  <div class="body">
    <h2>Welcome to the Team! 👋</h2>
    <p>Hello there! Your account on the <strong>Botivate HR Portal</strong> has been successfully created. You can now log in to manage your profile, view policies, and submit requests.</p>
    
    <div class="credential-card">
      <div class="credential-row"><span class="label">Company ID</span><span class="value">{{{{ company_id }}}}</span></div>
      <div class="credential-row"><span class="label">Employee ID</span><span class="value">{{{{ employee_id }}}}</span></div>
      <div class="credential-row"><span class="label">Temporary Password</span><span class="value">{{{{ password }}}}</span></div>
    </div>
    
    <div class="btn-container">
      <a href="{{{{ login_link }}}}" class="btn">Login to HR Portal</a>
    </div>
    <p style="margin-top: 24px; font-size: 14px; color: #6b7280; text-align: center;">For security, please change your password immediately after your first login.</p>
  </div>
  <div class="footer">
    <p>© 2026 {{{{ company_name }}}}. All rights reserved.<br>Authorized Personnel Only.</p>
  </div>
</div>
</body>
</html>
""")

PASSWORD_UPDATE_TEMPLATE = Template(f"""
<!DOCTYPE html>
<html>
<head><style>{COMMON_STYLE}</style></head>
<body>
<div class="email-wrapper">
  <div class="header" style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);"><h1>Security Update</h1></div>
  <div class="body">
    <h2>Password Updated Successfully 🔐</h2>
    <p>Your password for <strong>{{{{ company_name }}}}</strong> HR Portal has been recently updated by the administrator. Please use the new credentials below for your next login.</p>
    
    <div class="credential-card">
      <div class="credential-row"><span class="label">Company ID</span><span class="value">{{{{ company_id }}}}</span></div>
      <div class="credential-row"><span class="label">Employee ID</span><span class="value">{{{{ employee_id }}}}</span></div>
      <div class="credential-row"><span class="label">New Password</span><span class="value" style="color: #2563eb;">{{{{ password }}}}</span></div>
    </div>
    
    <div class="btn-container">
      <a href="{{{{ login_link }}}}" class="btn" style="background: #4f46e5;">Access My Account</a>
    </div>
    <p style="margin-top: 24px; font-size: 14px; color: #ef4444; text-align: center;">If you did not expect this change, please contact your HR department immediately.</p>
  </div>
  <div class="footer">
    <p>Security Notification from {{{{ company_name }}}}.<br>This is an automated message, do not reply.</p>
  </div>
</div>
</body>
</html>
""")


NOTIFICATION_TEMPLATE = Template("""
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; padding: 30px; }
  .card { background: #fff; border-radius: 12px; padding: 40px; max-width: 500px; margin: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  h2 { color: #1a1a2e; }
  p { color: #555; line-height: 1.6; }
  .btn { display: block; text-align: center; background: #6C63FF; color: #fff !important;
         padding: 14px; border-radius: 8px; text-decoration: none; font-weight: 600;
         margin-top: 20px; }
</style></head>
<body>
<div class="card">
  <h2>{{ title }}</h2>
  <p>{{ message }}</p>
  {% if login_link %}
  <a class="btn" href="{{ login_link }}">Open HR Portal</a>
  {% endif %}
</div>
</body>
</html>
""")


async def send_auth_email(
    to_email: str,
    email_type: str,  # 'welcome' or 'password_update'
    company_name: str,
    company_id: str,
    employee_id: str,
    password: str,
    login_link: str,
    from_email: str,
    from_password: str,
) -> bool:
    """Send professional authentication emails (Welcome or Password Update)."""
    
    if email_type == "welcome":
        template = WELCOME_TEMPLATE
        subject = f"Welcome to {company_name} - Access Your HR Portal"
    else:
        template = PASSWORD_UPDATE_TEMPLATE
        subject = f"Security Notification: Your Password for {company_name} has been updated"

    html_body = template.render(
        company_name=company_name,
        company_id=company_id,
        employee_id=employee_id,
        password=password,
        login_link=login_link,
    )

    msg = MIMEMultipart("alternative")
    sender_email = settings.smtp_user or from_email
    msg["From"] = sender_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    # LOCAL TESTING MODE: Mock only if SMTP is not configured
    if not settings.smtp_password or settings.smtp_password == "your-email-password-here":
        print("="*60)
        print(f"📧 [LOCAL MOCK EMAIL] Type: {email_type.upper()} | To: {to_email}")
        print(f"📧 Subject: {subject}")
        print(f"📧 Credentials: {employee_id} / {password}")
        print("="*60)
        return True

    def _send_sync():
        try:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            if settings.smtp_use_tls:
                server.starttls()
            server.login(settings.smtp_user or from_email, settings.smtp_password or from_password)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as e:
            print(f"[EMAIL ERROR] Failed to send {email_type} email to {to_email}: {e}")
            return False

    return await asyncio.to_thread(_send_sync)


async def send_notification_email(
    to_email: str,
    title: str,
    message: str,
    from_email: str,
    from_password: str,
    login_link: Optional[str] = None,
) -> bool:
    """Send a notification email (approval request, status update, reminder, etc.)"""
    html_body = NOTIFICATION_TEMPLATE.render(
        title=title,
        message=message,
        login_link=login_link,
    )

    msg = MIMEMultipart("alternative")
    sender_email = settings.smtp_user or from_email
    msg["From"] = sender_email
    msg["To"] = to_email
    msg["Subject"] = title
    msg.attach(MIMEText(html_body, "html"))

    # LOCAL TESTING MODE: If no password is provided, just print the email to the console!
    if not settings.smtp_password or settings.smtp_password == "your-email-password-here":
        print("="*60)
        print(f"📧 [LOCAL MOCK NOTIFICATION] To: {to_email}")
        print(f"📧 Subject: {title}")
        print(f"📧 Message: {message}")
        if login_link:
            print(f"📧 Link: {login_link}")
        print("="*60)
        return True

    def _send_sync_notif():
        try:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            if settings.smtp_use_tls:
                server.starttls()
            server.login(settings.smtp_user or from_email, settings.smtp_password or from_password)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as e:
            print(f"[EMAIL ERROR] Failed to send notification to {to_email}: {e}")
            return False

    return await asyncio.to_thread(_send_sync_notif)
