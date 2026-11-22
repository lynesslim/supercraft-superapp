# Automated Website Health & Integrity Monitor

Centralised website monitoring system that automatically checks all client websites every hour to ensure they are online, functioning correctly, and displaying legitimate, approved content.

---

## Features
- **Uptime & SSL:** Checks HTTP status codes (2xx vs 4xx/5xx), connection timeouts, DNS, response latency, and SSL certificate expiration.
- **Content Integrity:** Detects blank or broken pages, missing `<title>`, and significant content loss compared to baseline.
- **Security & Defacement Detection:** Identifies malicious redirects, spam keyword injection, and suspicious scripts.
- **False Alert Prevention:** Automatically retries failed checks before raising an alert, and suppresses duplicate notifications while an incident remains open.
- **Automatic Recovery Notifications:** Sends an email when a previously failing website recovers.
- **Daily Summary:** Consolidated digest email showing 24-hour health overview across all monitored websites.
- **Hostinger SMTP Email:** Fast, reliable, and free email delivery.

---

## Step 1: Database Setup (Supabase)
Run the migration in your Supabase SQL Editor:
- File path: `supabase/migrations/20261112_website_health_monitoring.sql`

This creates:
- Monitoring configuration columns on the `projects` table.
- `website_monitor_logs` table for historical check logs.
- `website_incidents` table for tracking active downtime and deduplicating alerts.

---

## Step 2: Hostinger SMTP Configuration
Add the following variables to your `.env.local` (for local runs) or GitHub Secrets (for automated hourly cron):

```env
# Hostinger SMTP
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=alerts@yourdomain.com
SMTP_PASS=your_hostinger_email_password
SMTP_FROM="Supercraft Monitor <alerts@yourdomain.com>"
```

### Test your SMTP settings:
```bash
python3 monitoring/test_smtp.py
```

---

## Step 3: Run Monitor Locally
Install requirements:
```bash
pip install -r monitoring/requirements.txt
```

Run hourly check:
```bash
python3 monitoring/monitor.py
```

Run with daily summary report:
```bash
python3 monitoring/monitor.py --daily-summary
```

---

## Step 4: Automated Hourly Cron via GitHub Actions
A GitHub Actions workflow is included at `.github/workflows/website_monitor.yml`.

To enable it:
1. Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Add the following repository secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SMTP_HOST` (e.g. `smtp.hostinger.com`)
   - `SMTP_PORT` (e.g. `465`)
   - `SMTP_USER` (your Hostinger email username)
   - `SMTP_PASS` (your Hostinger email password)
   - `SMTP_FROM` (e.g. `"Supercraft Monitor <alerts@yourdomain.com>"`)
3. The workflow will automatically trigger **every hour at minute 0** (`0 * * * *`).
4. You can also trigger it manually at any time under the **Actions** tab on GitHub by clicking **Run workflow**.

