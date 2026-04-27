-- Schema for Supercraft Superapp (Sitemap & Webcopy Feature)

-- 1. System Prompts Table
-- Stores the system prompts used by the AI. You can test and edit these in the Admin Playground.
CREATE TABLE IF NOT EXISTS system_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- e.g., 'sitemap_generator', 'webcopy_generator'
  prompt_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('superadmin', 'employee')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS app_user_roles_role_idx ON app_user_roles (role);

-- Insert some default placeholder prompts
INSERT INTO system_prompts (name, prompt_text) VALUES 
('sitemap_generator', 'You are an expert UX designer and content strategist. Given project context, create a premium website sitemap. Return only the structured sitemap object required by the schema. Use stable kebab-case ids. Use null parentId for top-level pages. Pages should be practical, conversion-aware, and useful for the project strategy.'),
('webcopy_generator', 'You are an expert conversion copywriter. Generate rich-text Markdown webcopy for the supplied website page. Use specific, useful content rather than placeholders. Include conversion-focused sections, clear hierarchy, and CTA copy. Return Markdown only.'),
('project_strategy_generator', 'You are a senior website strategist. Create concise, useful project strategy notes for a website planning workflow. Return only valid structured data matching the required schema. Create: industry as a concise business category; summary as a 2-3 sentence overview; usp as the strongest positioning or differentiator; strategy_sheet as practical website strategy covering audience, positioning, tone, conversion goals, content priorities, key messaging, trust signals, and conversion opportunities. Write strategy_sheet as plain text or concise bullets, never JSON or code. If supplied URLs are present, use web_search to inspect relevant supplied URLs and web results, treating supplied URLs as client-provided context.'),
('project_detail_refiner', 'You are a senior website strategist editing project planning notes. Be specific, concise, and useful. Return only the requested field content with no preamble. For Industry and Staging Base URL, return one concise plain-text value only. For longer fields, preserve useful specifics and avoid labels unless the content itself needs headings. If no feedback is provided, regenerate the target field with a clearer, more useful version.'),
('webcopy_refinement', 'You are editing Markdown website copy. Return only the revised Markdown text requested, with no preamble. Mode meanings: regenerate means regenerate the full page copy; regenerate-selection means rewrite only the selected excerpt; paraphrase means preserve meaning with new wording; shorten means keep the core message in fewer words; expand means add useful specific detail; change-tone means apply the feedback tone; bullet-points means convert the selected excerpt into concise Markdown bullet points. For selection tasks, return only the rewritten selected excerpt and do not include surrounding page titles, labels, or context unless they are inside the selected text. If the selected excerpt does not begin with a Markdown heading, do not begin with a heading.'),
('word_export_formatter', 'You are formatting website sitemap and web copy content for a client-facing Word document. Preserve page hierarchy, use clear headings, separate sections cleanly, and keep formatting professional and readable.')
ON CONFLICT (name) DO NOTHING;

-- 2. Projects Table
-- Every sitemap belongs to a project. Keep this table intentionally small until
-- the broader project dashboard/user model is added.
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Untitled project',
  staging_base_url TEXT NOT NULL DEFAULT 'https://staging.example.com',
  embed_public_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  feedback_passcode TEXT NOT NULL DEFAULT LPAD((FLOOR(random() * 9000 + 1000))::int::text, 4, '0'),
  brief TEXT,
  additional_details TEXT,
  industry TEXT,
  summary TEXT,
  usp TEXT,
  strategy_sheet TEXT,
  start_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE DEFAULT ((CURRENT_DATE + INTERVAL '1 year')::date),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS additional_details TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS usp TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS strategy_sheet TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS expiry_date DATE DEFAULT ((CURRENT_DATE + INTERVAL '1 year')::date);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

UPDATE projects
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

UPDATE projects
SET expiry_date = COALESCE(expiry_date, (start_date + INTERVAL '1 year')::date)
WHERE expiry_date IS NULL;

DO $$
BEGIN
  ALTER TABLE projects
  ADD CONSTRAINT projects_expiry_after_start_date_check
  CHECK (expiry_date IS NULL OR start_date IS NULL OR expiry_date >= start_date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Sitemaps Table
CREATE TABLE IF NOT EXISTS sitemaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief TEXT,
  nodes JSONB DEFAULT '[]'::jsonb, -- Stores the React Flow node data
  edges JSONB DEFAULT '[]'::jsonb, -- Stores the React Flow edge data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Backfill project rows for older sitemaps that were created before the
-- strict project relationship was enforced.
INSERT INTO projects (
  id,
  slug,
  name,
  staging_base_url,
  embed_public_key,
  feedback_passcode,
  created_at
)
SELECT
  project_id,
  CONCAT('imported-sitemap-project-', LEFT(project_id::text, 8)),
  'Imported sitemap project',
  'https://staging.example.com',
  gen_random_uuid()::text,
  LPAD((FLOOR(random() * 9000 + 1000))::int::text, 4, '0'),
  MIN(created_at)
FROM sitemaps
WHERE project_id IS NOT NULL
GROUP BY project_id
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  ALTER TABLE sitemaps
  ADD CONSTRAINT sitemaps_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Webcopy Table
-- Stores the generated copy for each page in the sitemap.
CREATE TABLE IF NOT EXISTS page_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sitemap_id UUID NOT NULL REFERENCES sitemaps(id) ON DELETE CASCADE,
  page_name TEXT NOT NULL,
  url_path TEXT NOT NULL,
  content TEXT, -- Rich text copy
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Project Documents Table
-- Stores private project intake PDF briefs and delayed AI analysis status.
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size BIGINT NOT NULL DEFAULT 0,
  analysis_status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (analysis_status IN ('uploaded', 'processing', 'ready', 'failed')),
  analysis_summary TEXT,
  analysis_error TEXT,
  openai_file_id TEXT,
  openai_vector_store_id TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_created_at_idx
  ON project_documents (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_documents_analysis_status_idx
  ON project_documents (analysis_status);

-- Create a private Supabase Storage bucket named project-briefs. The app also
-- attempts to create this bucket automatically with the service-role key and
-- serves temporary signed URLs to authenticated app users.
