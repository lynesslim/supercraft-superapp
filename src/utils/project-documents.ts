import { createAdminClient } from "@/utils/supabase/server";

export const PROJECT_DOCUMENTS_BUCKET = "project-briefs";
export const SIGNED_DOCUMENT_URL_TTL_SECONDS = 15 * 60;
export const MAX_LARGE_PDF_BYTES = 60 * 1024 * 1024;
export const MAX_LARGE_PDF_FILES = 4;

export type ProjectDocumentAnalysisStatus = "uploaded" | "processing" | "ready" | "failed";

export type ProjectDocumentRecord = {
  analysis_error?: string | null;
  analysis_status?: ProjectDocumentAnalysisStatus | null;
  analysis_summary?: string | null;
  file_name: string;
  file_size: number | null;
  id?: string;
  mime_type: string | null;
  openai_file_id?: string | null;
  openai_vector_store_id?: string | null;
  storage_path: string;
};

export type ClientProjectDocument = {
  analysisError?: string | null;
  analysisStatus: ProjectDocumentAnalysisStatus;
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

export function sanitizeDocumentFileName(fileName: string) {
  const normalized = fileName.trim() || "project-brief.pdf";
  return normalized.replace(/[^\w.\- ()]+/g, "_").slice(0, 180);
}

export function createProjectDocumentStoragePath({
  fileName,
  projectId,
}: {
  fileName: string;
  projectId: string;
}) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "pdf";
  return `${projectId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export function isPdfMimeType(mimeType: string) {
  return !mimeType || mimeType === "application/pdf";
}

export async function ensureProjectDocumentsBucket() {
  const supabase = createAdminClient();
  const { data: bucket, error: getError } = await supabase.storage.getBucket(
    PROJECT_DOCUMENTS_BUCKET,
  );

  if (bucket?.id) {
    return;
  }

  if (getError && !/not found|does not exist/i.test(getError.message)) {
    throw new Error(getError.message);
  }

  const { error } = await supabase.storage.createBucket(PROJECT_DOCUMENTS_BUCKET, {
    public: false,
  });

  if (error && !/already exists|Duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function createSignedDocumentUrl(storagePath: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PROJECT_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_DOCUMENT_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signed document URL.");
  }

  return data.signedUrl;
}

export async function toClientProjectDocument(
  document: ProjectDocumentRecord,
): Promise<ClientProjectDocument> {
  return {
    analysisError: document.analysis_error ?? null,
    analysisStatus: document.analysis_status ?? "uploaded",
    analysisSummary: document.analysis_summary ?? null,
    fileName: document.file_name,
    fileSize: document.file_size ?? 0,
    id: document.id,
    mimeType: document.mime_type ?? "application/pdf",
    openaiFileId: document.openai_file_id ?? null,
    openaiVectorStoreId: document.openai_vector_store_id ?? null,
    signedUrl: await createSignedDocumentUrl(document.storage_path),
    storagePath: document.storage_path,
  };
}

export async function toClientProjectDocuments(documents: ProjectDocumentRecord[]) {
  return Promise.all(documents.map(toClientProjectDocument));
}
