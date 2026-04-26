import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type ProjectDetails = {
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

type EditableField = keyof ProjectDetails;

type ProjectContext = Partial<ProjectDetails> & {
  __type: "project_context";
};

type ProjectDocumentRow = {
  file_name: string;
  file_size: number | null;
  id: string;
  mime_type: string | null;
  public_url: string;
  storage_path: string;
};

type UploadedProjectDocument = {
  file_name: string;
  file_size: number;
  mime_type: string;
  project_id: string;
  public_url: string;
  storage_path: string;
};

type SaveRequest = {
  details?: Partial<Record<EditableField, unknown>>;
};

type DeleteDocumentRequest = {
  action?: "delete-document" | "delete-project";
  documentId?: unknown;
  storagePath?: unknown;
};

type RefineRequest = {
  action?: "refine";
  details?: Partial<Record<EditableField, unknown>>;
  feedback?: unknown;
  field?: unknown;
};

const EDITABLE_FIELDS: EditableField[] = [
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

const PROJECT_DOCUMENTS_BUCKET = "project-briefs";

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

function isEditableField(value: unknown): value is EditableField {
  return typeof value === "string" && EDITABLE_FIELDS.includes(value as EditableField);
}

function normalizeDetails(details: SaveRequest["details"]): ProjectDetails | null {
  if (!details || typeof details !== "object") return null;

  return EDITABLE_FIELDS.reduce((acc, field) => {
    acc[field] = typeof details[field] === "string" ? details[field].trim() : "";
    return acc;
  }, {} as ProjectDetails);
}

function isSchemaColumnError(error: { message?: string } | null) {
  return Boolean(error?.message && /column .* does not exist|schema cache/i.test(error.message));
}

function isMissingTableError(error: { message?: string } | null) {
  return Boolean(error?.message && /Could not find the table|schema cache|relation .* does not exist/i.test(error.message));
}

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function addOneYearDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function normalizeDateDetails(details: ProjectDetails) {
  if (!details.start_date) {
    details.expiry_date = "";
    return null;
  }

  if (!isValidDateValue(details.start_date)) {
    return "Start date must be a valid date.";
  }

  details.expiry_date = addOneYearDate(details.start_date);
  return null;
}

async function saveFallbackContext({
  details,
  projectId,
}: {
  details: ProjectDetails;
  projectId: string;
}) {
  const supabase = createAdminClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("sitemaps")
    .select("id,brief,nodes")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = existingRows?.find((row) => Array.isArray(row.nodes) && row.nodes.length === 0);

  const context: ProjectContext = {
    ...details,
    __type: "project_context",
  };
  const payload = {
    brief: JSON.stringify(context),
    edges: [],
    nodes: [],
    project_id: projectId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from("sitemaps").update(payload).eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase.from("sitemaps").insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}

function buildDetailsPrompt(details: ProjectDetails) {
  return EDITABLE_FIELDS.map((field) => `${FIELD_LABELS[field]}:\n${details[field] || "Not set"}`).join(
    "\n\n",
  );
}

function buildRefinePrompt({
  details,
  feedback,
  field,
}: {
  details: ProjectDetails;
  feedback: string;
  field: EditableField;
}) {
  return `Target field: ${FIELD_LABELS[field]}

Current field value:
${details[field] || "Not set"}

All project details for context:
${buildDetailsPrompt(details)}

User feedback:
${feedback || "No extra feedback provided."}`;
}

function removeLeadingFieldLabel(value: string, field: EditableField) {
  const label = FIELD_LABELS[field].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`^\\s*(?:${label}|${field})\\s*:\\s*`, "i"), "").trim();
}

function toClientDocument(document: ProjectDocumentRow) {
  return {
    fileName: document.file_name,
    fileSize: document.file_size ?? 0,
    id: document.id,
    mimeType: document.mime_type ?? "application/pdf",
    publicUrl: document.public_url,
    storagePath: document.storage_path,
  };
}

function uploadedDocumentToClient(document: UploadedProjectDocument) {
  return {
    fileName: document.file_name,
    fileSize: document.file_size,
    id: document.storage_path,
    mimeType: document.mime_type,
    publicUrl: document.public_url,
    storagePath: document.storage_path,
  };
}

function parseProjectContext(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as ProjectContext & { documents?: unknown[] };
    return parsed.__type === "project_context" ? parsed : null;
  } catch {
    return null;
  }
}

async function updateFallbackDocuments({
  documents,
  projectId,
  removeStoragePath,
}: {
  documents?: ReturnType<typeof uploadedDocumentToClient>[];
  projectId: string;
  removeStoragePath?: string;
}) {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("sitemaps")
    .select("id,brief,nodes")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  const existing = rows?.find((row) => Array.isArray(row.nodes) && row.nodes.length === 0);
  const context = parseProjectContext(existing?.brief) ?? { __type: "project_context" };
  const existingDocuments = Array.isArray(context.documents) ? context.documents : [];
  const nextDocuments = [
    ...existingDocuments.filter((document) => {
      if (!removeStoragePath || !document || typeof document !== "object") return true;
      const value = document as Record<string, unknown>;
      return value.storagePath !== removeStoragePath && value.storage_path !== removeStoragePath;
    }),
    ...(documents ?? []),
  ];
  const payload = {
    brief: JSON.stringify({
      ...context,
      documents: nextDocuments,
      __type: "project_context",
    }),
    edges: [],
    nodes: [],
    project_id: projectId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("sitemaps")
      .update(payload)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return;
  }

  const { error: insertError } = await supabase.from("sitemaps").insert(payload);

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function extractPdfText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    return parsed.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function ensureProjectDocumentsBucket() {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.createBucket(PROJECT_DOCUMENTS_BUCKET, {
    public: true,
  });

  if (error && !/already exists|Duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }
}

function appendPdfExtracts(currentBrief: string, extracts: string[]) {
  return [currentBrief.trim(), ...extracts].filter(Boolean).join("\n\n").trim();
}

function removePdfExtract(currentBrief: string, fileName: string) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|\\n\\n)PDF brief extract from ${escaped}:\\n[\\s\\S]*?(?=\\n\\nPDF brief extract from |$)`,
    "g",
  );

  return currentBrief.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trim();
}

async function uploadProjectDocuments({
  files,
  projectId,
}: {
  files: File[];
  projectId: string;
}) {
  await ensureProjectDocumentsBucket();

  const supabase = createAdminClient();
  const documents: UploadedProjectDocument[] = [];

  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const storagePath = `${projectId}/${Date.now()}-${index}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(PROJECT_DOCUMENTS_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(PROJECT_DOCUMENTS_BUCKET).getPublicUrl(storagePath);

    documents.push({
      file_name: file.name || `Brief ${index + 1}.pdf`,
      file_size: file.size,
      mime_type: file.type || "application/pdf",
      project_id: projectId,
      public_url: data.publicUrl,
      storage_path: storagePath,
    });
  }

  const { data, error } = await supabase
    .from("project_documents")
    .insert(documents)
    .select("id,file_name,file_size,mime_type,public_url,storage_path");

  if (error) {
    const clientDocuments = documents.map(uploadedDocumentToClient);

    if (isMissingTableError(error)) {
      await updateFallbackDocuments({ documents: clientDocuments, projectId });
      return clientDocuments;
    }

    await supabase.storage
      .from(PROJECT_DOCUMENTS_BUCKET)
      .remove(documents.map((document) => document.storage_path));
    throw new Error(error.message);
  }

  return ((data ?? []) as ProjectDocumentRow[]).map(toClientDocument);
}

async function getSystemPrompt(name: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("system_prompts")
    .select("prompt_text")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.prompt_text?.trim()) {
    throw new Error(`Missing system prompt: ${name}. Add it in Prompt Lab first.`);
  }

  return data.prompt_text.trim();
}

async function handleUploadDocuments(request: Request, projectId: string) {
  const formData = await request.formData();
  const files = formData
    .getAll("pdf")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const pdfExtracts: string[] = [];

  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one PDF to upload." }, { status: 400 });
  }

  for (const file of files) {
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Upload must be a PDF file." }, { status: 400 });
    }

    const text = await extractPdfText(file);
    if (text) {
      pdfExtracts.push(`PDF brief extract from ${file.name || "uploaded brief"}:\n${text}`);
    }
  }

  const supabase = createAdminClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("brief")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json(
      { error: projectError?.message ?? "Project not found." },
      { status: projectError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const documents = await uploadProjectDocuments({ files, projectId });
  const detailsPatch = {
    brief: appendPdfExtracts(String(project.brief ?? ""), pdfExtracts),
    updated_at: new Date().toISOString(),
  };
  const { data: updatedProject, error: updateError } = await supabase
    .from("projects")
    .update(detailsPatch)
    .eq("id", projectId)
    .select("additional_details,brief,expiry_date,industry,staging_base_url,start_date,strategy_sheet,summary,usp")
    .single();

  if (updateError || !updatedProject) {
    return NextResponse.json(
      { error: updateError?.message ?? "Unable to update project brief." },
      { status: 500 },
    );
  }

  return NextResponse.json({ details: normalizeDetails(updatedProject), documents });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await context.params;
  let body: SaveRequest;

  try {
    body = (await request.json()) as SaveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const details = normalizeDetails(body.details);

  if (!details) {
    return NextResponse.json({ error: "Project details are required." }, { status: 400 });
  }

  const dateError = normalizeDateDetails(details);
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const supabase = createAdminClient();
  const payload = {
    ...details,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("projects")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (error && !isSchemaColumnError(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!error && !data?.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (error) {
    try {
      await saveFallbackContext({ details, projectId: id });
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error ? fallbackError.message : "Unable to save project details.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ details, ok: true, storage: error ? "context" : "projects" });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      return await handleUploadDocuments(request, id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to upload project documents.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let body: RefineRequest;

  try {
    body = (await request.json()) as RefineRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const details = normalizeDetails(body.details);
  const field = body.field;

  if (body.action !== "refine") {
    return NextResponse.json({ error: "Unsupported project action." }, { status: 400 });
  }

  if (!details) {
    return NextResponse.json({ error: "Project details are required." }, { status: 400 });
  }

  if (!isEditableField(field)) {
    return NextResponse.json({ error: "A valid editable field is required." }, { status: 400 });
  }

  try {
    const systemPrompt = await getSystemPrompt("project_detail_refiner");
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      prompt: buildRefinePrompt({
        details,
        feedback: typeof body.feedback === "string" ? body.feedback.trim() : "",
        field,
      }),
      temperature: 0.4,
      maxOutputTokens: field === "strategy_sheet" || field === "brief" ? 1400 : 500,
    });

    return NextResponse.json({ field, value: removeLeadingFieldLabel(result.text, field) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refine project detail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: DeleteDocumentRequest;

  try {
    body = (await request.json()) as DeleteDocumentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action === "delete-project") {
    const authError = await requireApiRole(["superadmin"]);
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data: documents, error: documentsError } = await supabase
      .from("project_documents")
      .select("storage_path")
      .eq("project_id", id);

    if (documentsError && !isMissingTableError(documentsError)) {
      return NextResponse.json({ error: documentsError.message }, { status: 500 });
    }

    const storagePaths = ((documents ?? []) as { storage_path?: string | null }[])
      .map((document) => document.storage_path)
      .filter((path): path is string => Boolean(path));

    if (storagePaths.length > 0) {
      await supabase.storage.from(PROJECT_DOCUMENTS_BUCKET).remove(storagePaths);
    }

    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  if (body.action !== "delete-document") {
    return NextResponse.json({ error: "Unsupported project action." }, { status: 400 });
  }

  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";

  if (!documentId && !storagePath) {
    return NextResponse.json({ error: "Document id or storage path is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("project_documents")
    .select("id,file_name,storage_path")
    .eq("project_id", id);

  query = documentId ? query.eq("id", documentId) : query.eq("storage_path", storagePath);

  const { data: document, error: documentError } = await query.single();

  if (documentError || !document) {
    if (isMissingTableError(documentError) && storagePath) {
      const { data: rows, error: rowsError } = await supabase
        .from("sitemaps")
        .select("brief,nodes")
        .eq("project_id", id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (rowsError) {
        return NextResponse.json({ error: rowsError.message }, { status: 500 });
      }

      const contextRow = rows?.find((row) => Array.isArray(row.nodes) && row.nodes.length === 0);
      const context = parseProjectContext(contextRow?.brief);
      const fallbackDocument = (Array.isArray(context?.documents) ? context.documents : []).find(
        (item) => {
          if (!item || typeof item !== "object") return false;
          const value = item as Record<string, unknown>;
          return value.storagePath === storagePath || value.storage_path === storagePath;
        },
      );
      const fileName =
        fallbackDocument && typeof fallbackDocument === "object"
          ? String(
              (fallbackDocument as Record<string, unknown>).fileName ??
                (fallbackDocument as Record<string, unknown>).file_name ??
                "uploaded brief",
            )
          : "uploaded brief";

      await supabase.storage.from(PROJECT_DOCUMENTS_BUCKET).remove([storagePath]);
      await updateFallbackDocuments({ projectId: id, removeStoragePath: storagePath });

      const { data: project } = await supabase.from("projects").select("brief").eq("id", id).single();
      const nextBrief = removePdfExtract(String(project?.brief ?? ""), fileName);
      const { data: updatedProject, error: updateError } = await supabase
        .from("projects")
        .update({ brief: nextBrief, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("additional_details,brief,expiry_date,industry,staging_base_url,start_date,strategy_sheet,summary,usp")
        .single();

      if (updateError || !updatedProject) {
        return NextResponse.json(
          {
            error:
              updateError?.message ?? "Document removed, but project brief could not be updated.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        deletedId: storagePath,
        details: normalizeDetails(updatedProject),
        ok: true,
      });
    }

    return NextResponse.json(
      { error: documentError?.message ?? "Document not found." },
      { status: documentError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const { error: deleteRowError } = await supabase
    .from("project_documents")
    .delete()
    .eq("id", document.id)
    .eq("project_id", id);

  if (deleteRowError) {
    return NextResponse.json({ error: deleteRowError.message }, { status: 500 });
  }

  await supabase.storage.from(PROJECT_DOCUMENTS_BUCKET).remove([document.storage_path]);

  const { data: project } = await supabase.from("projects").select("brief").eq("id", id).single();
  const nextBrief = removePdfExtract(String(project?.brief ?? ""), document.file_name);
  const { data: updatedProject, error: updateError } = await supabase
    .from("projects")
    .update({ brief: nextBrief, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("additional_details,brief,expiry_date,industry,staging_base_url,start_date,strategy_sheet,summary,usp")
    .single();

  if (updateError || !updatedProject) {
    return NextResponse.json(
      { error: updateError?.message ?? "Document removed, but project brief could not be updated." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deletedId: document.id,
    details: normalizeDetails(updatedProject),
    ok: true,
  });
}
