import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createSignedDocumentUrl, PROJECT_DOCUMENTS_BUCKET } from "@/utils/project-documents";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type ProjectDocumentRow = {
  analysis_status: string | null;
  file_name: string;
  id: string;
  storage_path: string;
};

type ProjectRow = {
  additional_details: string | null;
  brief: string | null;
  id: string;
  name: string | null;
};

type DocumentAnalysis = {
  brief: string;
  industry: string;
  strategy_sheet: string;
  summary: string;
  usp: string;
};

type PdfExtract = {
  document: ProjectDocumentRow;
  text: string;
};

const MAX_EXTRACT_CHARS_PER_DOCUMENT = 24_000;
const MAX_EXTRACT_CHARS_TOTAL = 72_000;

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["brief", "summary", "industry", "usp", "strategy_sheet"],
  properties: {
    brief: {
      type: "string",
      description:
        "A very detailed comprehensive brief containing all important PDF details needed by sitemap and web copy agents. This must be much more detailed than the summary.",
    },
    summary: {
      type: "string",
      description: "A short 2-3 sentence overview only.",
    },
    industry: { type: "string" },
    usp: { type: "string" },
    strategy_sheet: { type: "string" },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractResponseText(payload: unknown) {
  if (!isRecord(payload)) return "";

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function parseAnalysis(value: unknown): DocumentAnalysis {
  if (!isRecord(value)) {
    throw new Error("OpenAI returned invalid document analysis.");
  }

  const { brief, industry, strategy_sheet, summary, usp } = value;

  if (
    typeof brief !== "string" ||
    typeof industry !== "string" ||
    typeof strategy_sheet !== "string" ||
    typeof summary !== "string" ||
    typeof usp !== "string"
  ) {
    throw new Error("OpenAI returned incomplete document analysis.");
  }

  return { brief, industry, strategy_sheet, summary, usp };
}

function buildAnalysisPrompt({
  documents,
  extracts,
  project,
}: {
  documents: ProjectDocumentRow[];
  extracts: PdfExtract[];
  project: ProjectRow;
}) {
  const extractedText = extracts
    .filter((extract) => extract.text)
    .map(
      (extract) => `--- ${extract.document.file_name} ---
${extract.text}`,
    )
    .join("\n\n");

  return `Analyze these private project brief PDFs together for a website planning workflow.

Project name:
${project.name || "Untitled project"}

Existing brief/details:
${[project.brief, project.additional_details].filter(Boolean).join("\n\n") || "No existing brief text."}

Documents:
${documents.map((document) => `- ${document.file_name}`).join("\n")}

Extracted PDF text:
${extractedText || "No text could be extracted locally. Use attached PDF files if provided."}

Return one useful consolidated project strategy. Synthesize across all documents and existing brief. Use only information supported by the documents and existing brief.

For the brief field, follow the saved system prompt's Brief instruction exactly: return a very detailed comprehensive brief about the business, capturing all relevant information that the sitemap and web copy agents would need because they will not refer to the PDFs later. Include concrete client specifics such as business background, founders, timeline, branches/locations, services, audience, positioning, goals, constraints, brand notes, required messaging, website/content requirements, trust signals, and conversion needs when present. Use organized paragraphs or concise sectioned notes. Do not return a short paragraph. Do not return the summary as the brief.

For the summary field, return only a short 2-3 sentence overview.`;
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

function withDocumentBriefInstruction(systemPrompt: string) {
  return `${systemPrompt}

For PDF document analysis, the structured output must include brief as the full consolidated project brief from the uploaded PDFs. The brief field must be very detailed and comprehensive enough for sitemap and web copy agents to work without opening the PDFs. It must not be a short overview and must not duplicate the summary field. Preserve concrete details from the PDFs.`;
}

function truncateExtracts(extracts: PdfExtract[]) {
  let remaining = MAX_EXTRACT_CHARS_TOTAL;

  return extracts.map((extract) => {
    if (!extract.text || remaining <= 0) {
      return { ...extract, text: "" };
    }

    const limit = Math.min(MAX_EXTRACT_CHARS_PER_DOCUMENT, remaining);
    const text =
      extract.text.length > limit
        ? `${extract.text.slice(0, limit).trim()}\n\n[Extract truncated for analysis speed.]`
        : extract.text;

    remaining -= text.length;
    return { ...extract, text };
  });
}

async function extractPdfTextFromStorage(document: ProjectDocumentRow) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PROJECT_DOCUMENTS_BUCKET)
    .download(document.storage_path);

  if (error || !data) {
    throw new Error(error?.message ?? `Unable to download ${document.file_name}.`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    return parsed.text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await parser.destroy();
  }
}

async function extractPdfTexts(documents: ProjectDocumentRow[]) {
  const extracts = await Promise.all(
    documents.map(async (document) => {
      try {
        return {
          document,
          text: await extractPdfTextFromStorage(document),
        };
      } catch (error) {
        logServerError("project.document.text_extract.failed", error, {
          documentId: document.id,
        });
        return { document, text: "" };
      }
    }),
  );

  return truncateExtracts(extracts);
}

async function analyzeDocumentsWithOpenAI({
  documents,
  project,
  systemPrompt,
}: {
  documents: ProjectDocumentRow[];
  project: ProjectRow;
  systemPrompt: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const extracts = await extractPdfTexts(documents);
  const documentsNeedingFileInput = extracts
    .filter((extract) => !extract.text)
    .map((extract) => extract.document);
  const signedUrls = await Promise.all(
    documentsNeedingFileInput.map((document) => createSignedDocumentUrl(document.storage_path)),
  );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instructions: withDocumentBriefInstruction(systemPrompt),
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: buildAnalysisPrompt({ documents, extracts, project }) },
            ...signedUrls.map((signedUrl) => ({ type: "input_file", file_url: signedUrl })),
          ],
        },
      ],
      max_output_tokens: 4000,
      model: process.env.OPENAI_DOCUMENT_MODEL ?? process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4o-mini",
      temperature: 0.25,
      text: {
        format: {
          type: "json_schema",
          name: "ProjectDocumentAnalysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : "OpenAI document analysis failed.";
    throw new Error(message);
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned no document analysis text.");
  }

  return parseAnalysis(JSON.parse(text));
}

function combineBrief(currentBrief: string, analysis: DocumentAnalysis) {
  const marker = "AI document brief from uploaded PDFs:";
  const stripped = currentBrief
    .replace(
      new RegExp(
        `(?:^|\\n\\n)AI document (?:summary|brief) from uploaded PDFs:\\n[\\s\\S]*?(?=\\n\\nAI document (?:summary|brief) from uploaded PDFs:|$)`,
        "g",
      ),
      "",
    )
    .replace(/(?:^|\n\n)PDF brief uploaded\. AI document analysis is pending\./g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return [stripped, `${marker}\n${analysis.brief}`].filter(Boolean).join("\n\n").trim();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "documents:analyze", {
    limit: 12,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { id: projectId } = await context.params;
  const reanalyze = new URL(request.url).searchParams.get("reanalyze") === "true";
  const supabase = createAdminClient();

  try {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,name,brief,additional_details")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: projectError?.message ?? "Project not found." },
        { status: projectError?.code === "PGRST116" ? 404 : 500 },
      );
    }

    let documentsQuery = supabase
      .from("project_documents")
      .select("id,file_name,storage_path,analysis_status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!reanalyze) {
      documentsQuery = documentsQuery.in("analysis_status", ["uploaded", "failed"]);
    }

    const { data: documents, error: documentsError } = await documentsQuery;

    if (documentsError) {
      throw new Error(documentsError.message);
    }

    const pendingDocuments = (documents ?? []) as ProjectDocumentRow[];

    if (pendingDocuments.length === 0) {
      return NextResponse.json({ message: "No uploaded documents are waiting for analysis." });
    }

    const pendingDocumentIds = pendingDocuments.map((document) => document.id);

    await supabase
      .from("project_documents")
      .update({
        analysis_error: null,
        analysis_status: "processing",
      })
      .eq("project_id", projectId)
      .in("id", pendingDocumentIds);

    try {
      const analysis = await analyzeDocumentsWithOpenAI({
        documents: pendingDocuments,
        project: project as ProjectRow,
        systemPrompt: await getSystemPrompt("project_strategy_generator"),
      });
      const nextBrief = combineBrief(String(project.brief ?? ""), analysis);

      await supabase
        .from("project_documents")
        .update({
          analysis_error: null,
          analysis_status: "ready",
          analysis_summary: analysis.summary,
          analyzed_at: new Date().toISOString(),
        })
        .eq("project_id", projectId)
        .in("id", pendingDocumentIds);

      const { data: updatedProject, error: updateError } = await supabase
        .from("projects")
        .update({
          brief: nextBrief,
          industry: analysis.industry,
          strategy_sheet: analysis.strategy_sheet,
          summary: analysis.summary,
          updated_at: new Date().toISOString(),
          usp: analysis.usp,
        })
        .eq("id", projectId)
        .select("additional_details,brief,expiry_date,industry,staging_base_url,start_date,strategy_sheet,summary,usp")
        .single();

      if (updateError || !updatedProject) {
        throw new Error(updateError?.message ?? "Unable to update project from document analysis.");
      }

      return NextResponse.json({
        analysis,
        details: updatedProject,
        documentIds: pendingDocumentIds,
        status: "ready",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Document uploaded, AI analysis unavailable.";

      await supabase
        .from("project_documents")
        .update({
          analysis_error: message,
          analysis_status: "failed",
          analyzed_at: new Date().toISOString(),
        })
        .eq("project_id", projectId)
        .in("id", pendingDocumentIds);

      logServerError("project.document.analysis.failed", error, {
        documentIds: pendingDocumentIds.join(","),
        projectId,
      });

      return NextResponse.json(
        {
          documentIds: pendingDocumentIds,
          error: "Document uploaded, AI analysis unavailable.",
          status: "failed",
        },
        { status: 503 },
      );
    }
  } catch (error) {
    logServerError("project.documents.analyze.failed", error, { projectId });
    return NextResponse.json({ error: "Unable to analyze project document." }, { status: 500 });
  }
}
