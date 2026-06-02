# Task List: AI Image Edits & Custom Reference Uploads

## Feature 1: AI Mockup Editing
- [ ] Create Backend AI Edit Endpoint (`api/hero-generator/edit/route.ts`):
  - [ ] Implement POST handler receiving `imageUrl`, `projectId`, and `instruction`
  - [ ] Fetch the source image as binary blob, configure multipart FormData, and post to `v1/images/edits`
  - [ ] Return the generated URL or fallback errors
- [ ] Update Shared Lightbox Component (`components/Lightbox.tsx`):
  - [ ] Add `onAiEdit` and loading state handlers as component props
  - [ ] Render an "AI Edit" action button next to the close controls
  - [ ] Show comments textarea panel when clicked with submission triggers
- [ ] Connect Hero Generator Client (`hero-generator/HeroGeneratorClient.tsx`):
  - [ ] Handle `onAiEdit` and dispatch request to `/api/hero-generator/edit`
  - [ ] Append the returned edited option to the options grid
- [ ] Connect Project Details Client (`projects/[id]/ProjectDetailClient.tsx`):
  - [ ] Handle `onAiEdit` and dispatch request to `/api/hero-generator/edit`
  - [ ] Automatically invoke the save endpoint to add the edited image as a new project mockup option
  - [ ] Update state lists or reload saved mockups

## Feature 2: Custom Reference Uploads
- [ ] Create Upload Endpoint (`api/hero-generator/upload/route.ts`):
  - [ ] Accept uploaded layout files and write to Supabase Storage bucket `visual-references` under user/custom reference paths
  - [ ] Return public reference URL
- [ ] Update Generator Endpoint (`api/hero-generator/generate/route.ts`):
  - [ ] Support optional `customReferenceUrls` array payload
  - [ ] Merge custom reference objects into the variation promises queue
- [ ] Update Hero Generator Workspace UI (`hero-generator/HeroGeneratorClient.tsx`):
  - [ ] Create state arrays tracking custom references and selected reference sets
  - [ ] Build drag-and-drop file upload component before gallery section
  - [ ] Display uploaded references as checkable cards
  - [ ] Pass chosen custom URLs to the generate API payload
