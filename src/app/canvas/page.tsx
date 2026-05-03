import { notFound } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { requirePageRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";
import type { SitemapNodeData } from "@/types/sitemap";
import SitemapGraph, { type PageCopy, type ProjectOption } from "./SitemapGraph";

type CanvasPageProps = {
  searchParams: Promise<{ id?: string; projectId?: string }>;
};

type ProjectRow = {
  id: string;
  name: string | null;
  created_at?: string;
  additional_details?: string | null;
  brief?: string | null;
  industry?: string | null;
  summary?: string | null;
  strategy_sheet?: string | null;
  usp?: string | null;
  style_guide?: string | null;
};

type SitemapSummaryRow = {
  brief?: string | null;
  edges?: unknown;
  id: string;
  nodes?: unknown;
  project_id: string;
  updated_at: string;
};

type ProjectContext = {
  additional_details?: string;
  brief?: string;
  industry?: string;
  summary?: string;
  strategy_sheet?: string;
  usp?: string;
  __type?: string;
};

type ProjectDocumentStatusRow = {
  analysis_status: string | null;
};

function isSitemapNode(value: unknown): value is Node<SitemapNodeData> {
  if (!value || typeof value !== "object") return false;

  const node = value as { id?: unknown; data?: Partial<SitemapNodeData>; position?: unknown };
  return (
    typeof node.id === "string" &&
    typeof node.data?.title === "string" &&
    typeof node.data?.path === "string" &&
    typeof node.position === "object"
  );
}

function isSitemapEdge(value: unknown): value is Edge {
  if (!value || typeof value !== "object") return false;

  const edge = value as { id?: unknown; source?: unknown; target?: unknown };
  return (
    typeof edge.id === "string" &&
    typeof edge.source === "string" &&
    typeof edge.target === "string"
  );
}

function parseProjectContext(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as ProjectContext;
    return parsed.__type === "project_context" ? parsed : null;
  } catch {
    return null;
  }
}

function projectContextToBrief(context: ProjectContext | null) {
  if (!context) return "";

  return [
    context.brief,
    context.additional_details && `Additional details:\n${context.additional_details}`,
    context.summary && `Project summary:\n${context.summary}`,
    context.industry && `Industry:\n${context.industry}`,
    context.usp && `USP:\n${context.usp}`,
    context.strategy_sheet && `Strategy sheet:\n${context.strategy_sheet}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function projectRowToBrief(project: ProjectRow | undefined, fallback?: ProjectContext | null) {
  if (!project) return projectContextToBrief(fallback ?? null);

  return [
    project.summary && `Project summary:\n${project.summary}`,
    project.industry && `Industry:\n${project.industry}`,
    project.usp && `USP:\n${project.usp}`,
    project.strategy_sheet && `Strategy sheet:\n${project.strategy_sheet}`,
    project.brief && `Brief:\n${project.brief}`,
    project.additional_details && `Additional details:\n${project.additional_details}`,
  ]
    .filter(Boolean)
    .join("\n\n") || projectContextToBrief(fallback ?? null);
}

async function getProjectRow(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
) {
  const { data } = await supabase
    .from("projects")
    .select("id,name,summary,industry,usp,strategy_sheet,brief,additional_details,style_guide")
    .eq("id", projectId)
    .maybeSingle();

  return (data ?? undefined) as ProjectRow | undefined;
}

async function getLatestSitemapForProject(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
) {
  const { data } = await supabase
    .from("sitemaps")
    .select("id,project_id,brief,nodes,edges,updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  return ((data ?? []) as SitemapSummaryRow[]).find((row) => {
    const nodes = Array.isArray(row.nodes) ? row.nodes : [];
    return nodes.length > 0;
  }) ?? null;
}

async function getProjectContext(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
) {
  const { data } = await supabase
    .from("sitemaps")
    .select("brief,nodes")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  for (const sitemap of (data ?? []) as SitemapSummaryRow[]) {
    const nodes = Array.isArray(sitemap.nodes) ? sitemap.nodes : [];
    const context = nodes.length === 0 ? parseProjectContext(sitemap.brief) : null;
    if (context) return context;
  }

  return null;
}

async function hasIncompleteProjectDocuments(
  supabase: ReturnType<typeof createAdminClient>,
  projectId?: string,
) {
  if (!projectId) return false;

  const { data } = await supabase
    .from("project_documents")
    .select("analysis_status")
    .eq("project_id", projectId);

  return ((data ?? []) as ProjectDocumentStatusRow[]).some(
    (document) => document.analysis_status !== "ready",
  );
}

export default async function CanvasPage({ searchParams }: CanvasPageProps) {
  await requirePageRole(["superadmin", "employee"]);
  const { id, projectId } = await searchParams;
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id,name")
    .order("created_at", { ascending: false });

  const projectRows = (projects ?? []) as ProjectRow[];

  const projectOptions: ProjectOption[] = projectRows
    .map((project) => ({
      id: project.id,
      name: project.name?.trim() || "Untitled project",
    }));

  const projectNameById = new Map(projectOptions.map((project) => [project.id, project.name]));
  const selectedProject = projectId
    ? projectOptions.find((project) => project.id === projectId)
    : undefined;

  if (projectId && !selectedProject) {
    notFound();
  }

  const latestProjectSitemap =
    !id && projectId ? await getLatestSitemapForProject(supabase, projectId) : null;
  const selectedSitemapId = id ?? latestProjectSitemap?.id ?? "";

  if (!selectedSitemapId) {
    const [context, projectRow, hasIncompleteDocuments] = projectId
      ? await Promise.all([
          getProjectContext(supabase, projectId),
          getProjectRow(supabase, projectId),
          hasIncompleteProjectDocuments(supabase, projectId),
        ])
      : [null, undefined, false] as const;
    const projectStyleGuide = projectRow?.style_guide ?? "";
    const projectContext = projectId
      ? projectRowToBrief(projectRow, context)
      : "";

    return (
      <SitemapGraph
        initialBrief={projectContext}
        initialProjectId={projectId ?? ""}
        initialProjectHasIncompleteDocuments={hasIncompleteDocuments}
        initialProjectName={
          projectId ? projectNameById.get(projectId) ?? "Sitemap Canvas" : "Sitemap Canvas"
        }
        initialProjects={projectOptions}
        initialStyleGuide={projectStyleGuide}
        key={projectId ?? "new-canvas"}
      />
    );
  }

  const sitemapResult = latestProjectSitemap
    ? { data: latestProjectSitemap, error: null }
    : await supabase
        .from("sitemaps")
        .select("id,project_id,brief,nodes,edges,updated_at")
        .eq("id", selectedSitemapId)
        .single();
  const [{ data: sitemap, error: sitemapError }, { data: copies }] = await Promise.all([
    sitemapResult,
    supabase
      .from("page_copies")
      .select("id,page_name,url_path,content,updated_at")
      .eq("sitemap_id", selectedSitemapId)
      .order("updated_at", { ascending: false }),
  ]);

  if (sitemapError || !sitemap) {
    notFound();
  }

  const [sitemapProjectContext, sitemapProjectRow, sitemapHasIncompleteDocuments] =
    await Promise.all([
      getProjectContext(supabase, sitemap.project_id),
      getProjectRow(supabase, sitemap.project_id),
      hasIncompleteProjectDocuments(supabase, sitemap.project_id),
    ]);

  return (
    <SitemapGraph
      key={sitemap.id}
      initialBrief={
        projectRowToBrief(
          sitemapProjectRow,
          sitemapProjectContext,
        ) || sitemap.brief || ""
      }
      initialCopies={(copies ?? []) as PageCopy[]}
      initialEdges={Array.isArray(sitemap.edges) ? sitemap.edges.filter(isSitemapEdge) : []}
      initialNodes={Array.isArray(sitemap.nodes) ? sitemap.nodes.filter(isSitemapNode) : []}
      initialProjectId={sitemap.project_id ?? ""}
      initialProjectHasIncompleteDocuments={sitemapHasIncompleteDocuments}
      initialProjectName={projectNameById.get(sitemap.project_id) ?? "Sitemap Canvas"}
      initialProjects={projectOptions}
      initialSitemapId={sitemap.id}
      initialStyleGuide={sitemapProjectRow?.style_guide ?? ""}
    />
  );
}
