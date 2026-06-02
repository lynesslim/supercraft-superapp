"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
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
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import BackButton from "@/app/BackButton";
import { createClient } from "@/utils/supabase/client";
import Lightbox from "../../components/Lightbox";

const MAX_LARGE_PDF_BYTES = 60 * 1024 * 1024;
const MAX_LARGE_PDF_FILES = 4;
const PDF_ANALYSIS_TOAST_STORAGE_KEY = "supercraft:pdf-analysis-toast-project";
const PDF_UPLOAD_COMPLETE_STORAGE_KEY = "supercraft:pdf-upload-complete-project";
const PDF_UPLOAD_EVENT = "supercraft:project-pdfs-uploaded";

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
type ActiveTab = "overview" | "sitemap" | "mockups" | "assets";
type ToastState = {
  tone: "info" | "success" | "error";
  message: string;
} | null;

type ProjectHeroMockup = {
  id: string;
  image_url: string;
  prompt_used: string;
  accent_color: string | null;
  theme: string;
  created_at: string;
};

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

function getDocumentKey(document: ProjectDocument) {
  return document.id ?? document.storagePath;
}

function isDocumentAnalysisPending(document: ProjectDocument) {
  return document.analysisStatus === "uploaded" || document.analysisStatus === "processing";
}

function normalizeDetails(details: ProjectDetails): ProjectDetails {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, value ?? ""]),
  ) as ProjectDetails;
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [documents, setDocuments] = useState(initialDocuments);
  const [savedDetails, setSavedDetails] = useState(initialDetails);
  const [draftDetails, setDraftDetails] = useState(initialDetails);
  const [selectedField, setSelectedField] = useState<EditableField>("summary");
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("Overview is read-only until you enter edit mode.");
  const [toast, setToast] = useState<ToastState>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isAnalyzingDocuments, setIsAnalyzingDocuments] = useState(false);
  const [analysisProgressByDocument, setAnalysisProgressByDocument] = useState<Record<string, number>>({});
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState(() =>
    pickInitialPage(sitemapPages, initialCopies),
  );

  // Saved Mockups state
  const [savedMockups, setSavedMockups] = useState<ProjectHeroMockup[]>([]);
  const [isLoadingMockups, setIsLoadingMockups] = useState(false);
  const [previewMockup, setPreviewMockup] = useState<ProjectHeroMockup | null>(null);
  const [mockupToDelete, setMockupToDelete] = useState<string | null>(null);
  const [isEditingMockup, setIsEditingMockup] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadSavedMockups = useCallback(async () => {
    console.log("loadSavedMockups called, projectId:", projectId);
    setIsLoadingMockups(true);
    try {
      const res = await fetch(`/api/hero-generator/mockups?projectId=${projectId}`);
      console.log("loadSavedMockups response status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("loadSavedMockups data loaded:", data);
        setSavedMockups(data.mockups || []);
      } else {
        console.warn("loadSavedMockups response not ok:", res.statusText);
      }
    } catch (err) {
      console.error("Failed to load mockups:", err);
    } finally {
      console.log("loadSavedMockups setting isLoadingMockups to false");
      setIsLoadingMockups(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSavedMockups();
  }, [projectId, loadSavedMockups]);

  const handleDeleteMockup = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/hero-generator/mockups?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSavedMockups(prev => prev.filter(m => m.id !== id));
        setToast({ tone: "success", message: "Mockup removed successfully." });
      }
    } catch {
      setToast({ tone: "error", message: "Failed to remove mockup." });
    }
  }, []);

  // Assets state
  type ProjectAsset = {
    id: string;
    image_url: string;
    asset_type: "background" | "sheet";
    prompt_used: string;
    created_at: string;
  };
  const [savedAssets, setSavedAssets] = useState<ProjectAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<ProjectAsset | null>(null);
  const [isEditingAsset, setIsEditingAsset] = useState(false);

  const loadAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/assets`);
      if (res.ok) {
        const data = await res.json();
        setSavedAssets(data.assets || []);
      }
    } catch (err) {
      console.error("Failed to load assets:", err);
    } finally {
      setIsLoadingAssets(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAssets();
  }, [projectId, loadAssets]);

  const handleExtractAssets = useCallback(async (mockupImageUrl: string) => {
    setIsExtractingAssets(true);
    setToast({ tone: "info", message: "Extracting background and iconography assets..." });
    try {
      const res = await fetch("/api/hero-generator/extract-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mockupImageUrl, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || "Extraction failed.");

      const saved: ProjectAsset[] = [];
      for (const asset of data.assets || []) {
        const saveRes = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: asset.image_url,
            assetType: asset.asset_type,
            promptUsed: asset.prompt_used,
          }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          if (saveData.asset) saved.push(saveData.asset);
        }
      }
      setSavedAssets(prev => [...saved, ...prev]);
      setToast({ tone: "success", message: `Extracted ${saved.length} asset(s) successfully!` });
    } catch (err) {
      setToast({ tone: "error", message: err instanceof Error ? err.message : "Extraction failed." });
    } finally {
      setIsExtractingAssets(false);
    }
  }, [projectId]);

  const handleDeleteAsset = useCallback(async (assetId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/assets?assetId=${assetId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSavedAssets(prev => prev.filter(a => a.id !== assetId));
        setToast({ tone: "success", message: "Asset removed." });
      }
    } catch {
      setToast({ tone: "error", message: "Failed to remove asset." });
    }
  }, [projectId]);

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
  const pendingDocumentKeys = useMemo(
    () => documents.filter(isDocumentAnalysisPending).map(getDocumentKey),
    [documents],
  );
  const analyzeDocuments = useCallback(async (attempts = 1, reanalyze = false) => {
    setIsAnalyzingDocuments(true);
    setNotice("Analyzing uploaded PDF...");
    setToast({ tone: "info", message: "PDF analysis is running in the background." });

    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/analyze${reanalyze ? "?reanalyze=true" : ""}`,
        {
          method: "POST",
        },
      );
      const data = (await response.json()) as {
        details?: ProjectDetails;
        documentId?: string;
        documentIds?: string[];
        error?: string;
        status?: ProjectDocument["analysisStatus"];
      };
      const affectedDocumentIds = data.documentIds ?? (data.documentId ? [data.documentId] : []);

      if (!response.ok) {
        if (affectedDocumentIds.length > 0) {
          setDocuments((current) =>
            current.map((document) =>
              document.id && affectedDocumentIds.includes(document.id)
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
        setToast({
          tone: "error",
          message: data.error ?? "PDF analysis failed. Retry analysis or remove the PDF.",
        });
        return;
      }

      if (affectedDocumentIds.length > 0 && data.status) {
        setDocuments((current) =>
          current.map((document) =>
            document.id && affectedDocumentIds.includes(document.id)
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
        const details = normalizeDetails(data.details);
        setSavedDetails(details);
        setDraftDetails(details);
      }

      const analyzedCount = data.details ? affectedDocumentIds.length || attempts : 0;

      setNotice(
        analyzedCount > 0
          ? "PDF analysis completed and project overview updated."
          : "No uploaded documents are waiting for analysis.",
      );
      setToast({
        tone: analyzedCount > 0 ? "success" : "info",
        message:
          analyzedCount > 0
            ? "PDF analysis completed and project overview updated."
            : "No uploaded documents are waiting for analysis.",
      });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document uploaded, AI analysis unavailable.";
      setNotice(message);
      setToast({ tone: "error", message });
    } finally {
      setIsAnalyzingDocuments(false);
    }
  }, [projectId, router]);
  const didStartInitialAnalysisRef = useRef(false);

  useEffect(() => {
    if (pendingDocumentKeys.length === 0) return;

    const pendingSet = new Set(pendingDocumentKeys);
    const intervalId = window.setInterval(() => {
      setAnalysisProgressByDocument((current) => {
        const next: Record<string, number> = {};

        for (const key of pendingDocumentKeys) {
          const currentValue = current[key] ?? 8;
          const increment = currentValue < 45 ? 7 : currentValue < 75 ? 4 : 1;
          next[key] = Math.min(92, currentValue + increment);
        }

        for (const [key, value] of Object.entries(current)) {
          if (!pendingSet.has(key) && value < 100) {
            next[key] = 100;
          }
        }

        return next;
      });
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [pendingDocumentKeys]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDocuments(initialDocuments);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [initialDocuments]);

  useEffect(() => {
    if (isEditing) return;

    const timeoutId = window.setTimeout(() => {
      setSavedDetails(initialDetails);
      setDraftDetails(initialDetails);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [initialDetails, isEditing]);

  useEffect(() => {
    if (didStartInitialAnalysisRef.current) return;

    const pendingCount = initialDocuments.filter((document) =>
      ["uploaded", "failed"].includes(document.analysisStatus),
    ).length;
    const shouldShowToast =
      window.sessionStorage.getItem(PDF_ANALYSIS_TOAST_STORAGE_KEY) === projectId;

    if (!shouldShowToast && pendingCount === 0) return;

    const timeoutId = window.setTimeout(() => {
      if (shouldShowToast) {
        setToast({ tone: "info", message: "PDF analysis is running in the background." });
      }

      if (pendingCount === 0) return;
      window.sessionStorage.removeItem(PDF_ANALYSIS_TOAST_STORAGE_KEY);
      didStartInitialAnalysisRef.current = true;
      void analyzeDocuments(pendingCount);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [analyzeDocuments, initialDocuments, projectId]);

  useEffect(() => {
    if (window.sessionStorage.getItem(PDF_ANALYSIS_TOAST_STORAGE_KEY) !== projectId) return;

    const intervalId = window.setInterval(() => {
      if (window.sessionStorage.getItem(PDF_UPLOAD_COMPLETE_STORAGE_KEY) !== projectId) return;

      window.sessionStorage.removeItem(PDF_UPLOAD_COMPLETE_STORAGE_KEY);
      setToast({ tone: "info", message: "PDF upload completed. Analysis is starting." });
      router.refresh();
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [projectId, router]);

  useEffect(() => {
    function handleBackgroundUpload(event: Event) {
      const detail = (event as CustomEvent<{ error?: string; projectId?: string }>).detail;
      if (detail?.projectId !== projectId) return;

      if (detail.error) {
        setToast({ tone: "error", message: detail.error });
        setNotice(detail.error);
        return;
      }

      window.sessionStorage.removeItem(PDF_UPLOAD_COMPLETE_STORAGE_KEY);
      setToast({ tone: "info", message: "PDF upload completed. Analysis is starting." });
      router.refresh();
    }

    window.addEventListener(PDF_UPLOAD_EVENT, handleBackgroundUpload);
    return () => window.removeEventListener(PDF_UPLOAD_EVENT, handleBackgroundUpload);
  }, [projectId, router]);

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

      const uploadedDocuments = await Promise.all(selectedFiles.map(async (file) => {
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
          throw new Error(prepareData.error ?? "Unable to prepare PDF upload.");
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

        return prepareData.document;
      }));

      setDocuments((current) => [...uploadedDocuments, ...current]);
      setNotice("PDF uploaded. Analysis is running in the background.");
      setToast({ tone: "info", message: "PDF analysis is running in the background." });
      void analyzeDocuments(uploadedDocuments.length);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to upload documents.");
    } finally {
      event.target.value = "";
      setIsUploadingDocuments(false);
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
      {toast ? (
        <div
          className={`motion-slide-up fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl shadow-black/35 ${
            toast.tone === "success"
              ? "border-[#a3b840]/35 bg-[#202716] text-[#d8ec68]"
              : toast.tone === "error"
                ? "border-red-300/30 bg-red-950/85 text-red-100"
                : "border-white/12 bg-[#1f211c] text-[#e8eae0]"
          }`}
          role="status"
        >
          <span className="leading-5">{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-current opacity-60 transition hover:opacity-100"
            onClick={() => setToast(null)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
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
            {(["overview", "sitemap", "mockups", "assets"] as ActiveTab[]).map((tab) => (
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
                {tab === "overview" ? <FileText size={14} /> : tab === "sitemap" ? <LayoutList size={14} /> : tab === "mockups" ? <Sparkles size={14} /> : <Download size={14} />}
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
                    {documents.length > 0 ? (
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white/65 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isAnalyzingDocuments}
                        onClick={() => {
                          const pendingCount = documents.filter((document) =>
                            ["uploaded", "failed"].includes(document.analysisStatus),
                          ).length;
                          void analyzeDocuments(pendingCount || documents.length, pendingCount === 0);
                        }}
                        type="button"
                      >
                        {isAnalyzingDocuments ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        {isAnalyzingDocuments
                          ? "Analyzing..."
                          : documents.some((document) =>
                                ["uploaded", "failed"].includes(document.analysisStatus),
                              )
                            ? "Analyze PDF"
                            : "Re-analyze PDF"}
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
                      const docKey = getDocumentKey(document);
                      const isDeleting = deletingDocumentId === docKey;
                      const isAnalysisPending = isDocumentAnalysisPending(document);
                      const analysisProgress = Math.round(
                        analysisProgressByDocument[docKey] ?? 8,
                      );

                      return (
                      <article
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5"
                        key={docKey}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#e8eae0]">
                            {document.fileName}
                          </p>
                          <p className="mt-0.5 text-xs text-white/35">
                            {formatFileSize(document.fileSize)} · {documentStatusLabel(document)}
                          </p>
                          {isAnalysisPending ? (
                            <div className="mt-2 max-w-md">
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-[#a3b840] transition-[width] duration-700 ease-out"
                                  style={{ width: `${analysisProgress}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[11px] font-medium text-white/35">
                                Analyzing PDF context... {analysisProgress}%
                              </p>
                            </div>
                          ) : null}
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
        ) : activeTab === "mockups" ? (
          <section className="motion-fade-in rounded-2xl border border-white/8 bg-[#1b1d19] p-5 shadow-2xl shadow-black/25">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#f4f6ea]">Saved Hero Mockups</h2>
                <p className="text-xs text-white/40">Premium layout directions generated for this project via gpt-image-2</p>
              </div>
              <Link
                href="/hero-generator"
                className="mt-3 sm:mt-0 inline-flex items-center gap-2 rounded-full bg-[#a3b840] px-4 py-2 text-xs font-bold text-[#171a12] transition hover:bg-[#b5cc4a]"
              >
                <Sparkles size={12} />
                Generate More
              </Link>
            </div>

            {isLoadingMockups ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/45">
                <Loader2 className="animate-spin text-[#a3b840]" size={32} />
                <p className="mt-4 text-sm font-semibold">Loading saved mockups...</p>
              </div>
            ) : savedMockups.length > 0 ? (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedMockups.map((mockup) => (
                  <article 
                    key={mockup.id} 
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#111310]/60 transition duration-300 hover:border-white/20"
                  >
                    <div 
                      onClick={() => setPreviewMockup(mockup)}
                      className="relative block w-full bg-black/40 overflow-hidden cursor-zoom-in"
                    >
                      <img 
                        src={mockup.image_url} 
                        alt="Saved Mockup" 
                        className="w-full h-auto block transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    {/* Sibling Overlay Actions (Separate layer to eliminate nested link conflicts) */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 transition duration-300 group-hover:opacity-100 flex items-center justify-center pointer-events-none">
                      <div className="flex gap-3 pointer-events-auto">
                        <a
                          href={mockup.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition"
                          title="Open Mockup in New Tab"
                        >
                          <ExternalLink size={16} />
                        </a>
                        <a
                          href={mockup.image_url}
                          download={`project-hero-${mockup.id}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition"
                          title="Download Mockup"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          type="button"
                          onClick={() => setMockupToDelete(mockup.id)}
                          className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-200 backdrop-blur-md transition"
                          title="Delete Mockup"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4 border-t border-white/5">
                      <div className="flex justify-between items-center text-xs font-bold text-[#f4f6ea]">
                        <span>Theme: <span className="capitalize text-[#a3b840]">{mockup.theme}</span></span>
                        {mockup.accent_color && (
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="h-3 w-3 rounded-full border border-white/20" 
                              style={{ backgroundColor: mockup.accent_color }}
                            />
                            <span className="font-mono text-[10px] text-white/50">{mockup.accent_color}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 rounded-lg bg-black/40 p-3 border border-white/5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Generation Prompt</p>
                        <p className="mt-1.5 text-xs text-white/60 leading-relaxed font-mono line-clamp-3 hover:line-clamp-none transition duration-300">
                          {mockup.prompt_used}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-white/35 border border-dashed border-white/10 rounded-xl mt-6 bg-black/10">
                <Sparkles className="text-white/20" size={40} />
                <h3 className="mt-4 text-sm font-bold text-[#f4f6ea]">No mockups saved yet</h3>
                <p className="mt-1.5 text-xs max-w-xs leading-normal">
                  Launch the Hero Generator, choose styling blueprints, and save your mockup designs straight to this project!
                </p>
                <Link
                  href="/hero-generator"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#a3b840]/10 border border-[#a3b840]/25 px-4 py-2 text-xs font-bold text-[#c8db5a] hover:bg-[#a3b840]/20 transition"
                >
                  Go to Hero Generator
                  <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </section>
        ) : activeTab === "assets" ? (
          <section className="motion-fade-in rounded-2xl border border-white/8 bg-[#1b1d19] p-5 shadow-2xl shadow-black/25">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#f4f6ea]">Project Design Assets</h2>
                <p className="text-xs text-white/40">Extracted backgrounds and iconography sheets from hero mockups</p>
              </div>
            </div>

            {isLoadingAssets ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/45">
                <Loader2 className="animate-spin text-[#a3b840]" size={32} />
                <p className="mt-4 text-sm font-semibold">Loading assets...</p>
              </div>
            ) : savedAssets.length > 0 ? (
              <div className="mt-6 columns-2 sm:columns-3 gap-6 [column-fill:_balance]">
                {savedAssets.map((asset) => (
                  <article
                    key={asset.id}
                    className="break-inside-avoid mb-6 group relative overflow-hidden rounded-xl border border-white/10 bg-[#111310]/60 transition duration-300 hover:border-white/20 w-full"
                  >
                    <div
                      onClick={() => setPreviewAsset(asset)}
                      className="relative block w-full bg-black/40 overflow-hidden cursor-zoom-in"
                    >
                      <img
                        src={asset.image_url}
                        alt={`${asset.asset_type} asset`}
                        className="w-full h-auto block transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 transition duration-300 group-hover:opacity-100 flex items-center justify-center pointer-events-none">
                      <div className="flex gap-3 pointer-events-auto">
                        <a
                          href={asset.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition"
                          title="Open Asset in New Tab"
                        >
                          <ExternalLink size={16} />
                        </a>
                        <a
                          href={asset.image_url}
                          download={`project-asset-${asset.id}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition"
                          title="Download Asset"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          type="button"
                          onClick={() => { void handleDeleteAsset(asset.id); }}
                          className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-200 backdrop-blur-md transition"
                          title="Delete Asset"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
                          {asset.asset_type === "background" ? "Background" : "Iconography Sheet"}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-white/35 border border-dashed border-white/10 rounded-xl mt-6 bg-black/10">
                <Download className="text-white/20" size={40} />
                <h3 className="mt-4 text-sm font-bold text-[#f4f6ea]">No assets extracted yet</h3>
                <p className="mt-1.5 text-xs max-w-xs leading-normal">
                  Open a saved mockup preview and use the "Extract Assets" button to generate background and iconography assets.
                </p>
              </div>
            )}
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

      {previewMockup && (
        <Lightbox
          imageUrl={previewMockup.image_url}
          isEditingImage={isEditingMockup}
          onAiEdit={async (instruction) => {
            setIsEditingMockup(true);
            try {
              const res = await fetch("/api/hero-generator/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageUrl: previewMockup.image_url,
                  instruction,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || data.details || "Edit failed.");

              const saveRes = await fetch("/api/hero-generator/mockups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  imageUrl: data.imageUrl,
                  promptUsed: data.prompt,
                  accentColor: previewMockup.accent_color,
                  theme: previewMockup.theme,
                }),
              });
              const saveData = await saveRes.json();
              if (!saveRes.ok) throw new Error(saveData.error || "Auto-save failed.");

              setSavedMockups((prev) => [saveData.mockup, ...prev]);
              setPreviewMockup(saveData.mockup);
              setToast({ tone: "success", message: "AI edit saved as new mockup." });
              return data.imageUrl;
            } catch (err) {
              setToast({ tone: "error", message: err instanceof Error ? err.message : "Edit failed." });
              return "";
            } finally {
              setIsEditingMockup(false);
            }
          }}
          onClose={() => setPreviewMockup(null)}
        >
          <div className="mt-4 w-full rounded-xl border border-white/5 bg-[#111310]/80 p-5 backdrop-blur-md text-[#f4f6ea] max-w-full">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-[#a3b840]">Saved Mockup Preview</h4>
                <p className="text-xs text-white/40 mt-0.5">Theme: <span className="capitalize text-white/70">{previewMockup.theme}</span></p>
              </div>
              <div className="flex items-center gap-3">
                {previewMockup.accent_color && (
                  <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 px-3 py-1.5 rounded-lg">
                    <span 
                      className="h-3.5 w-3.5 rounded-full border border-white/20" 
                      style={{ backgroundColor: previewMockup.accent_color }}
                    />
                    <span className="font-mono text-xs text-white/60">{previewMockup.accent_color}</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={isExtractingAssets}
                  onClick={() => { void handleExtractAssets(previewMockup.image_url); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#a3b840]/30 bg-[#1a1c16] px-4 py-2 text-xs font-semibold text-[#a3b840] transition hover:bg-[#222420] disabled:opacity-50"
                >
                  {isExtractingAssets ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Download size={14} />
                  )}
                  {isExtractingAssets ? "Extracting..." : "Extract Assets"}
                </button>
                <a
                  href={previewMockup.image_url}
                  download={`project-hero-${previewMockup.id}.png`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#a3b840] px-4 py-2 text-xs font-bold text-[#171a12] transition hover:bg-[#b5cc4a]"
                >
                  <Download size={14} />
                  Download Full Resolution
                </a>
              </div>
            </div>
            <div className="mt-4 border-t border-white/5 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Prompt & Instructions Used</p>
              <p className="mt-2 text-xs font-mono text-white/65 leading-relaxed bg-black/50 p-3 rounded-lg border border-white/5 whitespace-pre-wrap select-all">
                {previewMockup.prompt_used}
              </p>
            </div>
          </div>
        </Lightbox>
      )}

      {previewAsset && (
        <Lightbox
          imageUrl={previewAsset.image_url}
          altText={`${previewAsset.asset_type} asset`}
          isEditingImage={isEditingAsset}
          onAiEdit={async (instruction) => {
            setIsEditingAsset(true);
            try {
              const res = await fetch("/api/hero-generator/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageUrl: previewAsset.image_url,
                  instruction,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || data.details || "Edit failed.");

              const saveRes = await fetch(`/api/projects/${projectId}/assets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageUrl: data.imageUrl,
                  assetType: previewAsset.asset_type,
                  promptUsed: data.prompt,
                }),
              });
              const saveData = await saveRes.json();
              if (!saveRes.ok) throw new Error(saveData.error || "Auto-save failed.");

              setSavedAssets((prev) => [saveData.asset, ...prev]);
              setPreviewAsset(saveData.asset);
              setToast({ tone: "success", message: "AI edit saved as new asset." });
              return data.imageUrl;
            } catch (err) {
              setToast({ tone: "error", message: err instanceof Error ? err.message : "Edit failed." });
              return "";
            } finally {
              setIsEditingAsset(false);
            }
          }}
          onClose={() => setPreviewAsset(null)}
        >
          <div className="mt-4 w-full rounded-xl border border-white/5 bg-[#111310]/80 p-5 backdrop-blur-md text-[#f4f6ea] max-w-full">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-[#a3b840]">
                  {previewAsset.asset_type === "background" ? "Background Asset" : "Iconography Sheet"}
                </h4>
                <p className="text-xs text-white/40 mt-0.5">Extracted from hero mockup</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewAsset.image_url}
                  download={`project-asset-${previewAsset.id}.png`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#a3b840] px-4 py-2 text-xs font-bold text-[#171a12] transition hover:bg-[#b5cc4a]"
                >
                  <Download size={14} />
                  Download
                </a>
              </div>
            </div>
            <div className="mt-4 border-t border-white/5 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Extraction Prompt</p>
              <p className="mt-2 text-xs font-mono text-white/65 leading-relaxed bg-black/50 p-3 rounded-lg border border-white/5 whitespace-pre-wrap select-all">
                {previewAsset.prompt_used}
              </p>
            </div>
          </div>
        </Lightbox>
      )}

      {mounted && mockupToDelete && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setMockupToDelete(null)}
        >
          <div 
            className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl shadow-black/85 animate-scale-up"
            style={{ backgroundColor: '#121411' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Trash2 className="text-red-400" size={20} />
              Confirm Mockup Deletion
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Are you sure you want to permanently delete this hero mockup blueprint? This action is irreversible and will remove the file from storage and database.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMockupToDelete(null)}
                className="rounded-full bg-white/5 hover:bg-white/10 px-5 py-2.5 text-xs font-bold text-white transition border border-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteMockup(mockupToDelete);
                  setMockupToDelete(null);
                }}
                className="rounded-full bg-red-500 hover:bg-red-600 px-5 py-2.5 text-xs font-bold text-white transition shadow-lg shadow-red-500/10"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
