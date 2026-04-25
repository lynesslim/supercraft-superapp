# AI-powered Sitemap & Webcopy Builder

This document outlines the architecture and implementation plan for the AI-powered Sitemap and Webcopy builder. The tool will take a client's brief, generate an editable sitemap, and subsequently produce webcopy for each page based on strict, customizable system prompts.

## User Review Required

> [!IMPORTANT]
> Please review the technology stack and the proposed features below. Once approved, you can hand this plan (or the upcoming tasks) to the OpenCode extension for execution.

## Proposed Architecture

- **Framework**: Next.js (App Router) for an intuitive and smooth experience.
- **Styling**: Tailwind CSS (for rapid, responsive, and premium UI design)
- **State Management**: React Context / Hooks
- **Backend API**: Next.js Route Handlers (`/api/*`)
- **Database/Backend**: Supabase (PostgreSQL, Auth, and Storage)
- **AI Integration**: Vercel AI SDK (or similar agnostic abstraction) to allow flexibility in choosing the underlying AI provider (OpenAI, Anthropic, Gemini, etc.)

## Key Features & User Flow

### 1. Project Setup & Brief Input
- A clean, modern dashboard to start a new project.
- A brief input form supporting both text entry and PDF file upload.

### 2. Sitemap Generation & Approval
- Sends the brief + the "Sitemap System Prompt" to the AI.
- AI returns a structured JSON representing the sitemap structure.
- The UI renders this sitemap visually as an interactive node graph (e.g., using React Flow).
- The user can add, remove, or rename pages before giving final approval.

### 3. Webcopy Generation
- Iterates through the approved sitemap.
- Sends the context (Brief + Specific Page Info) + the "Webcopy System Prompt" to the AI.
- Displays the generated copy in a split-pane editor (Sitemap on the left, rich-text copy on the right).

### 4. Admin Panel / System Prompt Playground
- A dedicated route (`/admin` or `/playground`).
- Interface to edit the strict rules (System Prompts) for both Sitemap and Webcopy generation.
- A "Test" area to input a mock brief and see the AI's output using the drafted prompt, without affecting real client projects.

## Implementation Phases (For OpenCode)

### Phase 1: Project Initialization & UI Shell
- Initialize the Next.js project.
- Setup global CSS, custom fonts, and aesthetic design tokens.
- Build the main application shell (Sidebar/Navbar).

### Phase 2: The Playground & Prompts Data Layer
- Implement the storage mechanism for System Prompts.
- Build the Admin Playground interface to edit and test prompts.
- Create the generic API route `/api/generate` that wraps the AI calls.

### Phase 3: The Brief & Sitemap Builder
- Build the brief input form.
- Implement the AI call for sitemap generation.
- Build the interactive, editable sitemap UI.

### Phase 4: The Webcopy Generator
- Implement the looping logic to generate copy per page.
- Build the Webcopy viewer/editor UI.

---

## Verification Plan

### Automated Tests
- N/A for initial prototype unless specifically requested.

### Manual Verification
- Navigate to the playground and confirm prompts can be saved and tested.
- Enter a dummy brief and verify that a sitemap is successfully created and rendered.
- Approve the sitemap and verify that copy is generated for each node.
