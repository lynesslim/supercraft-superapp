# Migrate AI Edit and Asset Extraction to Supabase Edge Functions

Currently, both the AI Edit (`src/app/api/hero-generator/edit/route.ts`) and Asset Extraction (`src/app/api/hero-generator/extract-assets/route.ts`) features handle the heavy image proxying directly in the Next.js API routes. 

To maintain consistency and offload this to Supabase, we will create two new Edge Functions (`edit-hero` and `extract-assets`) and update the Next.js routes to act as orchestrators.

## Proposed Changes

### Supabase Edge Functions

#### [NEW] [edit-hero/index.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/supabase/functions/edit-hero/index.ts)
Create a new Deno-based edge function for `edit-hero`.
- Receives JSON payload: `imageUrl`, `instruction`.
- Constructs the prompt: `Edit the attached hero mockup image. ${instruction}. Preserve the overall layout and branding. Return the revised mockup.`
- Fetches the source `imageUrl` to get the image Blob.
- Constructs `FormData` with `model: "gpt-image-2"`, `size: "1152x2048"`, `prompt`, and the image.
- Sends the `POST` request to `${OPENAI_BASE_URL}/images/edits` using `OPENAI_API_KEY`.
- Returns the edited image URL to the caller.

#### [NEW] [extract-assets/index.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/supabase/functions/extract-assets/index.ts)
Create a new Deno-based edge function for `extract-assets`.
- Receives JSON payload: `mockupImageUrl`, `bgPrompt`, `iconPrompt`.
- Fetches the source `mockupImageUrl` **once** to get the image Blob (optimizing bandwidth).
- Dispatches two **parallel** `POST` requests to `${OPENAI_BASE_URL}/images/edits` using `FormData`:
  - Background task: `size: "2048x1152"`, `prompt: bgPrompt`
  - Iconography task: `size: "1152x2048"`, `prompt: iconPrompt`
- Awaits both results using `Promise.allSettled`.
- Returns the successfully extracted assets in a combined payload.

### API Routes

#### [MODIFY] [edit/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/hero-generator/edit/route.ts)
Update the Next.js API route to act as an orchestrator.
- Keep the existing authentication (`requireApiRole`) and rate limiting (`rateLimitByRequest`).
- Remove direct FormData construction and proxy fetch.
- Invoke the edge function: `await supabase.functions.invoke("edit-hero", { body: { imageUrl, instruction } })`.
- Return the generated URL.

#### [MODIFY] [extract-assets/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/hero-generator/extract-assets/route.ts)
Update the Next.js API route for asset extraction.
- Keep auth, rate limiting, and the DB queries to fetch system prompts (`bgPromptBase`, `iconPromptBase`).
- Remove the local `dispatchExtraction` logic and local image fetching.
- Invoke the edge function: `await supabase.functions.invoke("extract-assets", { body: { mockupImageUrl, bgPrompt: bgPromptBase, iconPrompt: iconPromptBase } })`.
- Return the combined results array exactly as the frontend expects it.

## Verification Plan

### Manual Verification
1. Serve the new Supabase edge functions locally.
2. Go to the Hero Generator in the app and test the "AI Edit" feature.
3. Use the "Extract Assets" feature to generate background and iconography sheets from a mockup.
4. Verify both routes proxy successfully through their respective edge functions.
