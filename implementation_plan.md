# Asynchronous Polling for Hero Generator

The current architecture is synchronous: the client waits for the Next.js API route, which waits for the Supabase Edge Function, which waits for OpenAI. This causes timeouts with strict proxy servers like Hostinger's NGINX because the connection sits idle for over 60 seconds.

To solve this, we will move to an **Asynchronous Polling Architecture**.

## Proposed Changes

### 1. Database Schema
We will create a new table to track the state of generation jobs.

#### [NEW] `supabase/migrations/20260608_hero_mockup_jobs.sql`
- Create a `mockup_jobs` table with:
  - `id` (UUID)
  - `project_id` (UUID)
  - `status` (pending, completed, failed)
  - `result` (JSONB) - to store the generated image options
  - `error` (TEXT) - to store any failure messages
  - `created_at` (TIMESTAMP)

### 2. Next.js API Routes

#### [MODIFY] `src/app/api/hero-generator/generate/route.ts`
- **Synchronous Setup**: The route will validate the request and immediately insert a new row into `mockup_jobs` with `status = 'pending'`.
- **Background Execution**: The route will kick off the OpenAI requests in the background (as an un-awaited promise).
- **Return Early**: The route will immediately return `{ success: true, jobId: job.id }` to the client.
- **Background Completion**: When the background promise finishes, it will update the `mockup_jobs` record with either `status = 'completed'` (storing the images in `result`) or `status = 'failed'` (storing the error).

#### [NEW] `src/app/api/hero-generator/jobs/[id]/route.ts`
- Create a new GET endpoint that accepts a `jobId`.
- Fetches the row from `mockup_jobs` and returns it so the client can check the status.

### 3. Frontend Client

#### [MODIFY] `src/app/hero-generator/HeroGeneratorClient.tsx`
- Update the `handleGenerate` function to expect a `jobId` instead of an immediate array of images.
- Start a polling mechanism (`setInterval`) that pings `/api/hero-generator/jobs/[jobId]` every 5-10 seconds.
- Update the UI to show a "Generating..." state while the job status is `pending`.
- When the job returns `completed`, display the images and stop polling.
- When the job returns `failed`, display the error and stop polling.

## Context
- **Hosting Environment**: The app is currently deployed on Hostinger, which uses an NGINX proxy that drops idle connections after 60 seconds. This is why a synchronous approach times out. Since Hostinger runs a persistent Node.js process, background promises initiated in Next.js API routes will continue executing perfectly fine after the HTTP response has been sent back to the client.
