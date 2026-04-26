import { notFound } from "next/navigation";
import type { Node } from "@xyflow/react";
import { requirePageRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";
import type { SitemapNodeData } from "@/types/sitemap";
import ProjectDetailClient, {
  type PageCopy,
  type ProjectDocument,
  type ProjectDetails,
  type SitemapPage,
} from "./ProjectDetailClient";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

type ProjectRow = {
  id: string;
  name?: string | null;
  industry?: string | null;
  summary?: string | null;
  usp?: string | null;
  USP?: string | null;
  staging_base_url?: string | null;
  additional_details?: string | null;
  brief?: string | null;
  expiry_date?: string | null;
  start_date?: string | null;
  strategy_sheet?: string | null;
};

type SitemapRow = {
  id: string;
  project_id: string;
  brief: string | null;
  nodes: unknown;
  created_at: string;
  updated_at: string;
};

type PageCopyRow = {
  id: string;
  page_name: string;
  url_path: string;
  content: string | null;
  updated_at: string;
};

type ProjectContext = {
  __type?: string;
  additional_details?: string;
  brief?: string;
  industry?: string;
  summary?: string;
  expiry_date?: string;
  start_date?: string;
  strategy_sheet?: string;
  usp?: string;
  staging_base_url?: string;
  documents?: unknown[];
};

type ProjectDocumentRow = {
  file_name: string;
  file_size: number | null;
  id: string;
  mime_type: string | null;
  public_url: string;
  storage_path: string;
};

function isSitemapNode(value: unknown): value is Node<SitemapNodeData> {
  if (!value || typeof value !== "object") return false;

  const node = value as { id?: unknown; data?: Partial<SitemapNodeData> };
  return (
    typeof node.id === "string" &&
    typeof node.data?.title === "string" &&
    typeof node.data?.path === "string"
  );
}

function valueOrEmpty(value?: string | null) {
  return value?.trim() ?? "";
}

function getSitemapPages(nodes: unknown): SitemapPage[] {
  if (!Array.isArray(nodes)) return [];

  return nodes
    .filter(isSitemapNode)
    .filter((node) => node.id !== "sitemap-root")
    .map((node) => ({
      id: node.id,
      title: node.data.title,
      path: node.data.path,
      sections: node.data.sections ?? [],
    }));
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

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  await requirePageRole(["superadmin", "employee"]);
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    notFound();
  }

  const projectRow = project as ProjectRow;

  const { data: sitemaps } = await supabase
    .from("sitemaps")
    .select("id,project_id,brief,nodes,created_at,updated_at")
    .eq("project_id", projectRow.id)
    .order("updated_at", { ascending: false });

  const sitemapRows = (sitemaps ?? []) as SitemapRow[];
  const latestSitemap =
    sitemapRows.find((row) => Array.isArray(row.nodes) && row.nodes.length > 0) ?? null;
  const projectContext =
    sitemapRows
      .map((row) =>
        Array.isArray(row.nodes) && row.nodes.length === 0 ? parseProjectContext(row.brief) : null,
      )
      .find(Boolean) ?? null;
  const { data: copies } = latestSitemap
    ? await supabase
        .from("page_copies")
        .select("id,page_name,url_path,content,updated_at")
        .eq("sitemap_id", latestSitemap.id)
        .order("updated_at", { ascending: false })
    : { data: [] };
  const { data: documentRows, error: documentsError } = await supabase
    .from("project_documents")
    .select("id,file_name,file_size,mime_type,public_url,storage_path")
    .eq("project_id", projectRow.id)
    .order("created_at", { ascending: false });

  const pageCopies = ((copies ?? []) as PageCopyRow[]).map((copy) => ({
    id: copy.id,
    pageName: copy.page_name,
    path: copy.url_path,
    content: copy.content ?? "",
    updatedAt: copy.updated_at,
  })) satisfies PageCopy[];
  const sitemapPages = getSitemapPages(latestSitemap?.nodes);
  const tableDocuments = documentsError
    ? []
    : ((documentRows ?? []) as ProjectDocumentRow[]).map((document) => ({
        fileName: document.file_name,
        fileSize: document.file_size ?? 0,
        id: document.id,
        mimeType: document.mime_type ?? "application/pdf",
        publicUrl: document.public_url,
        storagePath: document.storage_path,
      }));
  const fallbackDocuments = Array.isArray(projectContext?.documents)
    ? projectContext.documents
        .map((document): ProjectDocument | null => {
          if (!document || typeof document !== "object") return null;
          const value = document as Record<string, unknown>;
          const publicUrl = value.publicUrl ?? value.public_url;
          const storagePath = value.storagePath ?? value.storage_path;
          const fileName = value.fileName ?? value.file_name;
          const mimeType = value.mimeType ?? value.mime_type;
          const fileSize = value.fileSize ?? value.file_size;

          if (
            typeof publicUrl !== "string" ||
            typeof storagePath !== "string" ||
            typeof fileName !== "string"
          ) {
            return null;
          }

          return {
            fileName,
            fileSize: typeof fileSize === "number" ? fileSize : 0,
            id: typeof value.id === "string" ? value.id : storagePath,
            mimeType: typeof mimeType === "string" ? mimeType : "application/pdf",
            publicUrl,
            storagePath,
          };
        })
        .filter((document): document is ProjectDocument => Boolean(document))
    : [];
  const documents = tableDocuments.length > 0 ? tableDocuments : fallbackDocuments;
  const details: ProjectDetails = {
    additional_details: valueOrEmpty(projectRow.additional_details ?? projectContext?.additional_details),
    brief: valueOrEmpty(projectRow.brief ?? projectContext?.brief ?? latestSitemap?.brief),
    expiry_date: valueOrEmpty(projectRow.expiry_date ?? projectContext?.expiry_date),
    industry: valueOrEmpty(projectRow.industry ?? projectContext?.industry),
    staging_base_url: valueOrEmpty(
      projectRow.staging_base_url ?? projectContext?.staging_base_url,
    ),
    start_date: valueOrEmpty(projectRow.start_date ?? projectContext?.start_date),
    strategy_sheet: valueOrEmpty(projectRow.strategy_sheet ?? projectContext?.strategy_sheet),
    summary: valueOrEmpty(projectRow.summary ?? projectContext?.summary),
    usp: valueOrEmpty(projectRow.usp ?? projectRow.USP ?? projectContext?.usp),
  };

  return (
    <ProjectDetailClient
      canvasHref={latestSitemap ? `/canvas?id=${latestSitemap.id}` : `/canvas?projectId=${projectRow.id}`}
      initialCopies={pageCopies}
      initialDetails={details}
      initialDocuments={documents}
      projectId={projectRow.id}
      projectName={valueOrEmpty(projectRow.name) || "Untitled project"}
      sitemapPages={sitemapPages}
      wordExportHref={latestSitemap ? `/api/sitemaps/${latestSitemap.id}/export/word` : null}
    />
  );
}
