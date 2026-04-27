import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import {
  createProjectDocumentStoragePath,
  ensureProjectDocumentsBucket,
  isPdfMimeType,
  MAX_LARGE_PDF_BYTES,
  PROJECT_DOCUMENTS_BUCKET,
  sanitizeDocumentFileName,
} from "@/utils/project-documents";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";
import { validateJsonPayloadSize } from "@/utils/validation";

export const runtime = "nodejs";

type UploadUrlRequest = {
  fileName?: unknown;
  fileSize?: unknown;
  mimeType?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "documents:upload-url", {
    limit: 40,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { id: projectId } = await context.params;
  let body: UploadUrlRequest;

  try {
    body = (await request.json()) as UploadUrlRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payloadSizeError = validateJsonPayloadSize(body, "Document upload request");
  if (payloadSizeError) return payloadSizeError;

  const fileName = sanitizeDocumentFileName(String(body.fileName ?? ""));
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : Number(body.fileSize);
  const mimeType = String(body.mimeType ?? "application/pdf");

  if (!fileName.toLowerCase().endsWith(".pdf") || !isPdfMimeType(mimeType)) {
    return NextResponse.json({ error: "Upload must be a PDF file." }, { status: 400 });
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "PDF file size is required." }, { status: 400 });
  }

  if (fileSize > MAX_LARGE_PDF_BYTES) {
    return NextResponse.json(
      { error: `PDF files must be ${Math.floor(MAX_LARGE_PDF_BYTES / 1024 / 1024)}MB or smaller.` },
      { status: 413 },
    );
  }

  try {
    await ensureProjectDocumentsBucket();
    const supabase = createAdminClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: projectError?.message ?? "Project not found." },
        { status: projectError?.code === "PGRST116" ? 404 : 500 },
      );
    }

    const storagePath = createProjectDocumentStoragePath({ fileName, projectId });
    const { data: signedUpload, error: signedUploadError } = await supabase.storage
      .from(PROJECT_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedUploadError || !signedUpload?.token) {
      throw new Error(signedUploadError?.message ?? "Unable to create signed upload URL.");
    }

    const { data: document, error: insertError } = await supabase
      .from("project_documents")
      .insert({
        analysis_status: "uploaded",
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType || "application/pdf",
        project_id: projectId,
        public_url: "",
        storage_path: storagePath,
      })
      .select(
        "id,file_name,file_size,mime_type,storage_path,analysis_status,analysis_summary,analysis_error,openai_file_id,openai_vector_store_id",
      )
      .single();

    if (insertError || !document) {
      throw new Error(insertError?.message ?? "Unable to save project document.");
    }

    return NextResponse.json({
      document: {
        analysisError: document.analysis_error ?? null,
        analysisStatus: document.analysis_status ?? "uploaded",
        analysisSummary: document.analysis_summary ?? null,
        fileName: document.file_name,
        fileSize: document.file_size ?? 0,
        id: document.id,
        mimeType: document.mime_type ?? "application/pdf",
        openaiFileId: document.openai_file_id ?? null,
        openaiVectorStoreId: document.openai_vector_store_id ?? null,
        signedUrl: "",
        storagePath: document.storage_path,
      },
      path: signedUpload.path,
      token: signedUpload.token,
    });
  } catch (error) {
    logServerError("project.document.upload-url.failed", error, { projectId });
    const detail = error instanceof Error ? error.message : "Unknown upload preparation error.";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Unable to prepare PDF upload."
            : `Unable to prepare PDF upload: ${detail}`,
      },
      { status: 500 },
    );
  }
}
