import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import {
  createSignedDocumentUrl,
  ensureProjectDocumentsBucket,
  isPdfMimeType,
  MAX_LARGE_PDF_BYTES,
  MAX_LARGE_PDF_FILES,
  PROJECT_DOCUMENTS_BUCKET,
  sanitizeDocumentFileName,
} from "@/utils/project-documents";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";
import { validateTextLength } from "@/utils/validation";

export const runtime = "nodejs";
const MAX_PLAYGROUND_TOTAL_PDF_BYTES = 90 * 1024 * 1024;

function createPlaygroundTempStoragePath(fileName: string, index: number) {
  const safeFileName = sanitizeDocumentFileName(fileName);
  const extension = safeFileName.split(".").pop()?.toLowerCase() || "pdf";
  return `playground-temp/${Date.now()}-${index}-${crypto.randomUUID()}.${extension}`;
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logServerError("playground.generate.parsing", err, {
      contentType: request.headers.get("content-type"),
    });
    return NextResponse.json({ error: errMsg || "Invalid form data" }, { status: 400 });
  }

  const limited = rateLimitByRequest(request, "admin:generate", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const system = formData.get("system")?.toString().trim() ?? "";
  const prompt = formData.get("prompt")?.toString().trim() ?? "";
  const temperature = parseFloat(formData.get("temperature")?.toString() ?? "0.4");
  const model = formData.get("model")?.toString() ?? process.env.OPENAI_DOCUMENT_MODEL ?? process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4o-mini";

  if (!system || !prompt) {
    return NextResponse.json({ error: "Both `system` and `prompt` are required." }, { status: 400 });
  }

  const promptError = validateTextLength(prompt, "Prompt");
  if (promptError) return promptError;
  const systemError = validateTextLength(system, "System prompt");
  if (systemError) return systemError;

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_LARGE_PDF_FILES) {
    return NextResponse.json(
      { error: `Upload up to ${MAX_LARGE_PDF_FILES} PDF files at a time.` },
      { status: 400 },
    );
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_PLAYGROUND_TOTAL_PDF_BYTES) {
    return NextResponse.json(
      {
        error: `Upload up to ${Math.floor(MAX_PLAYGROUND_TOTAL_PDF_BYTES / 1024 / 1024)}MB of PDFs at a time.`,
      },
      { status: 413 },
    );
  }

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf") || !isPdfMimeType(file.type || "application/pdf")) {
      return NextResponse.json({ error: "Upload must be a PDF file." }, { status: 400 });
    }

    if (file.size > MAX_LARGE_PDF_BYTES) {
      return NextResponse.json(
        { error: `PDF files must be ${Math.floor(MAX_LARGE_PDF_BYTES / 1024 / 1024)}MB or smaller.` },
        { status: 413 },
      );
    }
  }

  const uploadedPaths: string[] = [];
  let routeError: Error | null = null;
  let routeStatus = 500;
  let outputText = "";

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 });
    }
    const supabase = createAdminClient();
    await ensureProjectDocumentsBucket();

    const content: Array<{ type: string; [key: string]: unknown }> = [
      { type: "input_text", text: prompt },
    ];

    for (const [index, file] of files.entries()) {
      const storagePath = createPlaygroundTempStoragePath(file.name, index);
      const { error: uploadError } = await supabase.storage
        .from(PROJECT_DOCUMENTS_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Unable to upload temporary PDF for testing: ${uploadError.message}`);
      }

      uploadedPaths.push(storagePath);
      const signedUrl = await createSignedDocumentUrl(storagePath);
      content.push({ type: "input_file", file_url: signedUrl });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [{ role: "user", content }],
        instructions: system,
        model,
        temperature: isNaN(temperature) ? 0.4 : temperature,
        max_output_tokens: 1600,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as {
        error?: { message?: string; code?: string; type?: string };
      };
      const apiError = errorBody.error?.message ?? `OpenAI API error: ${response.status}`;
      logServerError("playground.generate.failed", new Error(apiError), { status: response.status });
      routeStatus = response.status;
      throw new Error(apiError);
    }

    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };

    let text = payload.output_text ?? "";
    if (!text && Array.isArray(payload.output)) {
      for (const item of payload.output) {
        if (Array.isArray(item.content)) {
          for (const c of item.content) {
            if (typeof c.text === "string" && c.text) {
              text = c.text;
              break;
            }
          }
        }
        if (text) break;
      }
    }

    outputText = text || "No response text returned.";
  } catch (error) {
    routeError = error instanceof Error ? error : new Error("Unable to generate AI output.");
    logServerError("playground.generate.failed", routeError);
  } finally {
    if (uploadedPaths.length > 0) {
      const supabase = createAdminClient();
      const { error: cleanupError } = await supabase.storage
        .from(PROJECT_DOCUMENTS_BUCKET)
        .remove(uploadedPaths);

      if (cleanupError) {
        const error = new Error(`Unable to clean up temporary playground PDF uploads: ${cleanupError.message}`);
        logServerError("playground.generate.cleanup_failed", error, {
          uploadedPaths: uploadedPaths.length,
        });
        if (!routeError) {
          routeError = error;
        }
      }
    }
  }

  if (routeError) {
    return NextResponse.json({ error: routeError.message }, { status: routeStatus });
  }

  return NextResponse.json({ text: outputText });
}
