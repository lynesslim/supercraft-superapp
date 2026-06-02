-- Migration to support Hero Section Mockup Generator

-- 1. Create hero_references table for curated visual references
CREATE TABLE IF NOT EXISTS hero_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}'::TEXT[],
  theme TEXT NOT NULL DEFAULT 'both' CHECK (theme IN ('light', 'dark', 'both')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create project_hero_mockups table for saved generations
CREATE TABLE IF NOT EXISTS project_hero_mockups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt_used TEXT NOT NULL,
  accent_color TEXT,
  theme TEXT NOT NULL DEFAULT 'both',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS project_hero_mockups_project_id_idx ON project_hero_mockups (project_id);

-- 3. Add accent_color and logo_url columns to projects table if they don't already exist
ALTER TABLE projects ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 4. Seed system prompt for hero mockup generation
INSERT INTO system_prompts (name, prompt_text) VALUES 
('hero_mockup_prompt', 'You are a world-class UI/UX visual designer specializing in modern, high-end hero sections. Generate a premium, production-grade website hero section mockup. It should look like a highly detailed Dribbble/Behance showcase or a real screenshot of a premium landing page. Fully render realistic typographic layouts, clear text, fine navigation details, high-end icons, and interactive elements. Avoid generic stock photos; make the visuals feel customized and luxurious. Accent color: {{accent_color}}. Theme: {{theme}}. Inspired by the following aesthetic styles: {{aesthetics}}.')
ON CONFLICT (name) DO NOTHING;

-- 5. Seed some elegant placeholder hero references for instant UI function
INSERT INTO hero_references (title, image_url, tags, theme) VALUES
('Minimalist Architect Split', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', ARRAY['Minimalist', 'Architecture', 'Clean', 'Split-Screen'], 'light'),
('Luxury Dark Portfolio', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80', ARRAY['Luxury', 'Dark', 'Abstract', 'Bento'], 'dark'),
('Modern Glassmorphism Tech', 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=800&q=80', ARRAY['SaaS', 'Glassmorphism', 'Tech', 'Vibrant'], 'both'),
('Bold Typography Landing', 'https://images.unsplash.com/photo-1626544827763-d516dce335e2?auto=format&fit=crop&w=800&q=80', ARRAY['Creative', 'Bold', 'Typography', 'Minimalist'], 'both'),
('Clean Corporate Grid', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80', ARRAY['Corporate', 'Grid', 'Modern', 'Clean'], 'light'),
('Sleek Cyberpunk Studio', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80', ARRAY['Cyberpunk', 'Neon', 'Creative', 'Dark'], 'dark')
ON CONFLICT DO NOTHING;
