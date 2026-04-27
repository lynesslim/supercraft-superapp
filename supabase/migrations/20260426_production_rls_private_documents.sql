-- Production hardening: app-role RLS and private project brief storage.

CREATE OR REPLACE FUNCTION public.is_app_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_user_roles roles
    WHERE roles.user_id = auth.uid()
      AND roles.role IN ('superadmin', 'employee')
  )
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('superadmin', 'employee')
  OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('superadmin', 'employee');
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_user_roles roles
    WHERE roles.user_id = auth.uid()
      AND roles.role = 'superadmin'
  )
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'superadmin'
  OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'superadmin';
$$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_documents
  ALTER COLUMN public_url DROP NOT NULL;

DO $$
BEGIN
  CREATE POLICY "app users can read projects"
  ON public.projects FOR SELECT
  USING (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can insert projects"
  ON public.projects FOR INSERT
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can update projects"
  ON public.projects FOR UPDATE
  USING (public.is_app_user())
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "superadmins can delete projects"
  ON public.projects FOR DELETE
  USING (public.is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can manage sitemaps"
  ON public.sitemaps FOR ALL
  USING (public.is_app_user())
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can manage page copies"
  ON public.page_copies FOR ALL
  USING (public.is_app_user())
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can manage project documents"
  ON public.project_documents FOR ALL
  USING (public.is_app_user())
  WITH CHECK (public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "users can read their app role"
  ON public.app_user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "superadmins can manage app roles"
  ON public.app_user_roles FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "superadmins can manage system prompts"
  ON public.system_prompts FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-briefs', 'project-briefs', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

DO $$
BEGIN
  CREATE POLICY "app users can read project brief files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-briefs' AND public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can upload project brief files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-briefs' AND public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can update project brief files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-briefs' AND public.is_app_user())
  WITH CHECK (bucket_id = 'project-briefs' AND public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "app users can delete project brief files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'project-briefs' AND public.is_app_user());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
