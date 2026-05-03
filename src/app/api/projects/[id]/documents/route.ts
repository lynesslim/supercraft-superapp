import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type ProjectDocumentRow = {
  analysis_error?: string | null;
  analysis_status?: string | null;
  analysis_summary?: string | null;
  file_name: string;
  file_size: number | null;
  id: string;
  mime_type: string | null;
  openai_file_id?: string | null;
  openai_vector_store_id?: string | null;
  storage_path: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "documents:list", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id: projectId } = await context.params;
  const supabase = createAdminClient();

  const { data: documents, error } = await supabase
    .from("project_documents")
    .select("id,file_name,file_size,mime_type,storage_path,analysis_status,analysis_summary,analysis_error,openai_file_id,openai_vector_store_id")
    .eq("project_id", projectId)
    .eq("analysis_status", "ready")
    .order("file_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clientDocuments = ((documents ?? []) as ProjectDocumentRow[]).map((doc) => ({
    id: doc.id,
    fileName: doc.file_name,
    fileSize: doc.file_size ?? 0,
    mimeType: doc.mime_type ?? "application/pdf",
    storagePath: doc.storage_path,
    analysisStatus: doc.analysis_status ?? "uploaded",
    analysisSummary: doc.analysis_summary ?? null,
    analysisError: doc.analysis_error ?? null,
    openaiFileId: doc.openai_file_id ?? null,
    openaiVectorStoreId: doc.openai_vector_store_id ?? null,
  }));

  return NextResponse.json({ documents: clientDocuments });
}