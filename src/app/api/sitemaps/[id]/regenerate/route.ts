import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import type { Edge, Node } from "@xyflow/react";
import type { SitemapNodeData } from "@/types/sitemap";

export const runtime = "nodejs";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
}

function normalizePages(pages: { id: string; title: string; purpose?: string; path: string; parentId: string | null }[]) {
  const seen = new Set<string>();
  return pages.map((page, index) => {
    const baseId = slugify(page.id || page.title || `page-${index + 1}`);
    const id = seen.has(baseId) ? `${baseId}-${index + 1}` : baseId;
    seen.add(id);
    return {
      id,
      title: page.title?.trim() || `Page ${index + 1}`,
      purpose: page.purpose?.trim() || "",
      path: page.path?.startsWith("/") ? page.path : `/${slugify(page.path || page.title)}`,
      parentId: page.parentId ? slugify(page.parentId) : null,
    };
  });
}

const NODE_WIDTH = 220;
const NODE_H_GAP = 40;
const NODE_V_GAP = 180;
const ROOT_ID = "sitemap-root";

function toFlowGraph(pages: { id: string; title: string; purpose: string; path: string; parentId: string | null }[]) {
  const children = new Map<string, string[]>();
  children.set(ROOT_ID, []);

  for (const page of pages) {
    const parent = page.parentId ?? ROOT_ID;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(page.id);
    if (!children.has(page.id)) children.set(page.id, []);
  }

  const subtreeWidth = new Map<string, number>();
  const visiting = new Set<string>();

  function calcWidth(id: string): number {
    if (visiting.has(id)) return NODE_WIDTH;
    visiting.add(id);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      subtreeWidth.set(id, NODE_WIDTH);
      visiting.delete(id);
      return NODE_WIDTH;
    }
    const total = kids.reduce((sum, kid) => sum + calcWidth(kid) + NODE_H_GAP, -NODE_H_GAP);
    subtreeWidth.set(id, Math.max(total, NODE_WIDTH));
    visiting.delete(id);
    return subtreeWidth.get(id)!;
  }

  calcWidth(ROOT_ID);

  const positions = new Map<string, { x: number; y: number }>();

  function assignPositions(id: string, centerX: number, depth: number) {
    positions.set(id, { x: centerX - NODE_WIDTH / 2, y: depth * NODE_V_GAP });
    const kids = children.get(id) ?? [];
    if (kids.length === 0) return;
    const totalWidth = kids.reduce((sum, kid) => sum + (subtreeWidth.get(kid) ?? NODE_WIDTH) + NODE_H_GAP, -NODE_H_GAP);
    let cursor = centerX - totalWidth / 2;
    for (const kid of kids) {
      const w = subtreeWidth.get(kid) ?? NODE_WIDTH;
      assignPositions(kid, cursor + w / 2, depth + 1);
      cursor += w + NODE_H_GAP;
    }
  }

  assignPositions(ROOT_ID, 0, 0);

  const rootNode: Node<SitemapNodeData> = {
    id: ROOT_ID,
    type: "sitemap",
    position: positions.get(ROOT_ID)!,
    data: { title: "Sitemap", path: "/", sections: [] },
  };

  const pageNodes: Node<SitemapNodeData>[] = pages.map((page) => ({
    id: page.id,
    type: "sitemap",
    position: positions.get(page.id) ?? { x: 0, y: 0 },
    data: { title: page.title, purpose: page.purpose, path: page.path, sections: [] },
  }));

  const nodes = [rootNode, ...pageNodes];
  const nodeIds = new Set(nodes.map((n) => n.id));

  const rootEdges: Edge[] = (children.get(ROOT_ID) ?? [])
    .filter((id) => nodeIds.has(id))
    .map((id) => ({ id: `${ROOT_ID}-${id}`, source: ROOT_ID, target: id, animated: false }));

  const pageEdges: Edge[] = pages
    .filter((page) => page.parentId && nodeIds.has(page.parentId))
    .map((page) => ({
      id: `${page.parentId}-${page.id}`,
      source: page.parentId!,
      target: page.id,
      animated: false,
    }));

  return { nodes, edges: [...rootEdges, ...pageEdges] };
}

function formatCurrentSitemap(nodes: Node<SitemapNodeData>[], edges: Edge[]) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const edge of edges) children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);

  const lines: string[] = [];
  function visit(id: string, depth: number) {
    const node = nodeById.get(id);
    if (!node) return;
    const indent = depth === 0 ? "- " : "---".repeat(depth);
    lines.push(`${indent} ${node.data.title} (${node.data.path}) - ${node.data.purpose || "no purpose"}`);
    for (const childId of children.get(id) ?? []) visit(childId, id === ROOT_ID && nodes.length > 1 ? 0 : depth + 1);
  }

  visit(ROOT_ID, 0);
  return lines.join("\n");
}

function parseSitemapResponse(text: string) {
  const pages: { id: string; title: string; purpose: string; path: string; parentId: string | null }[] = [];
  const lines = text.split("\n").filter((l) => l.trim());
  const pathToId = new Map<string, string>();

  for (const line of lines) {
    const match = line.match(/^[-]+\s+(.+?)\s*\(([^)]+)\)(?:\s*-\s*(.+))?/);
    if (!match) continue;

    const title = match[1].trim();
    const path = match[2].trim();
    const purpose = match[3]?.trim() || "";
    const depth = (line.match(/^-/g) || []).length;
    const id = slugify(title);

    pathToId.set(path, id);

    let parentId: string | null = null;
    if (depth > 0 && pages.length > 0) {
      for (let i = pages.length - 1; i >= 0; i--) {
        const prevDepth = (lines[i].match(/^-/g) || []).length;
        if (prevDepth < depth) {
          parentId = pages[i].id;
          break;
        }
      }
    }

    pages.push({ id, title, purpose, path, parentId });
  }

  return pages;
}

type RegenerateRequest = {
  feedback: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await POSTHandler(request, context);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("TOP LEVEL CATCH:", errMsg);
    return NextResponse.json({ 
      error: "Internal server error",
      detail: errMsg 
    }, { status: 500 });
  }
}

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  console.log("=== REGENERATE HANDLER STARTING ===");
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "sitemaps:write", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: sitemap, error: sitemapError } = await adminSupabase
    .from("sitemaps")
    .select("id,project_id,brief,nodes,edges")
    .eq("id", id)
    .single();

  if (sitemapError || !sitemap) {
    return NextResponse.json({ error: "Sitemap not found." }, { status: 404 });
  }

  let body: RegenerateRequest;
  try {
    body = (await request.json()) as RegenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { feedback } = body;
  if (!feedback?.trim()) {
    return NextResponse.json({ error: "Feedback is required." }, { status: 400 });
  }

  console.log("Step 1: Getting current nodes and edges");
  const currentNodes = Array.isArray(sitemap.nodes) ? sitemap.nodes : [];
  const currentEdges = Array.isArray(sitemap.edges) ? sitemap.edges : [];

  const nodes = currentNodes as Node<SitemapNodeData>[];
  const edges = currentEdges as Edge[];

  if (nodes.length === 0) {
    return NextResponse.json({ error: "No existing sitemap to regenerate." }, { status: 400 });
  }

  console.log("Step 2: Formatting current sitemap");
  const currentSitemapText = formatCurrentSitemap(nodes, edges);

  console.log("Step 3: Getting project context");
  let projectContext = sitemap.brief ?? "";
  console.log("Project context:", projectContext?.substring(0, 200));
  
  if (!projectContext && sitemap.project_id) {
    const { data: project } = await adminSupabase
      .from("projects")
      .select("summary,industry,usp,strategy_sheet,brief,additional_details")
      .eq("id", sitemap.project_id)
      .maybeSingle();

    if (project) {
      projectContext = [
        project.summary && `Project summary:\n${project.summary}`,
        project.industry && `Industry:\n${project.industry}`,
        project.usp && `USP:\n${project.usp}`,
        project.strategy_sheet && `Strategy sheet:\n${project.strategy_sheet}`,
        project.brief && `Brief:\n${project.brief}`,
        project.additional_details && `Additional details:\n${project.additional_details}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (!projectContext) {
    return NextResponse.json(
      { error: "No project context found. Add brief or project details first." },
      { status: 400 },
    );
  }

  const { data: prompt, error: promptError } = await supabase
    .from("system_prompts")
    .select("prompt_text")
    .eq("name", "sitemap_generator")
    .single();

  if (promptError || !prompt?.prompt_text) {
    return NextResponse.json(
      { error: promptError?.message ?? "Missing sitemap_generator system prompt." },
      { status: 500 },
    );
  }

  try {
const userPrompt = `Project context:
${projectContext}

Current sitemap (${nodes.length - 1} pages):
${currentSitemapText}

User feedback:
${feedback}

CRITICAL REQUIREMENTS:
1. Response MUST be in exact JSON format below - no other text
2. Keep ALL pages unless user explicitly asks to remove/merge
3. Do NOT delete pages unless explicitly requested in feedback

Output EXACTLY this JSON format:
[{"title": "Page Name", "path": "/path", "purpose": "Purpose", "parentId": "parent-page-id-or-null"}]

Example:
[{"title": "Home", "path": "/", "purpose": "Main landing", "parentId": null}, {"title": "Pricing", "path": "/pricing", "purpose": "Pricing info", "parentId": "home"}]

Keep existing parentId references. For root level pages, use parentId: null`;

    console.log("Prompt:", userPrompt.substring(0, 300));
    
    const result = await generateText({
      model: openai("gpt-5-mini"),
      system: prompt.prompt_text,
      prompt: userPrompt,
      temperature: 0.3,
    });

    console.log("LLM raw response:", result.text);

    let pages: { id: string; title: string; purpose: string; path: string; parentId: string | null }[] = [];
    try {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          pages = parsed.map((p: { title: string; path: string; purpose?: string; parentId?: string | null }) => ({
            id: p.title,
            title: p.title,
            path: p.path,
            purpose: p.purpose || "",
            parentId: p.parentId ?? null,
          }));
        }
      }
    } catch (parseErr) {
      console.error("JSON parse failed:", parseErr);
    }

    console.log("Parsed pages:", pages.length);

    if (pages.length === 0) {
      return NextResponse.json({
        brief: projectContext,
        nodes: [{ id: ROOT_ID, type: "sitemap", position: { x: 0, y: 0 }, data: { title: "Sitemap", path: "/", sections: [] } }],
        edges: [],
        strategy: `Regenerate failed - no valid pages returned`,
      });
    }

    const normalizedPages = normalizePages(pages);
    const graph = toFlowGraph(normalizedPages);

    return NextResponse.json({
      brief: projectContext,
      nodes: graph.nodes,
      edges: graph.edges,
      strategy: `Regenerated based on feedback: ${feedback}`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logServerError("sitemap.regenerate.failed", error, { sitemapId: id, feedback });
    return NextResponse.json({ 
      error: "Regeneration failed.",
      detail: errMsg,
      step: "catch block"
    }, { status: 500 });
  }
}