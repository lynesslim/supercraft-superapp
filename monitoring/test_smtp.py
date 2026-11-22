#!/usr/bin/env python3
"""
Hostinger SMTP Test Utility
Quickly verifies SMTP connection, authentication, and sends a test email.
"""

import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

# Try loading .env or .env.local
def load_env_file(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                if key not in os.environ:
                    os.environ[key] = val

root_dir = Path(__file__).resolve().parent.parent
load_env_file(root_dir / ".env.local")
load_env_file(root_dir / ".env")


def test_smtp():
    host = os.getenv("SMTP_HOST", "smtp.hostinger.com")
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    raw_from = os.getenv("SMTP_FROM", "")
    if user and ("<" in raw_from and ">" in raw_from):
        display_name = raw_from.split("<")[0].strip()
        sender = f"{display_name} <{user}>" if display_name else f"<{user}>"
    elif user:
        sender = f"Supercraft Monitor <{user}>"
    else:
        sender = raw_from or "alerts@supercraft.my"
    recipient = os.getenv("SMTP_TEST_RECIPIENT", "dev.supercraft@gmail.com")

    print("=" * 60)
    print("Hostinger SMTP Configuration Test")
    print("=" * 60)
    print(f"Host:      {host}")
    print(f"Port:      {port}")
    print(f"User:      {user}")
    print(f"Sender:    {sender}")
    print(f"Recipient: {recipient}")
    print("=" * 60)

    if not user or not password:
        print("\n❌ Error: SMTP_USER and SMTP_PASS must be set in your environment or .env.local")
        print("Example settings in .env.local:")
        print("SMTP_HOST=smtp.hostinger.com")
        print("SMTP_PORT=465")
        print("SMTP_USER=alerts@yourdomain.com")
        print("SMTP_PASS=your_hostinger_password")
        print("SMTP_FROM=Supercraft Monitor <alerts@yourdomain.com>")
        sys.exit(1)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "🧪 Test Email: Supercraft Monitoring System"
    msg["From"] = sender
    msg["To"] = recipient

    html = f"""
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #111310; color: #f4f6ea; padding: 24px;">
        <div style="max-width: 540px; margin: 0 auto; background: #1b1d19; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px;">
          <h2 style="color: #a3b840; margin-top: 0;">Hostinger SMTP Connected Successfully!</h2>
          <p style="color: #c9ccc2; font-size: 14px; line-height: 1.6;">
            This test email confirms that your Hostinger SMTP credentials are correct and ready for sending automated website health alerts.
          </p>
          <div style="margin: 16px 0; padding: 12px; background: rgba(163,184,64,0.1); border-left: 3px solid #a3b840; border-radius: 4px; font-size: 13px; color: #e8eae0;">
            <strong>SMTP Host:</strong> {host}:{port}<br>
            <strong>Authenticated User:</strong> {user}
          </div>
          <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin-bottom: 0;">
            Supercraft Website Health & Integrity Monitor
          </p>
        </div>
      </body>
    </html>
    """
    msg.attach(MIMEText(html, "html"))

    try:
        print(f"Connecting to {host}:{port}...")
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
            server.starttls()

        print("Authenticating...")
        server.login(user, password)
        print("Sending test message...")
        server.send_message(msg)
        server.quit()
        print(f"\n✅ Success! Test email sent successfully to {recipient}")
    except Exception as e:
        print(f"\n❌ SMTP Connection Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_smtp()

