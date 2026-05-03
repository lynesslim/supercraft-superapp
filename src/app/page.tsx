import DashboardClient from "./DashboardClient";
import { requirePageRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type ProjectRow = Record<string, unknown> & {
  created_at?: string | null;
  embed_public_key?: string | null;
  id: string;
  name?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
};

type SitemapRow = {
  id: string;
  project_id: string;
  brief?: string | null;
  nodes?: unknown;
  updated_at?: string | null;
};

export type DashboardProject = {
  createdAt?: string | null;
  embedPublicKey: string;
  id: string;
  industry?: string;
  latestSitemap?: SitemapRow;
  name: string;
  pageCount: number;
  startDate?: string | null;
  expiryDate?: string | null;
  summary?: string;
  updatedAt?: string | null;
  usp?: string;
};

type ProjectContext = {
  __type?: string;
  additional_details?: string;
  brief?: string;
  industry?: string;
  summary?: string;
  strategy_sheet?: string;
  start_date?: string;
  expiry_date?: string;
  usp?: string;
};

function getText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return undefined;
}

function countSitemapPages(nodes: unknown) {
  if (!Array.isArray(nodes)) return 0;

  return nodes.filter((node) => {
    if (!node || typeof node !== "object") return false;
    const candidate = node as { data?: { path?: unknown }; id?: unknown };
    return (
      candidate.id !== "sitemap-root" &&
      typeof candidate.data?.path === "string"
    );
  }).length;
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

async function getDashboardProjects() {
  const supabase = createAdminClient();

  const [{ data: projects, error: projectsError }, { data: sitemaps, error: sitemapsError }] =
    await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase
        .from("sitemaps")
        .select("id,project_id,brief,nodes,updated_at")
        .order("updated_at", { ascending: false }),
    ]);

  if (projectsError) throw new Error(projectsError.message);
  if (sitemapsError) throw new Error(sitemapsError.message);

  const projectRows = (projects ?? []) as ProjectRow[];
  const sitemapRows = (sitemaps ?? []) as SitemapRow[];
  const latestSitemapByProject = new Map<string, SitemapRow>();
  const contextByProject = new Map<string, ProjectContext>();

  for (const sitemap of sitemapRows) {
    const nodes = Array.isArray(sitemap.nodes) ? sitemap.nodes : [];
    const context = nodes.length === 0 ? parseProjectContext(sitemap.brief) : null;

    if (context && !contextByProject.has(sitemap.project_id)) {
      contextByProject.set(sitemap.project_id, context);
    }

    if (nodes.length > 0 && !latestSitemapByProject.has(sitemap.project_id)) {
      latestSitemapByProject.set(sitemap.project_id, sitemap);
    }
  }

  return projectRows.map<DashboardProject>((project) => {
    const latestSitemap = latestSitemapByProject.get(project.id);
    const context = contextByProject.get(project.id);

    return {
      createdAt: project.created_at,
      embedPublicKey: project.embed_public_key?.trim() || "Not generated",
      id: project.id,
      industry: getText(project, ["industry", "business_industry", "category"]) ?? context?.industry,
      latestSitemap,
      name: project.name?.trim() || "Untitled project",
      pageCount: countSitemapPages(latestSitemap?.nodes),
      startDate: project.start_date ?? context?.start_date ?? null,
      expiryDate: project.expiry_date ?? context?.expiry_date ?? null,
      summary: getText(project, ["summary", "project_summary", "description"]) ?? context?.summary,
      updatedAt: latestSitemap?.updated_at ?? project.created_at,
      usp: getText(project, ["usp", "unique_selling_proposition", "value_proposition"]) ?? context?.usp,
    };
  });
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="motion-lift rounded-lg border border-white/8 bg-[#111310] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#e8eae0]">{value}</p>
    </div>
  );
}

export default async function Home() {
  const auth = await requirePageRole(["superadmin", "employee"]);
  let projects: DashboardProject[] = [];
  let errorMessage: string | null = null;

  try {
    projects = await getDashboardProjects();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to load dashboard.";
  }

  const totalPages = projects.reduce((sum, project) => sum + project.pageCount, 0);
  const activeProjects = projects.filter((project) => project.latestSitemap).length;
  const projectsNeedingSitemap = projects.length - activeProjects;

  return (
    <main className="motion-fade-in min-h-screen bg-[#111310] px-4 py-5 text-[#e8eae0] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-none content-start gap-5">
        <section className="grid min-w-0 content-start gap-5">
          <header className="motion-slide-up rounded-lg border border-white/8 bg-[#1a1c16] p-5 shadow-2xl shadow-black/25 lg:p-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.55fr)] xl:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#a3b840]">
                  Dashboard
                </p>
                <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-[#f3f4ec] sm:text-5xl">
                  Projects, sitemaps, and copy at a glance.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/50">
                  Review client work by project, jump back into the latest sitemap, and track copy
                  coverage before export.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Metric label="Projects" value={String(projects.length)} />
                <Metric label="With sitemap" value={String(activeProjects)} />
                <Metric label="Pages" value={String(totalPages)} />
                <Metric label="Needs sitemap" value={String(projectsNeedingSitemap)} />
              </div>
            </div>
          </header>

          {errorMessage && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
              {errorMessage}
            </div>
          )}

          <DashboardClient isSuperadmin={auth.role === "superadmin"} projects={projects} />

          {!errorMessage && projects.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/12 bg-[#1a1c16] p-8 text-center">
              <p className="text-lg font-semibold text-[#f3f4ec]">No projects yet</p>
              <p className="mt-2 text-sm text-white/45">
                Create a project from the panel above, or generate a sitemap from the canvas.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
