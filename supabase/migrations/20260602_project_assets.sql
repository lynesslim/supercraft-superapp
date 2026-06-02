-- Migration to support Project Asset Extraction & Curation

-- 1. Create project_assets table
CREATE TABLE IF NOT EXISTS project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'sheet')),
  prompt_used TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS project_assets_project_id_idx ON project_assets (project_id);

-- 2. Seed system prompts for extraction
INSERT INTO system_prompts (name, prompt_text) VALUES
('extract_background_prompt', 'You are a senior visual designer. Given the attached hero mockup image, remove all foreground UI elements, text overlays, CTAs, navigation bars, and copy blocks. Extract only the clean, high-resolution background visual. Render it as a polished 2K-quality background asset suitable for a premium website. Do not include any text, buttons, or interface elements. Return only the refined background image at 16:9.'),
('extract_iconography_prompt', 'You are a senior UI icon designer. Study the attached hero mockup image and extract its core design themes — color palette, visual style, motifs, and layout language. Generate a matching set of stylized UI iconography and decorative visual elements arranged on a 9:16 mood board asset sheet. The icons should feel cohesive, premium, and aligned with the mockup aesthetic. Return only the asset sheet with iconography.')
ON CONFLICT (name) DO NOTHING;
