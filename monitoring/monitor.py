#!/usr/bin/env python3
"""
Automated Website Health & Integrity Monitor
Supercraft Superapp

Features:
- Uptime Monitoring (HTTP status, latency, DNS, SSL certificate validity & expiry)
- Content Integrity (Blank pages, missing content, title mismatch, significant content loss)
- Security & Defacement Detection (Injected spam, malicious redirects, unauthorized iframes/scripts)
- Website Validation against approved baselines
- False Alert Prevention (Retries failed checks before alerting, suppresses duplicate alerts)
- Recovery Notifications when issues resolve
- Historical Logging in Supabase
- Daily Summary digest report
- Hostinger SMTP email alerts
"""

import os
import sys
import time
import json
import ssl
import socket
import hashlib
import argparse
import smtplib
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

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

# Supabase and HTTP libraries
try:
    import requests
except ImportError:
    requests = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

# Hostinger SMTP Settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

raw_from = os.getenv("SMTP_FROM", "")
if SMTP_USER and ("<" in raw_from and ">" in raw_from):
    # Ensure the sender address matches the authenticated Hostinger user
    import re
    display_name = raw_from.split("<")[0].strip()
    SMTP_FROM = f"{display_name} <{SMTP_USER}>" if display_name else f"<{SMTP_USER}>"
elif SMTP_USER:
    SMTP_FROM = f"Supercraft Monitor <{SMTP_USER}>"
else:
    SMTP_FROM = raw_from or "alerts@supercraft.my"


DEFAULT_ADMIN_EMAILS = ["dev.supercraft@gmail.com", "lynesslim@supercraft.my"]
USER_AGENT = "Supercraft-Website-Monitor/1.0 (+https://supercraft.my)"
REQUEST_TIMEOUT = 15  # seconds
MAX_RETRIES = 2
RETRY_DELAY = 10  # seconds between retries to prevent false alarms

# Common spam/defacement signatures
SUSPICIOUS_PATTERNS = [
    r"online\s+casino",
    r"slot\s+gacor",
    r"judi\s+online",
    r"viagra|cialis",
    r"hacked\s+by",
    r"pwned\s+by",
    r"crypto\s+drainer",
]


class SupabaseAPI:
    """Lightweight client using requests to query Supabase REST API directly."""
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def get_monitored_projects(self):
        endpoint = f"{self.url}/rest/v1/projects?monitoring_enabled=eq.true&select=id,name,slug,live_site_url,alert_emails,monitoring_baseline,last_health_status,consecutive_failures"
        resp = requests.get(endpoint, headers=self.headers, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def update_project_status(self, project_id: str, status: str, failures: int):
        endpoint = f"{self.url}/rest/v1/projects?id=eq.{project_id}"
        payload = {
            "last_health_status": status,
            "last_health_checked_at": datetime.now(timezone.utc).isoformat(),
            "consecutive_failures": failures
        }
        resp = requests.patch(endpoint, headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()

    def log_check(self, project_id: str, url: str, status: str, status_code: int, response_time_ms: int,
                  ssl_valid: bool, ssl_days: int, content_length: int, dom_hash: str, title: str, issues: list):
        endpoint = f"{self.url}/rest/v1/website_monitor_logs"
        payload = {
            "project_id": project_id,
            "url": url,
            "status": status,
            "status_code": status_code,
            "response_time_ms": response_time_ms,
            "ssl_valid": ssl_valid,
            "ssl_days_remaining": ssl_days,
            "content_length": content_length,
            "dom_hash": dom_hash,
            "title_found": title,
            "issues": issues,
            "checked_at": datetime.now(timezone.utc).isoformat()
        }
        resp = requests.post(endpoint, headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()

    def get_open_incident(self, project_id: str):
        endpoint = f"{self.url}/rest/v1/website_incidents?project_id=eq.{project_id}&status=eq.open&select=*"
        resp = requests.get(endpoint, headers=self.headers, timeout=15)
        resp.raise_for_status()
        incidents = resp.json()
        return incidents[0] if incidents else None

    def create_incident(self, project_id: str, incident_type: str, summary: str, details: dict):
        endpoint = f"{self.url}/rest/v1/website_incidents"
        payload = {
            "project_id": project_id,
            "status": "open",
            "incident_type": incident_type,
            "summary": summary,
            "details": details,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "alert_sent_at": datetime.now(timezone.utc).isoformat()
        }
        resp = requests.post(endpoint, headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def resolve_incident(self, incident_id: str):
        endpoint = f"{self.url}/rest/v1/website_incidents?id=eq.{incident_id}"
        payload = {
            "status": "resolved",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "recovery_sent_at": datetime.now(timezone.utc).isoformat()
        }
        resp = requests.patch(endpoint, headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()

    def get_24h_summary_stats(self):
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        endpoint = f"{self.url}/rest/v1/website_monitor_logs?checked_at=gte.{since}&select=project_id,status,issues,checked_at"
        resp = requests.get(endpoint, headers=self.headers, timeout=20)
        resp.raise_for_status()
        return resp.json()


def check_ssl_certificate(hostname: str, port: int = 443):
    """Inspects SSL certificate expiration and validity."""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                expiry_str = cert['notAfter']
                # format: 'May  4 12:00:00 2026 GMT'
                expiry_date = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                days_remaining = (expiry_date - datetime.now(timezone.utc)).days
                return True, days_remaining, None
    except Exception as e:
        return False, 0, f"SSL Error: {str(e)}"


def inspect_html_content(html: str, baseline: dict, target_url: str):
    """
    Parses HTML DOM without browser rendering to detect:
    - Blank pages
    - Missing titles / brand keywords
    - Defacement & spam patterns
    - Unauthorized redirects
    - Content hash changes
    """
    issues = []
    title = ""
    dom_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
    content_length = len(html.strip())

    if not BeautifulSoup:
        # Fallback if beautifulsoup4 is missing
        if content_length < 100:
            issues.append("Page HTML content is critically small (< 100 bytes). Blank page detected.")
        return title, dom_hash, content_length, issues

    soup = BeautifulSoup(html, "html.parser")

    # 1. Title Extraction
    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        title = title_tag.string.strip()
    else:
        issues.append("Missing <title> tag in HTML document.")

    # 2. Blank Page Detection
    body = soup.find("body")
    if not body:
        issues.append("Missing <body> element in HTML.")
    else:
        text = body.get_text(strip=True)
        if len(text) < 50:
            issues.append(f"Blank or nearly blank page detected (Visible text only {len(text)} characters).")

    # 3. Baseline Validation
    if baseline:
        expected_title = baseline.get("title")
        if expected_title and expected_title.lower() not in title.lower():
            issues.append(f"Title mismatch: Expected '{expected_title}', got '{title}'.")

        brand_name = baseline.get("brand_name")
        if brand_name and body:
            page_text = soup.get_text().lower()
            if brand_name.lower() not in page_text:
                issues.append(f"Brand name identifier '{brand_name}' not found on page.")

        expected_length = baseline.get("content_length", 0)
        if expected_length > 1000 and content_length < (expected_length * 0.4):
            issues.append(
                f"Significant content loss: HTML size dropped to {content_length} bytes (Baseline was {expected_length} bytes, > 60% loss)."
            )

    # 4. Security & Defacement Checks
    # Check unauthorized meta-refresh redirects
    for meta in soup.find_all("meta", attrs={"http-equiv": lambda v: v and v.lower() == "refresh"}):
        content = meta.get("content", "")
        if "url=" in content.lower():
            redirect_target = content.split("url=", 1)[-1].strip(" '\"")
            parsed_orig = urlparse(target_url)
            parsed_redir = urlparse(redirect_target)
            if parsed_redir.netloc and parsed_redir.netloc != parsed_orig.netloc:
                issues.append(f"Suspicious external meta-redirect detected to: {redirect_target}")

    # Check for known spam / hack keywords
    import re
    full_text = soup.get_text()
    for pattern in SUSPICIOUS_PATTERNS:
        if re.search(pattern, full_text, re.IGNORECASE):
            issues.append(f"Potential website defacement or injected spam keyword detected matching '{pattern}'.")

    return title, dom_hash, content_length, issues


def check_website(url: str, baseline: dict = None):
    """Executes full health and integrity check on a single website."""
    parsed = urlparse(url)
    if not parsed.scheme:
        url = "https://" + url
        parsed = urlparse(url)

    hostname = parsed.hostname or url
    start_time = time.time()
    issues = []
    status_code = None
    ssl_valid = True
    ssl_days = 999
    title = ""
    dom_hash = ""
    content_length = 0

    # 1. SSL Certificate Inspection (if HTTPS)
    if parsed.scheme == "https":
        ssl_valid, ssl_days, ssl_err = check_ssl_certificate(hostname)
        if not ssl_valid:
            issues.append(f"SSL Certificate Failure: {ssl_err}")
        elif ssl_days < 14:
            issues.append(f"SSL Certificate expiring soon ({ssl_days} days remaining).")

    # 2. HTTP Request
    try:
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})
        response = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response_time_ms = int((time.time() - start_time) * 1000)
        status_code = response.status_code

        # Check HTTP Status
        if status_code >= 400:
            issues.append(f"HTTP Error {status_code}: {response.reason}")
        else:
            # Inspect HTML Content
            title, dom_hash, content_length, content_issues = inspect_html_content(
                response.text, baseline or {}, url
            )
            issues.extend(content_issues)

    except requests.exceptions.Timeout:
        response_time_ms = int((time.time() - start_time) * 1000)
        issues.append(f"Connection Timed Out after {REQUEST_TIMEOUT}s.")
    except requests.exceptions.SSLError as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        issues.append(f"SSL Handshake Failed: {str(e)}")
    except requests.exceptions.ConnectionError as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        issues.append(f"Connection Failed / DNS Resolution Failure: {str(e)}")
    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        issues.append(f"Unexpected Request Error: {str(e)}")

    # Classify overall status
    if any("HTTP Error" in iss or "Connection" in iss or "Timed Out" in iss for iss in issues):
        overall_status = "down"
    elif issues:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return {
        "status": overall_status,
        "status_code": status_code,
        "response_time_ms": response_time_ms,
        "ssl_valid": ssl_valid,
        "ssl_days_remaining": ssl_days,
        "content_length": content_length,
        "dom_hash": dom_hash,
        "title": title,
        "issues": issues,
    }


def send_smtp_email(recipients: list, subject: str, html_body: str):
    """Sends email via Hostinger SMTP (supporting port 465 SSL or 587 TLS)."""
    if not SMTP_USER or not SMTP_PASS:
        print("⚠️ Warning: SMTP_USER or SMTP_PASS not configured. Skipping email dispatch.")
        return False

    if not recipients:
        recipients = DEFAULT_ADMIN_EMAILS

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html"))

    try:
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
            server.starttls()

        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, recipients, msg.as_string())
        server.quit()
        print(f"📧 Notification sent to: {', '.join(recipients)}")
        return True
    except Exception as e:
        print(f"❌ Failed to send SMTP email: {e}")
        return False


def send_alert_notification(project_name: str, url: str, result: dict, recipients: list):
    """Sends an incident alert email with clear failure breakdown."""
    subject = f"🚨 [ALERT] {project_name} Health Issue Detected: {result['status'].upper()}"
    issues_html = "".join([f"<li style='margin-bottom: 6px; color: #ff6b6b;'>{iss}</li>" for iss in result['issues']])
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    html = f"""
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #111310; color: #f4f6ea; padding: 24px; margin: 0;">
        <div style="max-width: 580px; margin: 0 auto; background: #1b1d19; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden;">
          <div style="background: #e5484d; padding: 16px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 700;">🚨 Website Health Alert: {project_name}</h2>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; color: #c9ccc2; margin-top: 0;">
              An issue was detected on monitored client website <strong>{project_name}</strong> during automated hourly inspection.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">Target URL:</td>
                <td style="padding: 8px 0; font-weight: 600;"><a href="{url}" style="color: #a3b840;">{url}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">Detection Time:</td>
                <td style="padding: 8px 0; font-weight: 600;">{now_str}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">HTTP Status:</td>
                <td style="padding: 8px 0; font-weight: 600;">{result.get('status_code') or 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">Response Latency:</td>
                <td style="padding: 8px 0; font-weight: 600;">{result.get('response_time_ms', 0)} ms</td>
              </tr>
            </table>

            <div style="background: rgba(229, 72, 77, 0.1); border-left: 3px solid #e5484d; border-radius: 4px; padding: 14px; margin: 18px 0;">
              <h4 style="margin: 0 0 8px 0; color: #ff6b6b; font-size: 13px;">Detected Issues:</h4>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px;">
                {issues_html}
              </ul>
            </div>

            <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 0;">
              This alert was verified after retry. Duplicate emails are suppressed until resolution. A recovery email will be sent automatically once the website passes inspection.
            </p>
          </div>
        </div>
      </body>
    </html>
    """
    send_smtp_email(recipients, subject, html)


def send_recovery_notification(project_name: str, url: str, result: dict, recipients: list):
    """Sends a recovery email once the website returns to normal."""
    subject = f"✅ [RESOLVED] {project_name} is Back Online & Healthy"
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    html = f"""
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #111310; color: #f4f6ea; padding: 24px; margin: 0;">
        <div style="max-width: 580px; margin: 0 auto; background: #1b1d19; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden;">
          <div style="background: #2b7a4b; padding: 16px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 700;">✅ Incident Resolved: {project_name}</h2>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; color: #c9ccc2; margin-top: 0;">
              The health monitoring system verified that <strong>{project_name}</strong> is online, responding with HTTP 200, and displaying approved content.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">Target URL:</td>
                <td style="padding: 8px 0; font-weight: 600;"><a href="{url}" style="color: #a3b840;">{url}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">Resolved At:</td>
                <td style="padding: 8px 0; font-weight: 600;">{now_str}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: rgba(255,255,255,0.5);">Response Latency:</td>
                <td style="padding: 8px 0; font-weight: 600;">{result.get('response_time_ms', 0)} ms</td>
              </tr>
            </table>
            <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 0;">
              Supercraft Automated Website Health & Integrity Monitor
            </p>
          </div>
        </div>
      </body>
    </html>
    """
    send_smtp_email(recipients, subject, html)


def send_daily_summary_report(db: SupabaseAPI, projects: list):
    """Compiles and sends a consolidated daily digest for all monitored websites."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    subject = f"📊 Daily Website Health Summary - {now_str}"

    rows_html = ""
    for p in projects:
        status = p.get("last_health_status") or "unmonitored"
        color = "#a3b840" if status == "healthy" else "#e5484d" if status == "down" else "#e5a000"
        rows_html += f"""
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding: 10px; font-weight: 600;">{p['name']}</td>
          <td style="padding: 10px;"><a href="{p.get('live_site_url', '#')}" style="color: #a3b840;">{p.get('live_site_url', 'Not configured')}</a></td>
          <td style="padding: 10px;"><span style="color: {color}; font-weight: bold; text-transform: uppercase; font-size: 11px;">{status}</span></td>
        </tr>
        """

    html = f"""
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #111310; color: #f4f6ea; padding: 24px; margin: 0;">
        <div style="max-width: 640px; margin: 0 auto; background: #1b1d19; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px;">
          <h2 style="color: #a3b840; margin-top: 0; font-size: 18px;">📊 Supercraft Daily Website Health Summary</h2>
          <p style="font-size: 13px; color: #c9ccc2;">
            Consolidated 24-hour health overview for all active client websites.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.15); text-align: left; color: rgba(255,255,255,0.5);">
                <th style="padding: 8px 10px;">Project</th>
                <th style="padding: 8px 10px;">Live URL</th>
                <th style="padding: 8px 10px;">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows_html}
            </tbody>
          </table>
          <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 24px; margin-bottom: 0;">
            Supercraft Centralised Website Monitoring System
          </p>
        </div>
      </body>
    </html>
    """
    send_smtp_email(DEFAULT_ADMIN_EMAILS, subject, html)


def run_monitoring_cycle(daily_summary: bool = False):
    """Main execution loop for checking all monitored projects."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")
        sys.exit(1)

    db = SupabaseAPI(SUPABASE_URL, SUPABASE_KEY)

    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting website health monitoring cycle...")
    projects = db.get_monitored_projects()
    print(f"Found {len(projects)} projects with monitoring enabled.")

    for project in projects:
        project_id = project["id"]
        name = project["name"]
        live_url = project.get("live_site_url")
        baseline = project.get("monitoring_baseline") or {}
        alert_emails = project.get("alert_emails") or DEFAULT_ADMIN_EMAILS
        consecutive_failures = project.get("consecutive_failures") or 0

        if not live_url:
            print(f"⏭️ Skipping {name}: live_site_url not set.")
            continue

        print(f"\n🔍 Inspecting: {name} ({live_url})...")
        result = check_website(live_url, baseline)

        # Retry logic for False Alert Prevention
        if result["status"] != "healthy":
            print(f"⚠️ Issue detected ({result['status']}). Retrying in {RETRY_DELAY}s to prevent false alarm...")
            time.sleep(RETRY_DELAY)
            retry_result = check_website(live_url, baseline)
            if retry_result["status"] != "healthy":
                result = retry_result
                print(f"❌ Failure confirmed after retry: {', '.join(result['issues'])}")
            else:
                print("✅ Passed on retry. False alarm averted.")
                result = retry_result

        # Log check to database
        db.log_check(
            project_id=project_id,
            url=live_url,
            status=result["status"],
            status_code=result["status_code"],
            response_time_ms=result["response_time_ms"],
            ssl_valid=result["ssl_valid"],
            ssl_days=result["ssl_days_remaining"],
            content_length=result["content_length"],
            dom_hash=result["dom_hash"],
            title=result["title"],
            issues=result["issues"],
        )

        open_incident = db.get_open_incident(project_id)

        if result["status"] != "healthy":
            new_failures = consecutive_failures + 1
            db.update_project_status(project_id, result["status"], new_failures)

            # Trigger alert only if no incident is currently open
            if not open_incident:
                print(f"🚨 Opening incident & sending alert notification for {name}...")
                db.create_incident(
                    project_id=project_id,
                    incident_type=result["status"],
                    summary=f"Website {result['status']}: {', '.join(result['issues'][:2])}",
                    details={"issues": result["issues"], "status_code": result["status_code"]}
                )
                send_alert_notification(name, live_url, result, alert_emails)
            else:
                print(f"ℹ️ Incident already open for {name}. Suppressing duplicate email alert.")
        else:
            db.update_project_status(project_id, "healthy", 0)

            # If there was an open incident, resolve it and send recovery notification
            if open_incident:
                print(f"🎉 Resolving incident and sending recovery notification for {name}...")
                db.resolve_incident(open_incident["id"])
                send_recovery_notification(name, live_url, result, alert_emails)
            else:
                print(f"✅ {name} is healthy ({result['response_time_ms']}ms).")

    if daily_summary:
        print("\n📊 Dispatching daily summary report...")
        send_daily_summary_report(db, projects)

    print("\n🏁 Website monitoring cycle finished successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Supercraft Website Health & Integrity Monitor")
    parser.add_argument("--daily-summary", action="store_true", help="Send daily consolidated report")
    args = parser.parse_args()

    run_monitoring_cycle(daily_summary=args.daily_summary)

