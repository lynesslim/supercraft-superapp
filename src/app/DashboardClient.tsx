"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { DashboardProject } from "./page";

const PAGE_SIZE = 20;
const MAX_LARGE_PDF_BYTES = 60 * 1024 * 1024;
const MAX_LARGE_PDF_FILES = 4;
const PDF_ANALYSIS_TOAST_STORAGE_KEY = "supercraft:pdf-analysis-toast-project";
const PDF_UPLOAD_COMPLETE_STORAGE_KEY = "supercraft:pdf-upload-complete-project";
const PDF_UPLOAD_EVENT = "supercraft:project-pdfs-uploaded";
const CREATE_LOADING_MESSAGES = [
  "Creating project workspace...",
  "Preparing project overview...",
];

const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(value?: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return dateFormatter.format(date);
}

function includesSearch(project: DashboardProject, query: string) {
  if (!query) return true;

  const haystack = [
    project.name,
    project.industry,
    project.summary,
    project.usp,
    project.embedPublicKey,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesFilter(project: DashboardProject, filter: string) {
  if (filter === "with-sitemap") return Boolean(project.latestSitemap);
  if (filter === "needs-sitemap") return !project.latestSitemap;
  if (filter === "with-copy") return project.copyCount > 0;
  return true;
}

function truncateKey(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function validatePdfSelection(files: File[]) {
  if (files.length > MAX_LARGE_PDF_FILES) {
    return `Upload up to ${MAX_LARGE_PDF_FILES} PDF documents per project.`;
  }

  for (const file of files) {
    if (file.type && file.type !== "application/pdf") {
      return "Upload must be a PDF file.";
    }

    if (file.size > MAX_LARGE_PDF_BYTES) {
      return `PDF files must be ${Math.floor(MAX_LARGE_PDF_BYTES / 1024 / 1024)}MB or smaller.`;
    }
  }

  return "";
}

async function uploadProjectPdfDocuments(projectId: string, files: File[]) {
  if (files.length === 0) return;

  const supabase = createClient();

  for (const file of files) {
    const prepareResponse = await fetch(`/api/projects/${projectId}/documents/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/pdf",
      }),
    });
    const prepareData = (await prepareResponse.json()) as {
      document?: {
        id?: string;
        storagePath: string;
      };
      error?: string;
      path?: string;
      token?: string;
    };

    if (!prepareResponse.ok || !prepareData.path || !prepareData.token) {
      throw new Error(prepareData.error ?? "Unable to prepare PDF upload.");
    }

    const { error } = await supabase.storage
      .from("project-briefs")
      .uploadToSignedUrl(prepareData.path, prepareData.token, file, {
        contentType: file.type || "application/pdf",
      });

    if (error) {
      if (prepareData.document) {
        await fetch(`/api/projects/${projectId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete-document",
            documentId: prepareData.document.id,
            storagePath: prepareData.document.storagePath,
          }),
        }).catch(() => null);
      }
      throw new Error(error.message);
    }
  }
}

function CreateProjectModal({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);

  useEffect(() => {
    if (!isCreating) return;

    const interval = window.setInterval(() => {
      setLoadingIndex((current) => current + 1);
    }, 1400);

    return () => window.clearInterval(interval);
  }, [isCreating]);

  if (!open) return null;

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating) return;

    setError("");
    setIsCreating(true);
    setLoadingIndex(0);

    try {
      const rawFormData = new FormData(event.currentTarget);
      const pdfs = rawFormData
        .getAll("pdf")
        .filter((value): value is File => value instanceof File && value.size > 0);
      const pdfError = validatePdfSelection(pdfs);

      if (pdfError) {
        setError(pdfError);
        setIsCreating(false);
        return;
      }

      rawFormData.delete("pdf");
      rawFormData.set("has_documents", pdfs.length > 0 ? "true" : "false");

      const response = await fetch("/api/projects", {
        method: "POST",
        body: rawFormData,
      });
      const data = (await response.json()) as { error?: string; projectId?: string };

      if (!response.ok || !data.projectId) {
        setError(data.error ?? "Unable to create project.");
        setIsCreating(false);
        return;
      }

      if (pdfs.length > 0) {
        window.sessionStorage.setItem(PDF_ANALYSIS_TOAST_STORAGE_KEY, data.projectId);
        void uploadProjectPdfDocuments(data.projectId, pdfs)
          .then(() => {
            window.sessionStorage.setItem(PDF_UPLOAD_COMPLETE_STORAGE_KEY, data.projectId!);
            window.dispatchEvent(
              new CustomEvent(PDF_UPLOAD_EVENT, { detail: { projectId: data.projectId } }),
            );
          })
          .catch((error) => {
            window.dispatchEvent(
              new CustomEvent(PDF_UPLOAD_EVENT, {
                detail: {
                  error: error instanceof Error ? error.message : "Unable to upload PDF documents.",
                  projectId: data.projectId,
                },
              }),
            );
          });
      }

      router.push(`/projects/${data.projectId}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create project.");
      setIsCreating(false);
    }
  }

  const loadingMessage = CREATE_LOADING_MESSAGES[loadingIndex % CREATE_LOADING_MESSAGES.length];

  return (
    <div className="motion-fade-in fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 py-6">
      <div className="motion-slide-up max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#a3b840]/25 bg-[#1a1c16] shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a3b840]">
              New project
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#f3f4ec]">
              Create project
            </h2>
          </div>
          <button
            aria-label="Close create project modal"
            className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-white/55 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a]"
            disabled={isCreating}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <form
          className="grid gap-4 p-5"
          encType="multipart/form-data"
          method="post"
          onSubmit={createProject}
        >
          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Project name
            <input
              className="rounded-lg border border-white/10 bg-[#111310] px-3 py-2.5 text-sm font-medium text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
              disabled={isCreating}
              name="name"
              placeholder="Client or brand name"
              required
              type="text"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Brief text
            <textarea
              className="min-h-28 resize-y rounded-lg border border-white/10 bg-[#111310] px-3 py-2.5 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
              disabled={isCreating}
              name="brief"
              placeholder="Audience, offer, goals, constraints, and must-have messaging"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Additional details
            <textarea
              className="min-h-20 resize-y rounded-lg border border-white/10 bg-[#111310] px-3 py-2.5 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
              disabled={isCreating}
              name="additional_details"
              placeholder="Optional internal notes, assets, competitors, or preferences"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-white/65">
            PDF brief
            <input
              accept="application/pdf"
              className="rounded-lg border border-dashed border-white/12 bg-[#111310] px-3 py-2.5 text-sm text-white/45 file:mr-3 file:rounded-md file:border-0 file:bg-[#a3b840] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#111310]"
              disabled={isCreating}
              multiple
              name="pdf"
              type="file"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Staging URL
            <input
              className="rounded-lg border border-white/10 bg-[#111310] px-3 py-2.5 text-sm font-medium text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
              disabled={isCreating}
              name="staging_base_url"
              placeholder="https://staging.example.com"
              type="url"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Start date
            <input
              className="rounded-lg border border-white/10 bg-[#111310] px-3 py-2.5 text-sm font-medium text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
              disabled={isCreating}
              name="start_date"
              type="date"
              defaultValue={new Date().toISOString().split("T")[0]}
            />
            <span className="text-xs font-medium text-white/35">
              Expiry is automatically set to one year after the start date.
            </span>
          </label>

          {isCreating && (
            <p className="motion-status-pulse rounded-lg border border-[#a3b840]/20 bg-[#a3b840]/10 px-3 py-2 text-sm font-semibold text-[#c8db5a]">
              {loadingMessage}
            </p>
          )}

          {error && (
            <p className="motion-pop rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          )}

          <button
            className="motion-lift inline-flex items-center justify-center gap-2 rounded-lg bg-[#a3b840] px-4 py-3 text-sm font-bold text-[#111310] transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreating}
            type="submit"
          >
            {isCreating ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            {isCreating ? "Creating..." : "Create project"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function DashboardClient({
  isSuperadmin,
  projects,
}: {
  isSuperadmin: boolean;
  projects: DashboardProject[];
}) {
  const router = useRouter();
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletedProjectIds, setDeletedProjectIds] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<DashboardProject | null>(null);

  const normalizedQuery = query.trim();
  const visibleProjects = useMemo(
    () => projects.filter((project) => !deletedProjectIds.has(project.id)),
    [deletedProjectIds, projects],
  );

  const filteredProjects = useMemo(
    () =>
      visibleProjects.filter(
        (project) => includesSearch(project, normalizedQuery) && matchesFilter(project, filter),
      ),
    [filter, normalizedQuery, visibleProjects],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageProjects = filteredProjects.slice(pageStart, pageStart + PAGE_SIZE);
  const showingStart = filteredProjects.length === 0 ? 0 : pageStart + 1;
  const showingEnd = Math.min(pageStart + PAGE_SIZE, filteredProjects.length);

  async function copyEmbedKey(project: DashboardProject) {
    if (!project.embedPublicKey || project.embedPublicKey === "Not generated") return;

    await navigator.clipboard.writeText(project.embedPublicKey);
    setCopiedProjectId(project.id);
    window.setTimeout(() => setCopiedProjectId(null), 1400);
  }

  function confirmDeleteProject(project: DashboardProject) {
    setProjectToDelete(project);
  }

  async function deleteProject() {
    if (!projectToDelete || deletingProjectId) return;

    setDeletingProjectId(projectToDelete.id);
    setNotice("Deleting project...");
    setProjectToDelete(null);

    try {
      const response = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-project" }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setNotice(data.error ?? "Unable to delete project.");
        return;
      }

      setDeletedProjectIds((current) => new Set(current).add(projectToDelete.id));
      setNotice("Project deleted.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete project.");
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <section className="motion-fade-in flex h-[680px] min-h-[520px] w-full max-h-[calc(100vh-8rem)] flex-col rounded-lg border border-white/8 bg-[#1a1c16] shadow-2xl shadow-black/20">
      <div className="flex shrink-0 flex-col gap-4 border-b border-white/8 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a3b840]">
            Project list
          </p>
          <p className="mt-2 text-sm text-white/45">
            {filteredProjects.length} of {visibleProjects.length} projects shown
          </p>
          {notice && (
            <p className="motion-pop mt-2 rounded-lg border border-[#a3b840]/30 bg-[#a3b840]/10 px-3 py-2 text-xs font-semibold text-[#c8db5a]">
              {notice}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="h-10 rounded-lg border border-white/10 bg-[#111310] px-3 text-sm text-[#e8eae0] outline-none placeholder:text-white/25 focus:border-[#a3b840]/70"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search projects"
            type="search"
            value={query}
          />
          <select
            className="h-10 rounded-lg border border-white/10 bg-[#111310] px-3 text-sm font-semibold text-[#e8eae0] outline-none focus:border-[#a3b840]/70"
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
            value={filter}
          >
            <option value="all">All projects</option>
            <option value="with-sitemap">With sitemap</option>
            <option value="needs-sitemap">Needs sitemap</option>
            <option value="with-copy">With copy</option>
          </select>
          <button
            className="motion-lift inline-flex h-10 items-center gap-2 rounded-lg bg-[#a3b840] px-3 text-sm font-bold text-[#111310] transition hover:bg-[#c8db5a]"
            onClick={() => setIsModalOpen(true)}
            type="button"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={2.4} />
            Add
          </button>
        </div>
      </div>

      <div className="canvas-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#111310] text-xs uppercase tracking-[0.14em] text-white/35">
            <tr>
              <th className="px-4 py-3 font-semibold">Project</th>
              <th className="px-4 py-3 font-semibold">Industry</th>
              <th className="px-4 py-3 font-semibold">Pages</th>
              <th className="px-4 py-3 font-semibold">Copy</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 font-semibold">Start</th>
              <th className="px-4 py-3 font-semibold">Expiry</th>
              <th className="px-4 py-3 font-semibold">Embed key</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {pageProjects.map((project, index) => {
              const canvasHref = project.latestSitemap
                ? `/canvas?id=${project.latestSitemap.id}`
                : `/canvas?projectId=${project.id}`;
              const canCopy = project.embedPublicKey !== "Not generated";
              const isCopied = copiedProjectId === project.id;

              return (
                <tr
                  className="group motion-lift cursor-pointer transition hover:bg-white/[0.03]"
                  style={{ animationDelay: `${index * 50}ms` }}
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/projects/${project.id}`);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="max-w-[280px] px-4 py-4">
                    <Link
                      className="font-semibold text-[#f3f4ec] transition hover:text-[#c8db5a]"
                      href={`/projects/${project.id}`}
                    >
                      {project.name}
                    </Link>
                    <p className="mt-1 truncate text-xs text-white/40">
                      {project.summary ?? project.usp ?? "No project summary yet"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-white/60">{project.industry ?? "Not set"}</td>
                  <td className="px-4 py-4 font-semibold text-[#e8eae0]">{project.pageCount}</td>
                  <td className="px-4 py-4 font-semibold text-[#e8eae0]">{project.copyCount}</td>
                  <td className="px-4 py-4 text-white/60">{formatDate(project.updatedAt)}</td>
                  <td className="px-4 py-4 text-white/60">{formatDate(project.startDate)}</td>
                  <td className="px-4 py-4 text-white/60">{formatDate(project.expiryDate)}</td>
                  <td className="px-4 py-4">
                    <div className="flex max-w-[230px] items-center gap-2">
                      <span
                        className="truncate font-mono text-xs text-white/45"
                        title={canCopy ? project.embedPublicKey : undefined}
                      >
                        {truncateKey(project.embedPublicKey)}
                      </span>
                      {canCopy && (
                        <button
                          aria-label={isCopied ? "Copied embed key" : "Copy embed key"}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/8 text-white/35 opacity-0 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#a3b840]/45 group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyEmbedKey(project);
                          }}
                          title={isCopied ? "Copied" : "Copy embed key"}
                          type="button"
                        >
                          {isCopied ? (
                            <Check aria-hidden="true" size={15} />
                          ) : (
                            <Clipboard aria-hidden="true" size={15} />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        aria-label={`Open details for ${project.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-white/60 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a]"
                        href={`/projects/${project.id}`}
                        onClick={(event) => event.stopPropagation()}
                        title="Details"
                      >
                        <FileText aria-hidden="true" size={16} />
                      </Link>
                      <Link
                        aria-label={`Open canvas for ${project.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/8 text-white/65 transition hover:bg-[#a3b840] hover:text-[#111310]"
                        href={canvasHref}
                        onClick={(event) => event.stopPropagation()}
                        title="Canvas"
                      >
                        <ExternalLink aria-hidden="true" size={16} />
                      </Link>
                      {isSuperadmin ? (
                        <button
                          aria-label={`Delete ${project.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-300/15 text-red-200/65 transition hover:border-red-300/35 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={deletingProjectId === project.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            confirmDeleteProject(project);
                          }}
                          title="Delete project"
                          type="button"
                        >
                          {deletingProjectId === project.id ? (
                            <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                          ) : (
                            <Trash2 aria-hidden="true" size={16} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredProjects.length === 0 && (
        <div className="border-t border-white/8 p-8 text-center">
          <p className="text-lg font-semibold text-[#f3f4ec]">No matching projects</p>
          <p className="mt-2 text-sm text-white/45">Adjust the search or filter.</p>
        </div>
      )}

      {filteredProjects.length > 0 && (
        <div className="flex shrink-0 flex-col gap-3 border-t border-white/8 px-4 py-3 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {showingStart}-{showingEnd} of {filteredProjects.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-white/60 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a] disabled:pointer-events-none disabled:opacity-35"
              disabled={currentPage === 1}
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <span className="min-w-20 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              {currentPage} / {totalPages}
            </span>
            <button
              aria-label="Next page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-white/60 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a] disabled:pointer-events-none disabled:opacity-35"
              disabled={currentPage === totalPages}
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              type="button"
            >
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      )}

      <CreateProjectModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {projectToDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 py-6">
          <div className="motion-pop w-full max-w-md rounded-xl border border-red-300/25 bg-[#1a1c16] p-5 shadow-2xl shadow-black/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                <Trash2 className="text-red-400" size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-red-300">Delete Project</p>
                <p className="text-xs text-white/45">This action cannot be undone.</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[#e8eae0]">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-white">{projectToDelete.name}</span>
              ? All project data will be permanently removed.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/5"
                disabled={!!deletingProjectId}
                onClick={() => setProjectToDelete(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!!deletingProjectId}
                onClick={deleteProject}
                type="button"
              >
                {deletingProjectId ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
