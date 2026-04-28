import { openai } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { requireEnv } from "@/utils/env";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import { validatePdfFiles, validateTextLength } from "@/utils/validation";
import type { Edge, Node } from "@xyflow/react";
import type { GeneratedSitemap, SitemapNodeData, SitemapPage } from "@/types/sitemap";

export const runtime = "nodejs";

const sitemapSchema = jsonSchema<GeneratedSitemap>({
  type: "object",
  additionalProperties: false,
  required: ["projectName", "strategy", "pages"],
  properties: {
    projectName: { type: "string" },
    strategy: { type: "string" },
    pages: {
      type: "array",
      minItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "purpose", "path", "parentId"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string" },
          path: { type: "string" },
          parentId: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
}

function createFeedbackPasscode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function normalizePages(pages: SitemapPage[]) {
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
const PDF_ANALYSIS_REQUIRED_MESSAGE = "PDF analysis must finish before generating a sitemap.";

function toFlowGraph(pages: SitemapPage[]) {
  // Build children map. Top-level pages (parentId null) attach to ROOT_ID.
  const children = new Map<string, string[]>();
  children.set(ROOT_ID, []);

  for (const page of pages) {
    const parentKey = page.parentId ?? ROOT_ID;
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey)!.push(page.id);
  }

  // Bottom-up: compute the subtree width of every node.
  const subtreeWidth = new Map<string, number>();

  function calcWidth(id: string): number {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      subtreeWidth.set(id, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const total = kids.reduce((sum, kid) => sum + calcWidth(kid) + NODE_H_GAP, -NODE_H_GAP);
    subtreeWidth.set(id, total);
    return total;
  }
  calcWidth(ROOT_ID);

  // Top-down: assign x/y positions.
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

  // Build master root node.
  const rootNode: Node<SitemapNodeData> = {
    id: ROOT_ID,
    type: "sitemap",
    position: positions.get(ROOT_ID)!,
    data: { title: "Sitemap", path: "/", sections: [] },
  };

  // Build page nodes.
  const pageNodes: Node<SitemapNodeData>[] = pages.map((page) => ({
    id: page.id,
    type: "sitemap",
    position: positions.get(page.id) ?? { x: 0, y: 0 },
    data: {
      title: page.title,
      purpose: page.purpose,
      path: page.path,
      sections: [],
    },
  }));

  const nodes = [rootNode, ...pageNodes];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Root → top-level page edges.
  const rootEdges: Edge[] = (children.get(ROOT_ID) ?? [])
    .filter((id) => nodeIds.has(id))
    .map((id) => ({ id: `${ROOT_ID}-${id}`, source: ROOT_ID, target: id, animated: false }));

  // Child page edges.
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

async function extractPdfText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    return parsed.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function getOrCreateProjectId({
  projectId,
  projectName,
  supabase,
}: {
  projectId?: FormDataEntryValue | null;
  projectName: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  if (typeof projectId === "string" && projectId.trim()) {
    const id = projectId.trim();
    const { data, error } = await supabase.from("projects").select("id").eq("id", id).single();

    if (error || !data) {
      throw new Error(error?.message ?? "Project not found.");
    }

    return data.id as string;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: projectName.trim() || "Untitled project",
      slug: `${slugify(projectName)}-${crypto.randomUUID().slice(0, 8)}`,
      staging_base_url: "https://staging.example.com",
      embed_public_key: crypto.randomUUID(),
      feedback_passcode: createFeedbackPasscode(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create project.");
  }

  return data.id as string;
}

function parseProjectContext(value: string | null | undefined) {
  if (!value) return "";

  try {
    const parsed = JSON.parse(value) as {
      __type?: string;
      additional_details?: string;
      brief?: string;
      industry?: string;
      summary?: string;
      strategy_sheet?: string;
      usp?: string;
    };

    if (parsed.__type !== "project_context") return "";

    return [
      parsed.brief,
      parsed.additional_details && `Additional details:\n${parsed.additional_details}`,
      parsed.summary && `Project summary:\n${parsed.summary}`,
      parsed.industry && `Industry:\n${parsed.industry}`,
      parsed.usp && `USP:\n${parsed.usp}`,
      parsed.strategy_sheet && `Strategy sheet:\n${parsed.strategy_sheet}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return "";
  }
}

function projectRowToBrief(project: {
  additional_details?: string | null;
  brief?: string | null;
  industry?: string | null;
  summary?: string | null;
  strategy_sheet?: string | null;
  usp?: string | null;
}) {
  return [
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

async function getProjectContextBrief({
  projectId,
  supabase,
}: {
  projectId: FormDataEntryValue | null;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  if (typeof projectId !== "string" || !projectId.trim()) return "";
  const id = projectId.trim();

  const { data: project } = await supabase
    .from("projects")
    .select("summary,industry,usp,strategy_sheet,brief,additional_details")
    .eq("id", id)
    .maybeSingle();

  const projectBrief = project ? projectRowToBrief(project) : "";

  if (projectBrief) {
    return projectBrief;
  }

  const { data } = await supabase
    .from("sitemaps")
    .select("brief,nodes,updated_at")
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  const contextRow = (data ?? []).find((row) => {
    const nodes = Array.isArray(row.nodes) ? row.nodes : [];
    return nodes.length === 0 && parseProjectContext(row.brief);
  });

  return parseProjectContext(contextRow?.brief);
}

async function validateProjectDocumentsReady({
  projectId,
  supabase,
}: {
  projectId: FormDataEntryValue | null;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  if (typeof projectId !== "string" || !projectId.trim()) return null;

  const { data, error } = await supabase
    .from("project_documents")
    .select("analysis_status")
    .eq("project_id", projectId.trim());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasIncompleteDocument = (data ?? []).some(
    (document) => document.analysis_status !== "ready",
  );

  if (!hasIncompleteDocument) return null;

  return NextResponse.json({ error: PDF_ANALYSIS_REQUIRED_MESSAGE }, { status: 409 });
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "sitemaps:generate", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  requireEnv("openai");

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const briefText = String(formData.get("brief") ?? "").trim();
  const requestedProjectId = formData.get("projectId");
  const pdf = formData.get("pdf");
  let pdfText = "";
  const files = pdf instanceof File && pdf.size > 0 ? [pdf] : [];
  const pdfValidationError = validatePdfFiles(files);
  if (pdfValidationError) return pdfValidationError;

  let adminSupabase: ReturnType<typeof createAdminClient>;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing Supabase admin client.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const projectDocumentsError = await validateProjectDocumentsReady({
    projectId: requestedProjectId,
    supabase: adminSupabase,
  });
  if (projectDocumentsError) return projectDocumentsError;

  if (pdf instanceof File && pdf.size > 0) {
    try {
      pdfText = await extractPdfText(pdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse PDF brief.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let combinedBrief = [briefText, pdfText && `PDF brief extract:\n${pdfText}`]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const briefError = validateTextLength(combinedBrief, "Brief");
  if (briefError) return briefError;

  const supabase = await createClient();

  if (!combinedBrief) {
    combinedBrief = await getProjectContextBrief({
      projectId: requestedProjectId,
      supabase: adminSupabase,
    });
  }

  if (!combinedBrief) {
    return NextResponse.json(
      { error: "Add brief text, upload a PDF, or create the project with strategy context first." },
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
    const result = await generateObject({
      model: openai("gpt-4o-mini"),
      system: prompt.prompt_text,
      prompt: `Project context:\n${combinedBrief}`,
      schema: sitemapSchema,
      schemaName: "ClientWebsiteSitemap",
      temperature: 0.35,
    });

    const sitemap = {
      ...result.object,
      pages: normalizePages(result.object.pages),
    };
    const graph = toFlowGraph(sitemap.pages);
    const projectId = await getOrCreateProjectId({
      projectId: requestedProjectId,
      projectName: sitemap.projectName,
      supabase: adminSupabase,
    });

    const { data: saved, error: saveError } = await supabase
      .from("sitemaps")
      .insert({
        project_id: projectId,
        brief: combinedBrief,
        nodes: graph.nodes,
        edges: graph.edges,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({
      brief: combinedBrief,
      projectId,
      sitemapId: saved.id,
      sitemap,
      ...graph,
    });
  } catch (error) {
    logServerError("sitemap.generate.failed", error);
    return NextResponse.json({ error: "Unable to generate sitemap." }, { status: 500 });
  }
}
