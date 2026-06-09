-- Migration to support async job tracking for hero mockup generation
-- Prevents NGINX proxy timeouts by decoupling generation from the HTTP response

CREATE TABLE IF NOT EXISTS mockup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS mockup_jobs_project_id_idx ON mockup_jobs (project_id);
