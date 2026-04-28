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

type CopyActionRequest = {
  action?: "generate" | "save" | "refine";
  page?: {
    title?: string;
    path?: string;
  };
  pageId?: string;
  content?: string;
  currentContent?: string;
  feedback?: string;
  mode?: RefineMode;
  selectedText?: string;
};

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

  return [
    project.name && `Project name: ${project.name}`,
    project.summary && `Summary:\n${project.summary}`,
    project.industry && `Industry:\n${project.industry}`,
    project.usp && `USP:\n${project.usp}`,
    project.strategy_sheet && `Strategy sheet:\n${project.strategy_sheet}`,
    project.brief && `Brief:\n${project.brief}`,
    project.additional_details && `Additional details:\n${project.additional_details}`,
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
    model: openai("gpt-4o-mini"),
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

function buildPagePrompt({
  projectContext,
  sitemapContext,
  page,
  styleGuide,
}: {
  projectContext: string;
  sitemapContext: string;
  page: SitemapNode;
  styleGuide: string;
}) {
  return `Project context:
${projectContext || "No project context was saved for this sitemap."}

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
}: {
  currentContent: string;
  feedback?: string;
  mode: RefineMode;
  page: SitemapNode;
  projectContext: string;
  sitemapContext: string;
  selectedText?: string;
  styleGuide: string;
}) {
  return `Project context:
${projectContext || "No project context was saved for this sitemap."}

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
      const mode = body.mode ?? "regenerate";
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

      const result = await generateText({
        model: openai("gpt-4o-mini"),
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
        }),
        temperature: 0.4,
        maxOutputTokens: mode === "regenerate" ? 2200 : 700,
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

    const copies = [];

    for (const page of selectedNodes) {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: prompt.prompt_text,
        prompt: buildPagePrompt({
          projectContext,
          sitemapContext,
          page,
          styleGuide,
        }),
        temperature: 0.45,
        maxOutputTokens: 2200,
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

      copies.push({ ...copy, page_id: page.id });
    }

    return NextResponse.json({ copies });
  } catch (error) {
    logServerError("copy.generate.failed", error, { sitemapId: id });
    return NextResponse.json({ error: "Unable to generate webcopy." }, { status: 500 });
  }
}
