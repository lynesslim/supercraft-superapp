import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { requireEnv } from "@/utils/env";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createClient } from "@/utils/supabase/server";
import { validateJsonPayloadSize, validateTextLength } from "@/utils/validation";
import type { SitemapNodeData } from "@/types/sitemap";

export const runtime = "nodejs";

type SitemapEdge = {
  id?: string;
  source: string;
  target: string;
};

type SitemapNode = {
  id: string;
  data: SitemapNodeData;
};

type ProjectRow = {
  additional_details: string | null;
  brief: string | null;
  id: string;
  industry: string | null;
  name: string | null;
  strategy_sheet: string | null;
  style_guide: string | null;
  summary: string | null;
  usp: string | null;
};

type RefineMode =
  | "regenerate"
  | "regenerate-selection"
  | "paraphrase"
  | "shorten"
  | "expand"
  | "change-tone"
  | "bullet-points";
type CopyRequestMode = RefineMode | "regenerate-style-guide";

type CopyActionRequest = {
  action?: "generate" | "save" | "refine" | "generate-style-guide" | "refine-style-guide";
  page?: {
    title?: string;
    path?: string;
  };
  pageId?: string;
  content?: string;
  currentContent?: string;
  feedback?: string;
  mode?: CopyRequestMode;
  selectedText?: string;
  styleGuide?: string;
  selectedDocumentIds?: string[];
};

const PDF_DERIVED_CONTEXT_INSTRUCTIONS = `PDF-derived context instructions:
- Some project context may include extracted PDF text, such as text labeled "PDF brief extract". This is extracted text, not a file attachment.
- Use extracted PDF text to fully understand the business, background, audience, values, tone, proof points, and positioning.
- Treat extracted PDF text as business-understanding guidance, not guaranteed current truth.
- Treat origin story, founder/background, company history, legacy, timelines, and historical milestones from extracted PDF text as authoritative unless newer project details contradict them.
- For current services, offers, pricing, locations, packages, processes, team size, claims, or operational details, prefer current project fields, sitemap context, and page context over extracted PDF text.
- If details conflict or feel outdated, write flexible copy that avoids unsupported specifics.`;

function isSitemapNode(value: unknown): value is SitemapNode {
  if (!value || typeof value !== "object") {
    return false;
  }

  const node = value as { id?: unknown; data?: Partial<SitemapNodeData> };

  return (
    typeof node.id === "string" &&
    typeof node.data?.title === "string" &&
    typeof node.data?.path === "string"
  );
}

function isSitemapEdge(value: unknown): value is SitemapEdge {
  if (!value || typeof value !== "object") return false;

  const edge = value as { source?: unknown; target?: unknown };
  return typeof edge.source === "string" && typeof edge.target === "string";
}

async function saveCopy({
  content,
  page,
  sitemapId,
  supabase,
}: {
  content: string;
  page: Pick<SitemapNodeData, "title" | "path">;
  sitemapId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const timestamp = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("page_copies")
    .select("id")
    .eq("sitemap_id", sitemapId)
    .eq("url_path", page.path)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const payload = {
    sitemap_id: sitemapId,
    page_name: page.title,
    url_path: page.path,
    content,
    updated_at: timestamp,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("page_copies")
      .update(payload)
      .eq("id", existing.id)
      .select("id,page_name,url_path,content,updated_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("page_copies")
    .insert(payload)
    .select("id,page_name,url_path,content,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function projectDetailsToContext(project: ProjectRow | null, fallbackBrief: string) {
  if (!project) return fallbackBrief;

  const projectBrief = project.brief?.trim() ?? "";
  const sitemapBrief = fallbackBrief.trim();

  return [
    project.name && `Project name: ${project.name}`,
    project.summary && `Summary:\n${project.summary}`,
    project.industry && `Industry:\n${project.industry}`,
    project.usp && `USP:\n${project.usp}`,
    project.strategy_sheet && `Strategy sheet:\n${project.strategy_sheet}`,
    projectBrief && `Brief:\n${projectBrief}`,
    project.additional_details && `Additional details:\n${project.additional_details}`,
    sitemapBrief &&
      sitemapBrief !== projectBrief &&
      `Sitemap brief and extracted PDF text:\n${sitemapBrief}`,
  ]
    .filter(Boolean)
    .join("\n\n") || fallbackBrief;
}

function buildChildrenMap(nodes: SitemapNode[], edges: SitemapEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  for (const node of nodes) children.set(node.id, []);

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    children.get(edge.source)?.push(edge.target);
  }

  return children;
}

function buildSitemapContext(nodes: SitemapNode[], edges: SitemapEdge[]) {
  if (nodes.length === 0) return "No sitemap pages available.";

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = buildChildrenMap(nodes, edges);
  const targetIds = new Set(edges.map((edge) => edge.target));
  const roots = nodes.filter((node) => !targetIds.has(node.id));
  const orderedRoots = roots.length > 0 ? roots : [nodes[0]];
  const visited = new Set<string>();
  const lines: string[] = [];

  function visit(node: SitemapNode, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const indent = "  ".repeat(depth);
    const sections = (node.data.sections ?? []).join(", ") || "Not specified";
    lines.push(`${indent}- ${node.data.title} (${node.data.path})`);
    if (node.data.purpose?.trim()) {
      lines.push(`${indent}  Purpose: ${node.data.purpose.trim()}`);
    }
    lines.push(`${indent}  Sections: ${sections}`);

    for (const childId of children.get(node.id) ?? []) {
      const child = nodeById.get(childId);
      if (child) visit(child, depth + 1);
    }
  }

  orderedRoots.forEach((node) => visit(node, 0));
  nodes.filter((node) => !visited.has(node.id)).forEach((node) => visit(node, 0));

  return lines.join("\n");
}

function buildStyleGuidePrompt({
  projectContext,
  sitemapContext,
}: {
  projectContext: string;
  sitemapContext: string;
}) {
  return `Project details:
${projectContext || "No project details available."}

Current sitemap:
${sitemapContext}`;
}

async function ensureProjectStyleGuide({
  project,
  projectContext,
  sitemapContext,
  supabase,
}: {
  project: ProjectRow | null;
  projectContext: string;
  sitemapContext: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (!project?.id) {
    throw new Error("Project details are required to generate a style guide.");
  }

  if (project.style_guide?.trim()) {
    return project.style_guide.trim();
  }

  const { data: prompt, error: promptError } = await supabase
    .from("system_prompts")
    .select("prompt_text")
    .eq("name", "style_guide_generator")
    .single();

  if (promptError || !prompt?.prompt_text) {
    throw new Error(promptError?.message ?? "Missing style_guide_generator system prompt.");
  }

  const result = await generateText({
    model: openai("gpt-5-mini"),
    system: prompt.prompt_text,
    prompt: buildStyleGuidePrompt({ projectContext, sitemapContext }),
temperature: 0.35,
      maxOutputTokens: 1800,
    });
    const styleGuide = result.text.trim();

  if (!styleGuide) {
    throw new Error("Style guide generation returned no content.");
  }

  const styleGuideError = validateTextLength(styleGuide, "Style guide");
  if (styleGuideError) {
    throw new Error("Generated style guide is too long.");
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ style_guide: styleGuide, updated_at: new Date().toISOString() })
    .eq("id", project.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return styleGuide;
}

async function getSelectedDocumentExtracts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentIds: string[],
) {
  if (documentIds.length === 0) return "";

  const { data: documents } = await supabase
    .from("project_documents")
    .select("file_name,analysis_summary")
    .in("id", documentIds);

  if (!documents || documents.length === 0) return "";

  const extracts = documents
    .filter((doc) => doc.analysis_summary)
    .map((doc) => `PDF brief extract from ${doc.file_name}:\n${doc.analysis_summary}`);

  return extracts.length > 0 ? `\n\nSelected reference documents:\n${extracts.join("\n\n")}` : "";
}

function buildPagePrompt({
  projectContext,
  sitemapContext,
  page,
  styleGuide,
  additionalDocumentContext,
}: {
  projectContext: string;
  sitemapContext: string;
  page: SitemapNode;
  styleGuide: string;
  additionalDocumentContext?: string;
}) {
  return `Project context:
${projectContext || "No project context was saved for this sitemap."}

${additionalDocumentContext || ""}
${PDF_DERIVED_CONTEXT_INSTRUCTIONS}

Style guide:
${styleGuide}

Full sitemap context:
${sitemapContext}

Page context:
- Title: ${page.data.title}
- Purpose: ${page.data.purpose?.trim() || "Not specified"}
- Path: ${page.data.path}
- Sections: ${(page.data.sections ?? []).join(", ") || "Not specified"}`;
}

function buildRefinePrompt({
  currentContent,
  feedback,
  mode,
  page,
  projectContext,
  sitemapContext,
  selectedText,
  styleGuide,
  additionalDocumentContext,
}: {
  currentContent: string;
  feedback?: string;
  mode: RefineMode;
  page: SitemapNode;
  projectContext: string;
  sitemapContext: string;
  selectedText?: string;
  styleGuide: string;
  additionalDocumentContext?: string;
}) {
  const pdfInstructions =
    mode === "regenerate"
      ? `\n${additionalDocumentContext || ""}\n${PDF_DERIVED_CONTEXT_INSTRUCTIONS}\n`
      : "";

  return `Project context:
${projectContext || "No project context was saved for this sitemap."}
${pdfInstructions}

Style guide:
${styleGuide}

Full sitemap context:
${sitemapContext}

Page:
- Title: ${page.data.title}
- Purpose: ${page.data.purpose?.trim() || "Not specified"}
- Path: ${page.data.path}
- Sections: ${(page.data.sections ?? []).join(", ") || "Not specified"}

Refinement mode:
${mode}

Feedback:
${feedback?.trim() || "No extra feedback provided."}

Current full page copy:
${currentContent || "No current copy exists."}

Selected excerpt:
${selectedText || "No selected excerpt."}`;
}

function removeUnrequestedLeadingHeading({
  content,
  selectedText,
}: {
  content: string;
  selectedText?: string;
}) {
  const selectionStartsWithHeading = /^#{1,6}\s+\S/.test(selectedText?.trimStart() ?? "");

  if (selectionStartsWithHeading) {
    return content;
  }

  return content.replace(/^\s*#{1,6}\s+[^\n]+(?:\n{1,2})?/, "").trimStart();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "copies:write", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  let body: CopyActionRequest;

  try {
    body = (await request.json()) as CopyActionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const payloadSizeError = validateJsonPayloadSize(body, "Copy request");
  if (payloadSizeError) return payloadSizeError;

  const supabase = await createClient();

  if (body.action === "save") {
    const title = body.page?.title?.trim();
    const path = body.page?.path?.trim();
    const content = body.content?.trim() ?? "";
    const contentError = validateTextLength(content, "Copy content");
    if (contentError) return contentError;

    if (!title || !path) {
      return NextResponse.json(
        { error: "Page title and path are required." },
        { status: 400 },
      );
    }

    try {
      const copy = await saveCopy({
        content,
        page: { title, path },
        sitemapId: id,
        supabase,
      });

      return NextResponse.json({ copy });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save copy.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.action === "generate-style-guide" || body.action === "refine-style-guide") {
    requireEnv("openai");

    const { data: sitemap, error: sitemapError } = await supabase
      .from("sitemaps")
      .select("brief,edges,nodes,project_id")
      .eq("id", id)
      .single();

    if (sitemapError || !sitemap) {
      return NextResponse.json(
        { error: sitemapError?.message ?? "Sitemap not found." },
        { status: sitemapError?.code === "PGRST116" ? 404 : 500 },
      );
    }

    const nodes = Array.isArray(sitemap.nodes)
      ? sitemap.nodes.filter(isSitemapNode)
      : [];
    const edges = Array.isArray(sitemap.edges)
      ? sitemap.edges.filter(isSitemapEdge)
      : [];
    const sitemapContext = buildSitemapContext(nodes, edges);

    const { data: project } = sitemap.project_id
      ? await supabase
          .from("projects")
          .select("id,name,summary,industry,usp,strategy_sheet,brief,additional_details,style_guide")
          .eq("id", sitemap.project_id)
          .maybeSingle()
      : { data: null };

    const projectContext = projectDetailsToContext(
      (project ?? null) as ProjectRow | null,
      sitemap.brief ?? "",
    );

    // Only generate new style guide for generate-style-guide action
    // Skip for refine - use currentContent from frontend
    let styleGuide = "";
    if (body.action === "generate-style-guide") {
      try {
        styleGuide = await ensureProjectStyleGuide({
          project: (project ?? null) as ProjectRow | null,
          projectContext,
          sitemapContext,
          supabase,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to generate project style guide.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
      return NextResponse.json({ styleGuide });
    }

    // For refine-style-guide action
    requireEnv("openai");
    const currentStyleGuide = body.currentContent ?? "";
    const feedback = body.feedback?.trim();
    const mode = body.mode;
    const selectedText = body.selectedText;

    try {
      let promptText = "";
      let promptInput = "";

      // If there's selected text and a mode (paraphrase, shorten, etc.), handle selection refinement
      if (selectedText?.trim() && mode && mode !== "regenerate-style-guide") {
        // Use style_guide_refinement for style guide content
        const { data: refinePrompt } = await supabase
          .from("system_prompts")
          .select("prompt_text")
          .eq("name", "style_guide_refinement")
          .single();

        let modeInstructions = "";
        if (mode === "paraphrase") {
          modeInstructions = "Rewrite/paraphrase the section in a different way while preserving the meaning.";
        } else if (mode === "shorten") {
          modeInstructions = "Make the section more concise and shorter while keeping key points.";
        } else if (mode === "expand") {
          modeInstructions = "Add more detail and expand the section.";
        } else if (mode === "bullet-points") {
          modeInstructions = "Convert the section to bullet point format.";
        }

        if (refinePrompt?.prompt_text) {
          promptText = refinePrompt.prompt_text;
          promptInput = `Style Guide Section to Refine:
${selectedText}

Specific instruction: ${modeInstructions}

IMPORTANT: Return ONLY the refined section text, nothing else. Just output the refined content for this section only.`;
        }
      } else {
        // Full regeneration with optional feedback
        const { data: prompt, error: promptError } = await supabase
          .from("system_prompts")
          .select("prompt_text")
          .eq("name", "style_guide_refinement")
          .single();

        if (promptError || !prompt?.prompt_text) {
          return NextResponse.json(
            { error: promptError?.message ?? "Missing style_guide_refinement system prompt." },
            { status: 500 },
          );
        }

        promptText = prompt.prompt_text;
        promptInput = `Current style guide:
${currentStyleGuide}

Feedback:
${feedback?.trim() || "Improve this style guide."}`;
      }

      const result = await generateText({
        model: openai("gpt-5-mini"),
        system: promptText,
        prompt: promptInput,
        temperature: 0.4,
        maxOutputTokens: 1800,
      });

        let refinedContent = result.text.trim();

      // For selection modes, replace only the selected portion
      if (selectedText?.trim() && mode && mode !== "regenerate-style-guide") {
        refinedContent = currentStyleGuide.replace(selectedText, refinedContent);
      }

      return NextResponse.json({ styleGuide: refinedContent });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process style guide.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  requireEnv("openai");

  const { data: sitemap, error: sitemapError } = await supabase
    .from("sitemaps")
    .select("brief,edges,nodes,project_id")
    .eq("id", id)
    .single();

  if (sitemapError || !sitemap) {
    return NextResponse.json(
      { error: sitemapError?.message ?? "Sitemap not found." },
      { status: sitemapError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const nodes = Array.isArray(sitemap.nodes)
    ? sitemap.nodes.filter(isSitemapNode)
    : [];
  const edges = Array.isArray(sitemap.edges)
    ? sitemap.edges.filter(isSitemapEdge)
    : [];
  const selectedNodes = body.pageId
    ? nodes.filter((node) => node.id === body.pageId)
    : nodes;

  if (selectedNodes.length === 0) {
    return NextResponse.json(
      { error: "No matching sitemap page nodes were found." },
      { status: 400 },
    );
  }

  const { data: project } = sitemap.project_id
    ? await supabase
        .from("projects")
        .select("id,name,summary,industry,usp,strategy_sheet,brief,additional_details,style_guide")
        .eq("id", sitemap.project_id)
        .maybeSingle()
    : { data: null };
  const projectContext = projectDetailsToContext((project ?? null) as ProjectRow | null, sitemap.brief ?? "");
  const sitemapContext = buildSitemapContext(nodes, edges);
  let styleGuide: string;

  try {
    styleGuide = await ensureProjectStyleGuide({
      project: (project ?? null) as ProjectRow | null,
      projectContext,
      sitemapContext,
      supabase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate project style guide.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: prompt, error: promptError } = await supabase
    .from("system_prompts")
    .select("prompt_text")
    .eq("name", body.action === "refine" ? "webcopy_refinement" : "webcopy_generator")
    .single();

  if (promptError || !prompt?.prompt_text) {
    return NextResponse.json(
      {
        error:
          promptError?.message ??
          `Missing ${
            body.action === "refine" ? "webcopy_refinement" : "webcopy_generator"
          } system prompt.`,
      },
      { status: 500 },
    );
  }

  try {
    if (body.action === "refine") {
      const page = selectedNodes[0];
      const mode: RefineMode =
        body.mode && body.mode !== "regenerate-style-guide" ? body.mode : "regenerate";
      const needsSelection = mode !== "regenerate";

      if (!page) {
        return NextResponse.json({ error: "Select a page before refining copy." }, { status: 400 });
      }

      if (needsSelection && !body.selectedText?.trim()) {
        return NextResponse.json(
          { error: "Selected text is required for this refinement." },
          { status: 400 },
        );
      }

      const additionalDocumentContext =
        mode === "regenerate" && body.selectedDocumentIds?.length
          ? await getSelectedDocumentExtracts(supabase, body.selectedDocumentIds)
          : "";

      const result = await generateText({
        model: openai("gpt-5-mini"),
        system: prompt.prompt_text,
        prompt: buildRefinePrompt({
          currentContent: body.currentContent ?? "",
          feedback: body.feedback,
          mode,
          page,
          projectContext,
          sitemapContext,
          selectedText: body.selectedText,
          styleGuide,
          additionalDocumentContext,
        }),
        temperature: 0.4,
        maxOutputTokens: mode === "regenerate" ? 4400 : 700,
      });

      const content =
        mode === "regenerate"
          ? result.text.trim()
          : removeUnrequestedLeadingHeading({
              content: result.text.trim(),
              selectedText: body.selectedText,
            });

      return NextResponse.json({ content });
    }

    const additionalDocumentContext = body.selectedDocumentIds?.length
      ? await getSelectedDocumentExtracts(supabase, body.selectedDocumentIds)
      : "";

    const generateAndSaveCopy = async (page: typeof selectedNodes[0]) => {
      const result = await generateText({
        model: openai("gpt-5-mini"),
        system: prompt.prompt_text,
        prompt: buildPagePrompt({
          projectContext,
          sitemapContext,
          page,
          styleGuide,
          additionalDocumentContext,
        }),
        temperature: 0.45,
        maxOutputTokens: 4400,
      });

      const copy = await saveCopy({
        content: result.text,
        page: {
          title: page.data.title,
          path: page.data.path,
        },
        sitemapId: id,
        supabase,
      });

      return { ...copy, page_id: page.id, pageTitle: page.data.title };
    };

    const copies = await Promise.all(selectedNodes.map(generateAndSaveCopy));

    return NextResponse.json({ copies });
  } catch (error) {
    logServerError("copy.generate.failed", error, { sitemapId: id });
    return NextResponse.json({ error: "Unable to generate webcopy." }, { status: 500 });
  }
}
