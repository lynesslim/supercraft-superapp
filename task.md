# Task List: Project Asset Extraction & Curation

## SQL Schema and Migrations
- [ ] Create assets migration script (`supabase/migrations/20260602_project_assets.sql`):
  - [ ] Add `project_assets` table definition with `asset_type` check constraints
  - [ ] Seed default system prompt records for `extract_background_prompt` and `extract_iconography_prompt`

## Backend API Endpoints
- [ ] Create Asset Extraction Endpoint (`api/hero-generator/extract-assets/route.ts`):
  - [ ] Receive source image URL and project ID
  - [ ] Fetch the system prompts dynamically from the database
  - [ ] Dispatch parallel OpenAI DALL-E `images/edits` requests:
    - [ ] Request 1: 16:9 2K resolution background extraction (`2048x1152`)
    - [ ] Request 2: 9:16 2K resolution iconography and layout asset sheet (`1152x2048`)
  - [ ] Return both URL coordinates to the frontend
- [ ] Create Project Assets Curation Endpoints (`api/projects/[id]/assets/route.ts`):
  - [ ] GET: Query all assets matching the project UUID
  - [ ] POST: Insert/save a new generated asset row
  - [ ] DELETE: Remove asset row and execute DB delete

## Frontend Workspace & Lightbox
- [ ] Update Prompt Laboratory (`playground/PlaygroundClient.tsx`):
  - [ ] Add editable sections for `extract_background_prompt` and `extract_iconography_prompt` template versions
- [ ] Update Saved Mockup Modal triggers (`projects/[id]/ProjectDetailClient.tsx`):
  - [ ] Add **Extract Assets** action button inside mockup previews
  - [ ] Show custom animated loading spinner during the dual-generation tasks
  - [ ] Save both extracted images automatically upon completion
- [ ] Build Project Details Assets Tab (`projects/[id]/ProjectDetailClient.tsx`):
  - [ ] Create navigation tab switcher state for "Assets" workspace
  - [ ] Build Assets gallery grid with background/sheet tags
  - [ ] Configure asset cards to trigger the shared `<Lightbox>` on click, supporting downloads and standard **AI Edit** behaviors
