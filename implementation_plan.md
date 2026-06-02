# Implementation Plan: AI Image Edits & Custom Reference Uploads

This plan outlines the design and implementation for two new features:
1. **AI Edit inside the Shared Lightbox**: Allowing users to provide feedback on mockups and trigger image edits using `gpt-image-2`.
2. **Custom Reference Uploads**: Enabling users to upload and use their own reference layouts as styling guides in the Hero Generator.

---

## Proposed Changes

### 1. AI Mockup Editing (Feature 1)

#### [NEW] [edit/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/hero-generator/edit/route.ts)
* Create a POST handler to receive `imageUrl`, `projectId` (optional), and `instruction`.
* Fetch the source image and convert it to a binary Blob.
* Dispatch an edit request to `openaiBaseUrl/images/edits` using `model: "gpt-image-2"` and the custom feedback instruction.
* Return the newly edited image URL.

#### [MODIFY] [Lightbox.tsx](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/components/Lightbox.tsx)
* Add optional props:
  * `onAiEdit?: (instruction: string) => Promise<string>`: Handles the submission of an edit instruction, returning the new image URL.
  * `isEditingImage?: boolean`: Spinner/loading state during editing.
* Render an **AI Edit** action button below the image.
* When clicked, toggle an inline text area comment field with **Submit Edit** and **Cancel** buttons.

#### [MODIFY] [HeroGeneratorClient.tsx](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/hero-generator/HeroGeneratorClient.tsx)
* Add UI state `isEditingMockup` to track loading status.
* Provide `onAiEdit` handler to `<Lightbox>`:
  * Make a POST fetch to `/api/hero-generator/edit` passing the current option's image URL and the comment.
  * Append the resulting new mockup option directly into the `mockupOptions` state list.
  * Keep the lightbox view open or focus the new mockup.

#### [MODIFY] [ProjectDetailClient.tsx](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/projects/%5Bid%5D/ProjectDetailClient.tsx)
* Provide `onAiEdit` handler to `<Lightbox>`:
  * Make a POST fetch to `/api/hero-generator/edit` passing the saved mockup URL and the comment.
  * Automatically save the newly generated edited image to the database by invoking `/api/hero-generator/mockups` with the new image URL, original project ID, theme, accent color, and updated prompt instructions.
  * Reload `savedMockups` or append the returned mockup record to state.

---

### 2. Custom Reference Uploads (Feature 2)

#### [NEW] [upload/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/hero-generator/upload/route.ts)
* Create a POST handler to accept a single image upload.
* Upload the file to a `custom-references` folder in Supabase Storage.
* Return the public permanent URL.

#### [MODIFY] [generate/route.ts](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/api/hero-generator/generate/route.ts)
* Update `GenerateRequest` type to accept `customReferenceUrls?: string[]`.
* Merge custom references into the parallel layout variation queues during standard generation.

#### [MODIFY] [HeroGeneratorClient.tsx](file:///Users/lynesslim/Library/CloudStorage/GoogleDrive-lynesslim@gmail.com/.shortcut-targets-by-id/1tdRwUUrLZ8ISnTgPBALicsop9_kB_lNQ/Supercraft%20Drive/03_RESOURCES/Custom%20Tool/Supercraft%20Superapp/src/app/hero-generator/HeroGeneratorClient.tsx)
* Add `customReferences` array state and `selectedCustomRefs` state.
* Render a **Custom Reference Upload** panel before the Visual Inspiration Gallery.
* Support drag-and-drop or file pickers, automatically uploading files to `/api/hero-generator/upload` to store custom reference items.
* Display custom references as checkable cards alongside the database gallery.
* Include selected custom reference URLs in the payload dispatched to `/api/hero-generator/generate`.

---

## Verification Plan

### Automated Tests
* Confirm compile sanity:
  ```bash
  npm run build
  ```

### Manual Verification
1. Open the Hero Generator, upload two custom design files in the new upload panel, and select them.
2. Select three gallery references and hit **Generate 5 Mockups**.
3. Verify that the generator incorporates the custom images as prompt visual templates.
4. Click preview on one of the mockups, choose **AI Edit**, type a feedback prompt (e.g. "make the accent colors brighter and add a secondary button"), and submit.
5. Confirm that the edited mockup is successfully generated and appended to the layouts grid.
