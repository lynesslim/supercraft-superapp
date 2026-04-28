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
  created_at: string;
  additional_details?: string | null;
  brief?: string | null;
  industry?: string | null;
  summary?: string | null;
  strategy_sheet?: string | null;
  usp?: string | null;
};

type SitemapSummaryRow = {
  brief?: string | null;
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
  project_id: string;
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

export default async function CanvasPage({ searchParams }: CanvasPageProps) {
  await requirePageRole(["superadmin", "employee"]);
  const { id, projectId } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: projects }, { data: sitemapSummaries }, { data: documentStatuses }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,created_at,summary,industry,usp,strategy_sheet,brief,additional_details")
      .order("created_at", { ascending: false }),
    supabase
      .from("sitemaps")
      .select("id,project_id,brief,nodes,updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("project_documents").select("project_id,analysis_status"),
  ]);

  const projectRows = (projects ?? []) as ProjectRow[];
  const sitemapRows = (sitemapSummaries ?? []) as SitemapSummaryRow[];
  const documentStatusRows = (documentStatuses ?? []) as ProjectDocumentStatusRow[];
  const latestSitemapByProject = new Map<string, string>();
  const projectContextByProject = new Map<string, ProjectContext>();
  const hasIncompleteDocumentsByProject = new Map<string, boolean>();

  for (const document of documentStatusRows) {
    if (document.analysis_status !== "ready") {
      hasIncompleteDocumentsByProject.set(document.project_id, true);
    }
  }

  for (const sitemap of sitemapRows) {
    const nodes = Array.isArray(sitemap.nodes) ? sitemap.nodes : [];
    const context = nodes.length === 0 ? parseProjectContext(sitemap.brief) : null;

    if (context && !projectContextByProject.has(sitemap.project_id)) {
      projectContextByProject.set(sitemap.project_id, context);
    }

    if (nodes.length > 0 && !latestSitemapByProject.has(sitemap.project_id)) {
      latestSitemapByProject.set(sitemap.project_id, sitemap.id);
    }
  }

  const projectOptions: ProjectOption[] = projectRows
    .map((project) => ({
      hasIncompleteDocuments: hasIncompleteDocumentsByProject.get(project.id) ?? false,
      id: project.id,
      name: project.name?.trim() || "Untitled project",
      sitemapId: latestSitemapByProject.get(project.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const projectNameById = new Map(projectOptions.map((project) => [project.id, project.name]));
  const projectRowById = new Map(projectRows.map((project) => [project.id, project]));
  const selectedProject = projectId
    ? projectOptions.find((project) => project.id === projectId)
    : undefined;
  const selectedSitemapId = id ?? selectedProject?.sitemapId ?? "";

  if (projectId && !selectedProject) {
    notFound();
  }

  if (!selectedSitemapId) {
    const context = projectId ? projectContextByProject.get(projectId) ?? null : null;
    const projectContext = projectId
      ? projectRowToBrief(projectRowById.get(projectId), context)
      : "";

    return (
      <SitemapGraph
        initialBrief={projectContext}
        initialProjectId={projectId ?? ""}
        initialProjectHasIncompleteDocuments={
          projectId ? hasIncompleteDocumentsByProject.get(projectId) ?? false : false
        }
        initialProjectName={
          projectId ? projectNameById.get(projectId) ?? "Sitemap Canvas" : "Sitemap Canvas"
        }
        initialProjects={projectOptions}
        key={projectId ?? "new-canvas"}
      />
    );
  }

  const [{ data: sitemap, error: sitemapError }, { data: copies }] = await Promise.all([
    supabase
      .from("sitemaps")
      .select("id,project_id,brief,nodes,edges,updated_at")
      .eq("id", selectedSitemapId)
      .single(),
    supabase
      .from("page_copies")
      .select("id,page_name,url_path,content,updated_at")
      .eq("sitemap_id", selectedSitemapId)
      .order("updated_at", { ascending: false }),
  ]);

  if (sitemapError || !sitemap) {
    notFound();
  }

  return (
    <SitemapGraph
      key={sitemap.id}
      initialBrief={
        projectRowToBrief(
          projectRowById.get(sitemap.project_id),
          projectContextByProject.get(sitemap.project_id) ?? null,
        ) || sitemap.brief || ""
      }
      initialCopies={(copies ?? []) as PageCopy[]}
      initialEdges={Array.isArray(sitemap.edges) ? sitemap.edges.filter(isSitemapEdge) : []}
      initialNodes={Array.isArray(sitemap.nodes) ? sitemap.nodes.filter(isSitemapNode) : []}
      initialProjectId={sitemap.project_id ?? ""}
      initialProjectHasIncompleteDocuments={
        sitemap.project_id ? hasIncompleteDocumentsByProject.get(sitemap.project_id) ?? false : false
      }
      initialProjectName={projectNameById.get(sitemap.project_id) ?? "Sitemap Canvas"}
      initialProjects={projectOptions}
      initialSitemapId={sitemap.id}
    />
  );
}
