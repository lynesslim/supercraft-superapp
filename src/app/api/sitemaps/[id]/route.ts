import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createClient } from "@/utils/supabase/server";

type SaveSitemapRequest = {
  brief?: unknown;
  edges?: unknown;
  nodes?: unknown;
};

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

function removePurposeFromNode(node: unknown) {
  if (!node || typeof node !== "object") return node;

  const candidate = node as {
    data?: Record<string, unknown>;
  };

  if (!candidate.data || typeof candidate.data !== "object") return node;

  const { purpose: _purpose, ...data } = candidate.data;
  void _purpose;

  return { ...candidate, data };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
    }

    const brief = String(formData.get("brief") ?? "").trim();
    const pdf = formData.get("pdf");
    let pdfText = "";

    if (pdf instanceof File && pdf.size > 0) {
      if (pdf.type !== "application/pdf") {
        return NextResponse.json({ error: "Upload must be a PDF file." }, { status: 400 });
      }

      try {
        pdfText = await extractPdfText(pdf);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to parse PDF brief.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const combinedBrief = [brief, pdfText && `PDF brief extract:\n${pdfText}`]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const supabase = await createClient();
    const { error } = await supabase
      .from("sitemaps")
      .update({
        brief: combinedBrief,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brief: combinedBrief, ok: true });
  }

  let body: SaveSitemapRequest;

  try {
    body = (await request.json()) as SaveSitemapRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json(
      { error: "Both nodes and edges arrays are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const updatePayload: {
    brief?: string;
    edges: unknown[];
    nodes: unknown[];
    updated_at: string;
  } = {
    nodes: body.nodes.map(removePurposeFromNode),
    edges: body.edges,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.brief === "string") {
    updatePayload.brief = body.brief;
  }

  const { error } = await supabase
    .from("sitemaps")
    .update(updatePayload)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
