-- Website Health & Integrity Monitoring Schema
-- Run this migration in Supabase SQL editor or CLI

-- 1. Add monitoring columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_site_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS alert_emails TEXT[] NOT NULL DEFAULT ARRAY['dev.supercraft@gmail.com', 'lynesslim@supercraft.my']::TEXT[];
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monitoring_baseline JSONB DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_health_status TEXT DEFAULT 'unmonitored';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_health_checked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;

-- 2. Create website_monitor_logs table for historical logs
CREATE TABLE IF NOT EXISTS website_monitor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL, -- 'healthy', 'degraded', 'down'
  status_code INTEGER,
  response_time_ms INTEGER,
  ssl_valid BOOLEAN,
  ssl_days_remaining INTEGER,
  content_length INTEGER,
  dom_hash TEXT,
  title_found TEXT,
  issues JSONB DEFAULT '[]'::jsonb,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS website_monitor_logs_project_idx ON website_monitor_logs (project_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS website_monitor_logs_checked_at_idx ON website_monitor_logs (checked_at DESC);

-- 3. Create website_incidents table for outage state machine & alert deduplication
CREATE TABLE IF NOT EXISTS website_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  incident_type TEXT NOT NULL DEFAULT 'down', -- 'down', 'degraded', 'security', 'content'
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  alert_sent_at TIMESTAMP WITH TIME ZONE,
  recovery_sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS website_incidents_project_status_idx ON website_incidents (project_id, status);

-- 4. Enable Row Level Security
ALTER TABLE website_monitor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_incidents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "app users can read website_monitor_logs"
  ON website_monitor_logs FOR SELECT
  USING (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can insert website_monitor_logs"
  ON website_monitor_logs FOR INSERT
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can read website_incidents"
  ON website_incidents FOR SELECT
  USING (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can manage website_incidents"
  ON website_incidents FOR ALL
  USING (public.is_app_user())
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

