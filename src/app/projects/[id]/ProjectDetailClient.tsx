"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import {
  Check,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  LayoutList,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import BackButton from "@/app/BackButton";
import { createClient } from "@/utils/supabase/client";

const MAX_LARGE_PDF_BYTES = 60 * 1024 * 1024;
const MAX_LARGE_PDF_FILES = 4;

export type ProjectDetails = {
  additional_details: string;
  brief: string;
  expiry_date: string;
  industry: string;
  staging_base_url: string;
  start_date: string;
  strategy_sheet: string;
  summary: string;
  usp: string;
};

export type SitemapPage = {
  id: string;
  title: string;
  path: string;
  sections: string[];
};

export type PageCopy = {
  id: string;
  pageName: string;
  path: string;
  content: string;
  updatedAt: string;
};

export type ProjectDocument = {
  analysisError?: string | null;
  analysisStatus: "uploaded" | "processing" | "ready" | "failed";
  analysisSummary?: string | null;
  fileName: string;
  fileSize: number;
  id?: string;
  mimeType: string;
  openaiFileId?: string | null;
  openaiVectorStoreId?: string | null;
  signedUrl: string;
  storagePath: string;
};

type ProjectDetailClientProps = {
  canvasHref: string;
  initialCopies: PageCopy[];
  initialDetails: ProjectDetails;
  initialDocuments: ProjectDocument[];
  projectId: string;
  projectName: string;
  sitemapPages: SitemapPage[];
  wordExportHref: string | null;
};

type EditableField = keyof ProjectDetails;
type ActiveTab = "overview" | "sitemap";

const FIELD_LABELS: Record<EditableField, string> = {
  additional_details: "Additional Details",
  brief: "Brief",
  expiry_date: "Expiry Date",
  industry: "Industry",
  staging_base_url: "Staging Base URL",
  start_date: "Start Date",
  strategy_sheet: "Strategy Sheet",
  summary: "Summary",
  usp: "USP",
};

const FIELD_ORDER: EditableField[] = [
  "summary",
  "industry",
  "usp",
  "start_date",
  "expiry_date",
  "strategy_sheet",
  "brief",
  "additional_details",
  "staging_base_url",
];

const LONG_FIELDS = new Set<EditableField>([
  "summary",
  "strategy_sheet",
  "brief",
  "additional_details",
]);

function normalizeCopyPath(path: string) {
  return path.trim() || "/";
}

function pickInitialPage(pages: SitemapPage[], copies: PageCopy[]) {
  return pages[0]?.id ?? copies[0]?.id ?? "";
}

function addOneYearDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
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

function documentStatusLabel(document: ProjectDocument) {
  if (document.analysisStatus === "ready") return "AI ready";
  if (document.analysisStatus === "processing") return "Processing";
  if (document.analysisStatus === "failed") return "AI unavailable";
  return "Uploaded";
}

export default function ProjectDetailClient({
  canvasHref,
  initialCopies,
  initialDetails,
  initialDocuments,
  projectId,
  projectName,
  sitemapPages,
  wordExportHref,
}: ProjectDetailClientProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [documents, setDocuments] = useState(initialDocuments);
  const [savedDetails, setSavedDetails] = useState(initialDetails);
  const [draftDetails, setDraftDetails] = useState(initialDetails);
  const [selectedField, setSelectedField] = useState<EditableField>("summary");
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("Overview is read-only until you enter edit mode.");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isAnalyzingDocuments, setIsAnalyzingDocuments] = useState(false);
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState(() =>
    pickInitialPage(sitemapPages, initialCopies),
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(savedDetails) !== JSON.stringify(draftDetails),
    [draftDetails, savedDetails],
  );
  const copyByPath = useMemo(() => {
    const map = new Map<string, PageCopy>();
    initialCopies.forEach((copy) => map.set(normalizeCopyPath(copy.path), copy));
    return map;
  }, [initialCopies]);
  const copyOnlyPages = useMemo(
    () =>
      initialCopies
        .filter(
          (copy) =>
            !sitemapPages.some((page) => normalizeCopyPath(page.path) === normalizeCopyPath(copy.path)),
        )
        .map((copy) => ({
          id: copy.id,
          path: copy.path,
          sections: [],
          title: copy.pageName,
        })),
    [initialCopies, sitemapPages],
  );
  const pageOptions = [...sitemapPages, ...copyOnlyPages];
  const selectedPage =
    pageOptions.find((page) => page.id === selectedPageId) ?? pageOptions[0] ?? null;
  const selectedCopy = selectedPage ? copyByPath.get(normalizeCopyPath(selectedPage.path)) : null;

  function updateField(field: EditableField, value: string) {
    setDraftDetails((current) => ({
      ...current,
      [field]: value,
      ...(field === "start_date" ? { expiry_date: addOneYearDate(value) } : {}),
    }));
  }

  function startEditing() {
    setDraftDetails(savedDetails);
    setIsEditing(true);
    setNotice("Edits are saved only when you press Save.");
  }

  function cancelEditing() {
    setDraftDetails(savedDetails);
    setFeedback("");
    setIsEditing(false);
    setNotice("Overview is read-only until you enter edit mode.");
  }

  async function saveDetails() {
    setIsSaving(true);
    setNotice("Saving project details...");

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: draftDetails }),
      });
      const data = (await response.json()) as { details?: ProjectDetails; error?: string };

      if (!response.ok || !data.details) {
        setNotice(data.error ?? "Unable to save project details.");
        return;
      }

      setSavedDetails(data.details);
      setDraftDetails(data.details);
      setNotice("Project details saved.");
      setIsEditing(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save project details.");
    } finally {
      setIsSaving(false);
    }
  }

  async function refineField() {
    setIsRefining(true);
    setNotice(`Refining ${FIELD_LABELS[selectedField]}...`);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          details: draftDetails,
          feedback: feedback.trim() || undefined,
          field: selectedField,
        }),
      });
      const data = (await response.json()) as { value?: string; error?: string };

      if (!response.ok || typeof data.value !== "string") {
        setNotice(data.error ?? "Unable to refine field.");
        return;
      }

      updateField(selectedField, data.value);
      setFeedback("");
      setNotice(`${FIELD_LABELS[selectedField]} updated in draft. Save to keep it.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to refine field.");
    } finally {
      setIsRefining(false);
    }
  }

  async function uploadDocuments(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const pdfError = validatePdfSelection(selectedFiles);
    if (pdfError) {
      setNotice(pdfError);
      event.target.value = "";
      return;
    }

    setIsUploadingDocuments(true);
    setNotice("Uploading PDFs to private storage...");

    try {
      const supabase = createClient();
      const uploadedDocuments: ProjectDocument[] = [];

      for (const file of selectedFiles) {
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
          document?: ProjectDocument;
          error?: string;
          path?: string;
          token?: string;
        };

        if (!prepareResponse.ok || !prepareData.path || !prepareData.token || !prepareData.document) {
          setNotice(prepareData.error ?? "Unable to prepare PDF upload.");
          return;
        }

        const { error } = await supabase.storage
          .from("project-briefs")
          .uploadToSignedUrl(prepareData.path, prepareData.token, file, {
            contentType: file.type || "application/pdf",
          });

        if (error) {
          await fetch(`/api/projects/${projectId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "delete-document",
              documentId: prepareData.document.id,
              storagePath: prepareData.document.storagePath,
            }),
          }).catch(() => null);
          throw new Error(error.message);
        }

        uploadedDocuments.push(prepareData.document);
      }

      setDocuments((current) => [...uploadedDocuments, ...current]);
      await analyzeDocuments(uploadedDocuments.length);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to upload documents.");
    } finally {
      event.target.value = "";
      setIsUploadingDocuments(false);
    }
  }

  async function analyzeDocuments(attempts = 1) {
    setIsAnalyzingDocuments(true);
    setNotice("Analyzing uploaded PDF...");

    try {
      let analyzedCount = 0;

      for (let index = 0; index < attempts; index += 1) {
        const response = await fetch(`/api/projects/${projectId}/documents/analyze`, {
          method: "POST",
        });
        const data = (await response.json()) as {
          details?: ProjectDetails;
          documentId?: string;
          error?: string;
          status?: ProjectDocument["analysisStatus"];
        };

        if (!response.ok) {
          if (data.documentId) {
            setDocuments((current) =>
              current.map((document) =>
                document.id === data.documentId
                  ? {
                      ...document,
                      analysisError: data.error ?? "Document uploaded, AI analysis unavailable.",
                      analysisStatus: "failed",
                    }
                  : document,
              ),
            );
          }
          setNotice(data.error ?? "Document uploaded, AI analysis unavailable.");
          return;
        }

        if (data.documentId && data.status) {
          setDocuments((current) =>
            current.map((document) =>
              document.id === data.documentId
                ? {
                    ...document,
                    analysisError: null,
                    analysisStatus: data.status ?? "ready",
                  }
                : document,
            ),
          );
        }

        if (data.details) {
          setSavedDetails(data.details);
          setDraftDetails(data.details);
          analyzedCount += 1;
        }

        if (!data.documentId) {
          break;
        }
      }

      setNotice(
        analyzedCount > 0
          ? "PDF analysis completed and project overview updated."
          : "No uploaded documents are waiting for analysis.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Document uploaded, AI analysis unavailable.");
    } finally {
      setIsAnalyzingDocuments(false);
    }
  }

  async function deleteDocument(document: ProjectDocument) {
    const documentKey = document.id ?? document.storagePath;
    setDeletingDocumentId(documentKey);
    setNotice(`Removing ${document.fileName}...`);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-document",
          documentId: document.id,
          storagePath: document.storagePath,
        }),
      });
      const data = (await response.json()) as {
        deletedId?: string;
        details?: ProjectDetails;
        error?: string;
      };

      if (!response.ok || !data.details) {
        setNotice(data.error ?? "Unable to remove document.");
        return;
      }

      setDocuments((current) =>
        current.filter(
          (item) =>
            item.id !== data.deletedId &&
            item.storagePath !== document.storagePath &&
            item.id !== document.id,
        ),
      );
      setSavedDetails(data.details);
      setDraftDetails(data.details);
      setNotice("PDF document removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to remove document.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  return (
    <main className="motion-fade-in min-h-screen bg-[#111310] px-4 py-5 text-[#e8eae0] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="motion-slide-up rounded-2xl border border-white/8 bg-[#181a16] px-5 py-4 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <BackButton className="h-8 w-8" />
                <Link
                  className="text-xs font-semibold text-white/40 transition hover:text-[#a3b840]"
                  href="/"
                >
                  Projects
                </Link>
              </div>
              <h1 className="mt-2 truncate text-2xl font-black tracking-tight text-[#f4f6ea] sm:text-4xl">
                {projectName}
              </h1>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-[#e8eae0] transition hover:bg-white/12"
                href={canvasHref}
              >
                <ExternalLink size={14} />
                Canvas
              </Link>
              {wordExportHref ? (
                <Link
                  className="inline-flex items-center gap-2 rounded-full bg-[#a3b840] px-3 py-2 text-xs font-bold text-[#171a12] transition hover:bg-[#b5cc4a]"
                  href={wordExportHref}
                >
                  <Download size={14} />
                  Word
                </Link>
              ) : null}
            </div>
          </div>

        </header>

        <div className="flex items-center justify-between gap-3 rounded-full border border-white/8 bg-[#181a16] p-1">
          <div className="flex gap-1">
            {(["overview", "sitemap"] as ActiveTab[]).map((tab) => (
              <button
                  className={`motion-lift inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                  activeTab === tab
                    ? "bg-[#a3b840] text-[#171a12]"
                    : "text-white/45 hover:bg-white/8 hover:text-[#e8eae0]"
                }`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab === "overview" ? <FileText size={14} /> : <LayoutList size={14} />}
                {tab}
              </button>
            ))}
          </div>
          {activeTab === "overview" ? (
            isEditing ? (
              <div className="mr-1 flex items-center gap-2">
                <span
                  className={`hidden text-[11px] font-semibold sm:block ${
                    hasUnsavedChanges ? "text-amber-300" : "text-white/35"
                  }`}
                >
                  {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
                </span>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-bold text-white/55 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a]"
                  onClick={cancelEditing}
                  type="button"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="motion-lift mr-1 inline-flex h-9 items-center gap-2 rounded-full bg-[#a3b840] px-3 text-xs font-bold text-[#171a12] transition hover:bg-[#b5cc4a]"
                onClick={startEditing}
                type="button"
              >
                <Edit3 size={14} />
                Edit
              </button>
            )
          ) : null}
        </div>

        {activeTab === "overview" ? (
          <section
            className={`grid gap-4 ${
              isEditing ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""
            }`}
          >
            <div className="motion-fade-in rounded-2xl border border-white/8 bg-[#1b1d19] p-4 shadow-2xl shadow-black/25">
              <div className="grid gap-4">
                {FIELD_ORDER.map((field) => (
                  isEditing ? (
                    <FieldEditor
                      field={field}
                      key={field}
                      onChange={(event) => updateField(field, event.target.value)}
                      value={draftDetails[field]}
                    />
                  ) : (
                    <FieldDisplay field={field} key={field} value={savedDetails[field]} />
                  )
                ))}
              </div>
              <div className="mt-5 border-t border-white/8 pt-5">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#a3b840]" />
                    <h2 className="text-sm font-bold text-[#f4f6ea]">Documents</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {documents.some((document) =>
                      ["uploaded", "failed"].includes(document.analysisStatus),
                    ) ? (
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white/65 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isAnalyzingDocuments}
                        onClick={() =>
                          void analyzeDocuments(
                            documents.filter((document) =>
                              ["uploaded", "failed"].includes(document.analysisStatus),
                            ).length,
                          )
                        }
                        type="button"
                      >
                        {isAnalyzingDocuments ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        {isAnalyzingDocuments ? "Analyzing..." : "Analyze PDF"}
                      </button>
                    ) : null}
                    {isEditing ? (
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white/65 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a]">
                        {isUploadingDocuments ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                        {isUploadingDocuments ? "Uploading..." : "Add PDF"}
                        <input
                          accept="application/pdf"
                          className="sr-only"
                          disabled={isUploadingDocuments}
                          multiple
                          onChange={uploadDocuments}
                          type="file"
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
                {documents.length > 0 ? (
                  <div className="grid gap-2">
                    {documents.map((document) => {
                      const documentKey = document.id ?? document.storagePath;
                      const isDeleting = deletingDocumentId === documentKey;

                      return (
                      <article
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5"
                        key={documentKey}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#e8eae0]">
                            {document.fileName}
                          </p>
                          <p className="mt-0.5 text-xs text-white/35">
                            {formatFileSize(document.fileSize)} · {documentStatusLabel(document)}
                          </p>
                          {document.analysisError ? (
                            <p className="mt-1 text-xs text-amber-200/80">
                              {document.analysisError}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {document.signedUrl ? (
                            <>
                              <a
                                aria-label={`Open ${document.fileName}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/55 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a]"
                                href={document.signedUrl}
                                rel="noreferrer"
                                target="_blank"
                                title="Open PDF"
                              >
                                <ExternalLink size={15} />
                              </a>
                              <a
                                aria-label={`Download ${document.fileName}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/8 text-white/60 transition hover:bg-[#a3b840] hover:text-[#111310]"
                                download={document.fileName}
                                href={document.signedUrl}
                                title="Download PDF"
                              >
                                <Download size={15} />
                              </a>
                            </>
                          ) : null}
                          {isEditing ? (
                            <button
                              aria-label={`Remove ${document.fileName}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300/15 text-red-200/65 transition hover:border-red-300/35 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                              disabled={isDeleting}
                              onClick={() => void deleteDocument(document)}
                              title="Remove PDF"
                              type="button"
                            >
                              {isDeleting ? (
                                <Loader2 className="animate-spin" size={15} />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-white/45">
                    No PDF brief documents have been uploaded for this project.
                  </p>
                )}
              </div>
            </div>

            {isEditing ? (
            <aside className="motion-slide-up rounded-2xl border border-white/8 bg-[#1b1d19] p-4 shadow-2xl shadow-black/25">
              <div className="flex items-center gap-2">
                <RefreshCw size={16} className="text-[#a3b840]" />
                <h2 className="text-sm font-bold text-[#f4f6ea]">Refine Draft</h2>
              </div>
              <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Field
                <select
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#111310] px-3 py-2 text-sm font-medium normal-case tracking-normal text-[#e8eae0] outline-none focus:border-[#a3b840]/50"
                  onChange={(event) => setSelectedField(event.target.value as EditableField)}
                  value={selectedField}
                >
                  {FIELD_ORDER.map((field) => (
                    <option key={field} value={field}>
                      {FIELD_LABELS[field]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Feedback
                <textarea
                  className="canvas-scrollbar mt-2 min-h-32 w-full resize-y rounded-xl border border-white/10 bg-[#111310] p-3 text-sm leading-6 normal-case tracking-normal text-[#e8eae0] outline-none placeholder:text-white/25 focus:border-[#a3b840]/50"
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Make it sharper, more premium, clearer, more concise..."
                  value={feedback}
                />
              </label>
              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2.5 text-sm font-semibold text-[#e8eae0] transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isRefining}
                onClick={refineField}
                type="button"
              >
                {isRefining ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                {isRefining ? "Refining..." : "Regenerate field"}
              </button>
              <button
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#a3b840] px-4 py-2.5 text-sm font-bold text-[#171a12] transition hover:bg-[#b5cc4a] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isSaving || !hasUnsavedChanges}
                onClick={saveDetails}
                type="button"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : hasUnsavedChanges ? <Save size={16} /> : <Check size={16} />}
                {isSaving ? "Saving..." : "Save changes"}
              </button>
              <p className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs leading-5 text-white/45">
                {notice}
              </p>
            </aside>
            ) : null}
          </section>
        ) : (
          <section className="grid h-[calc(100vh-210px)] min-h-[560px] gap-4 overflow-hidden rounded-2xl border border-white/8 bg-[#1b1d19] p-4 shadow-2xl shadow-black/25 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-[#f4f6ea]">Pages</h2>
                <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold text-white/45">
                  {pageOptions.length}
                </span>
              </div>
              <div className="canvas-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
                {pageOptions.length > 0 ? (
                  pageOptions.map((page) => {
                    const hasCopy = copyByPath.has(normalizeCopyPath(page.path));
                    return (
                      <button
                        className={`block w-full rounded-xl border p-3 text-left transition ${
                          selectedPage?.id === page.id
                            ? "border-[#a3b840]/50 bg-[#a3b840]/12"
                            : "border-white/8 bg-black/18 hover:border-white/14 hover:bg-white/6"
                        }`}
                        key={page.id}
                        onClick={() => setSelectedPageId(page.id)}
                        type="button"
                      >
                        <span className="block truncate text-sm font-bold text-[#f4f6ea]">
                          {page.title}
                        </span>
                        <span className="mt-1 block truncate text-xs font-medium text-[#a3b840]">
                          {page.path}
                        </span>
                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white/35">
                          <Globe size={12} />
                          {hasCopy ? "Copy ready" : "No copy"}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/45">
                    No sitemap pages are available yet.
                  </p>
                )}
              </div>
            </div>

            <article className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-[#111310]">
              <div className="border-b border-white/8 px-5 py-4">
                <h2 className="truncate text-lg font-black text-[#f4f6ea]">
                  {selectedPage?.title ?? "Select a page"}
                </h2>
                <p className="mt-1 text-xs font-semibold text-[#a3b840]">
                  {selectedPage?.path ?? "No path"}
                </p>
                {selectedPage && selectedPage.sections.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedPage.sections.map((section) => (
                      <span
                        className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold text-white/45"
                        key={section}
                      >
                        {section}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="canvas-scrollbar min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-5 text-sm leading-7 text-white/65">
                {selectedCopy?.content?.trim() ||
                  "No webcopy has been saved for this page. Open the canvas to generate or edit copy."}
              </div>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}

function formatFileSize(size: number) {
  if (!size) return "PDF document";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function FieldEditor({
  field,
  onChange,
  value,
}: {
  field: EditableField;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  value: string;
}) {
  const sharedClass =
    "mt-2 w-full rounded-xl border border-white/10 bg-[#111310] px-3 py-2.5 text-sm leading-6 text-[#e8eae0] outline-none placeholder:text-white/25 focus:border-[#a3b840]/50";

  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
        {FIELD_LABELS[field]}
      </span>
      {LONG_FIELDS.has(field) ? (
        <textarea
          className={`${sharedClass} canvas-scrollbar min-h-32 resize-y`}
          onChange={onChange}
          value={value}
        />
      ) : (
        <input
          className={`${sharedClass} ${field === "expiry_date" ? "opacity-70" : ""}`}
          disabled={field === "expiry_date"}
          onChange={onChange}
          type={field === "start_date" || field === "expiry_date" ? "date" : "text"}
          value={value}
        />
      )}
    </label>
  );
}

function FieldDisplay({ field, value }: { field: EditableField; value: string }) {
  return (
    <article className="rounded-xl border border-white/8 bg-black/16 px-3 py-3">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
        {FIELD_LABELS[field]}
      </h2>
      <p
        className={`mt-2 whitespace-pre-wrap text-sm leading-6 text-[#e8eae0] ${
          value.trim() ? "" : "text-white/30"
        }`}
      >
        {value.trim() || "Not set"}
      </p>
    </article>
  );
}
