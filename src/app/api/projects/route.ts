import { openai } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import type { JSONSchema7 } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type ProjectStrategy = {
  industry: string;
  summary: string;
  usp: string;
  strategy_sheet: string;
};

const strategyJsonSchema: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["industry", "summary", "usp", "strategy_sheet"],
  properties: {
    industry: { type: "string" },
    summary: { type: "string" },
    usp: { type: "string" },
    strategy_sheet: { type: "string" },
  },
};

const strategySchema = jsonSchema<ProjectStrategy>(strategyJsonSchema);

const PROJECT_DOCUMENTS_BUCKET = "project-briefs";

type ProjectDocument = {
  file_name: string;
  file_size: number;
  mime_type: string;
  public_url: string;
  storage_path: string;
};

function buildStrategyPrompt({
  additionalDetails,
  brief,
  name,
  urls,
}: {
  additionalDetails: string;
  brief: string;
  name: string;
  urls?: string[];
}) {
  const urlInstruction = urls?.length
    ? `

Supplied URLs detected in additional details:
${urls.map((url) => `- ${url}`).join("\n")}
`
    : "";

  return `Project name:
${name}

Client brief:
${brief || "No formal brief provided."}

Additional details:
${additionalDetails || "No additional details provided."}${urlInstruction}`;
}

function extractUrls(value: string) {
  const matches = value.match(/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi) ?? [];
  const urls = new Set<string>();

  for (const match of matches) {
    const trimmed = match.replace(/[),.;:!?]+$/g, "");
    const withProtocol = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;

    try {
      const url = new URL(withProtocol);

      if (url.protocol === "http:" || url.protocol === "https:") {
        urls.add(url.toString());
      }
    } catch {
      // Ignore malformed URL-like text.
    }
  }

  return [...urls];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseProjectStrategy(value: unknown): ProjectStrategy {
  if (!isRecord(value)) {
    throw new Error("OpenAI returned an invalid strategy payload.");
  }

  const { industry, summary, usp, strategy_sheet } = value;

  if (
    typeof industry !== "string" ||
    typeof summary !== "string" ||
    typeof usp !== "string" ||
    typeof strategy_sheet !== "string"
  ) {
    throw new Error("OpenAI returned an incomplete strategy payload.");
  }

  return { industry, summary, usp, strategy_sheet };
}

function extractResponseText(payload: unknown) {
  if (!isRecord(payload)) {
    return "";
  }

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project"
  );
}

function createFeedbackPasscode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function addOneYearDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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

async function generateProjectStrategyWithAiSdk({
  additionalDetails,
  brief,
  name,
  systemPrompt,
}: {
  additionalDetails: string;
  brief: string;
  name: string;
  systemPrompt: string;
}) {
  const result = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: strategySchema,
    schemaName: "ProjectStrategy",
    system: systemPrompt,
    prompt: buildStrategyPrompt({ additionalDetails, brief, name }),
    temperature: 0.35,
  });

  return result.object;
}

async function generateProjectStrategyWithWebSearch({
  additionalDetails,
  brief,
  name,
  systemPrompt,
  urls,
}: {
  additionalDetails: string;
  brief: string;
  name: string;
  systemPrompt: string;
  urls: string[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate strategy from website links.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4o-mini",
      instructions: systemPrompt,
      input: buildStrategyPrompt({ additionalDetails, brief, name, urls }),
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      text: {
        format: {
          type: "json_schema",
          name: "ProjectStrategy",
          strict: true,
          schema: strategyJsonSchema,
        },
      },
      temperature: 0.35,
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : "OpenAI Responses API request failed.";
    throw new Error(message);
  }

  const text = extractResponseText(payload);

  if (!text) {
    throw new Error("OpenAI Responses API returned no strategy text.");
  }

  return parseProjectStrategy(JSON.parse(text));
}

async function generateProjectStrategy({
  additionalDetails,
  brief,
  name,
  systemPrompt,
}: {
  additionalDetails: string;
  brief: string;
  name: string;
  systemPrompt: string;
}) {
  const urls = extractUrls(additionalDetails);

  if (urls.length > 0) {
    return generateProjectStrategyWithWebSearch({
      additionalDetails,
      brief,
      name,
      systemPrompt,
      urls,
    });
  }

  return generateProjectStrategyWithAiSdk({
    additionalDetails,
    brief,
    name,
    systemPrompt,
  });
}

async function insertProject({
  additionalDetails,
  brief,
  name,
  stagingBaseUrl,
  startDate,
  strategy,
}: {
  additionalDetails: string;
  brief: string;
  name: string;
  stagingBaseUrl: string;
  startDate: string;
  strategy: ProjectStrategy;
}) {
  const supabase = createAdminClient();
  const basePayload = {
    embed_public_key: crypto.randomUUID(),
    feedback_passcode: createFeedbackPasscode(),
    name,
    slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`,
    start_date: startDate,
    staging_base_url: stagingBaseUrl || "https://staging.example.com",
    expiry_date: addOneYearDate(startDate),
  };
  const strategyPayload = {
    additional_details: additionalDetails,
    brief,
    industry: strategy.industry,
    summary: strategy.summary,
    strategy_sheet: strategy.strategy_sheet,
    updated_at: new Date().toISOString(),
    usp: strategy.usp,
  };

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...basePayload, ...strategyPayload })
    .select("id")
    .single();

  if (!error && data?.id) {
    return { projectId: data.id as string, usedFallbackContext: false, strategyPayload };
  }

  if (!error || !/column .* does not exist|schema cache/i.test(error.message)) {
    throw new Error(error?.message ?? "Unable to create project.");
  }

  const fallback = await supabase.from("projects").insert(basePayload).select("id").single();

  if (fallback.error || !fallback.data?.id) {
    throw new Error(fallback.error?.message ?? "Unable to create project.");
  }

  await supabase.from("sitemaps").insert({
    brief: JSON.stringify({
      ...strategyPayload,
      __type: "project_context",
    }),
    edges: [],
    nodes: [],
    project_id: fallback.data.id,
    updated_at: new Date().toISOString(),
  });

  return { projectId: fallback.data.id as string, usedFallbackContext: true, strategyPayload };
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

async function uploadProjectDocuments({
  files,
  projectId,
}: {
  files: File[];
  projectId: string;
}) {
  if (files.length === 0) return [];

  await ensureProjectDocumentsBucket();

  const supabase = createAdminClient();
  const documents: ProjectDocument[] = [];

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
      public_url: data.publicUrl,
      storage_path: storagePath,
    });
  }

  return documents;
}

async function saveProjectDocuments({
  documents,
  projectId,
  strategyPayload,
}: {
  documents: ProjectDocument[];
  projectId: string;
  strategyPayload: Record<string, string>;
}) {
  if (documents.length === 0) return;

  const supabase = createAdminClient();
  const rows = documents.map((document) => ({
    ...document,
    project_id: projectId,
  }));
  const { error } = await supabase.from("project_documents").insert(rows);

  if (!error) return;

  if (!/Could not find the table|schema cache|relation .* does not exist/i.test(error.message)) {
    throw new Error(error.message);
  }

  await supabase.from("sitemaps").insert({
    brief: JSON.stringify({
      ...strategyPayload,
      __type: "project_context",
      documents,
    }),
    edges: [],
    nodes: [],
    project_id: projectId,
    updated_at: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const name = String(formData.get("name") ?? "").trim();
  const briefText = String(formData.get("brief") ?? "").trim();
  const additionalDetails = String(formData.get("additional_details") ?? "").trim();
  const stagingBaseUrl = String(formData.get("staging_base_url") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim() || todayDate();
  const pdfs = formData
    .getAll("pdf")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const pdfExtracts: string[] = [];

  if (!name) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  if (!isValidDateValue(startDate)) {
    return NextResponse.json({ error: "Start date must be a valid date." }, { status: 400 });
  }

  for (const pdf of pdfs) {
    if (pdf.type && pdf.type !== "application/pdf") {
      return NextResponse.json({ error: "Upload must be a PDF file." }, { status: 400 });
    }

    try {
      const text = await extractPdfText(pdf);
      if (text) {
        pdfExtracts.push(`PDF brief extract from ${pdf.name || "uploaded brief"}:\n${text}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse PDF brief.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const brief = [briefText, ...pdfExtracts]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!brief && !additionalDetails) {
    return NextResponse.json(
      { error: "Add brief text, additional details, or upload a PDF." },
      { status: 400 },
    );
  }

  try {
    const systemPrompt = await getSystemPrompt("project_strategy_generator");
    const strategy = await generateProjectStrategy({
      additionalDetails,
      brief,
      name,
      systemPrompt,
    });
    const project = await insertProject({
      additionalDetails,
      brief,
      name,
      stagingBaseUrl,
      startDate,
      strategy,
    });
    const documents = await uploadProjectDocuments({
      files: pdfs,
      projectId: project.projectId,
    });
    await saveProjectDocuments({
      documents,
      projectId: project.projectId,
      strategyPayload: project.strategyPayload,
    });

    if (request.headers.get("accept")?.includes("text/html")) {
      return NextResponse.redirect(new URL(`/projects/${project.projectId}`, request.url), 303);
    }

    return NextResponse.json({ ...project, documents, strategy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create project.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
