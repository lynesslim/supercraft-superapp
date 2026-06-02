# Implementation Plan: Project Asset Extraction & Curation

This plan outlines the architecture for generating, saving, and editing standalone design assets from hero mockups. It introduces:
1. A database schema for project assets.
2. Two new parallel AI extraction pathways (Background extraction and Stylized iconography/asset sheet generation).
3. Project detail UI workspace tabs for managing design assets.
4. Prompt Playground integration for customizing asset generation instructions.

---

## Proposed Changes

### 1. Schema & Backend APIs

#### [NEW] [20260602_project_assets.sql](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/supabase/migrations/20260602_project_assets.sql)
* Create `project_assets` table to store saved assets:
  ```sql
  CREATE TABLE IF NOT EXISTS project_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'sheet')),
    prompt_used TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS project_assets_project_id_idx ON project_assets (project_id);
  ```
* Seed `system_prompts` with keys:
  * `extract_background_prompt`: Instructions to remove text/UI layouts and isolate 2K background details.
  * `extract_iconography_prompt`: Instructions to generate matching UI iconographies on a 9:16 sheet.

#### [NEW] [/api/hero-generator/extract-assets/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/hero-generator/extract-assets/route.ts)
* Create a POST handler receiving `mockupImageUrl` and `projectId`.
* Fetch `extract_background_prompt` and `extract_iconography_prompt` from the database.
* Execute two OpenAI `images/edits` (`gpt-image-2`) tasks in parallel:
  * **Background Extraction**: Prompt to remove foreground copy/CTA blocks and render a clean, high-resolution background asset at 16:9 (`2048x1152`).
  * **Iconography Sheet**: Prompt to extract design themes and layout matching icons on a 9:16 asset board (`1152x2048`).
* Return both URLs and prompts used.

#### [NEW] [/api/projects/[id]/assets/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/projects/%5Bid%5D/assets/route.ts)
* `GET`: Fetch all design assets associated with the project UUID.
* `POST`: Save generated asset objects into the `project_assets` table.
* `DELETE`: Remove a design asset record and prompt confirmation.

---

### 2. Frontend User Workspace

#### [MODIFY] [ProjectDetailClient.tsx](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/projects/%5Bid%5D/ProjectDetailClient.tsx)
* Add an **Assets** tab alongside Details/Webcopy workspace navigation.
* In the **Saved Mockups Lightbox**:
  * Add an **Extract Assets** button.
  * Trigger parallel generation using `/api/hero-generator/extract-assets`. Show a custom, animated extraction status banner.
  * Auto-save the results using the project assets POST endpoint.
* In the **Assets Tab**:
  * Render background mockups and iconography sheets in a responsive grid layout.
  * Clicking an asset opens the shared `<Lightbox>` component, allowing users to:
    * Download high-resolution files.
    * Use **AI Edit** to customize individual assets (sends request to edit endpoint and saves back to database).

#### [MODIFY] [PlaygroundClient.tsx](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/playground/PlaygroundClient.tsx)
* Add editable system prompt templates for `extract_background_prompt` and `extract_iconography_prompt` to allow prompt tweaking and versioning directly in the Prompt Lab.

---

## Verification Plan

### Automated Tests
* Validate compilation check:
  ```bash
  npm run build
  ```

### Manual Verification
1. Run local environment and open a project details page.
2. Select any saved mockup in the gallery, click **Extract Assets**, and verify the progress bar cycles correctly.
3. Confirm that two files appear in the new **Assets Tab** (a clean 16:9 background and a 9:16 icon sheet).
4. Edit the prompts in the Prompt Playground, trigger extraction again, and verify the edits change the output styles appropriately.
