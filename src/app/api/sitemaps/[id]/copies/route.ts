import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createClient } from "@/utils/supabase/server";
import type { SitemapNodeData } from "@/types/sitemap";

export const runtime = "nodejs";

type SitemapNode = {
  id: string;
  data: SitemapNodeData;
};

type RefineMode =
  | "regenerate"
  | "regenerate-selection"
  | "paraphrase"
  | "shorten"
  | "expand"
  | "change-tone"
  | "bullet-points";

type CopyActionRequest = {
  action?: "generate" | "save" | "refine";
  page?: {
    title?: string;
    path?: string;
  };
  pageId?: string;
  content?: string;
  currentContent?: string;
  feedback?: string;
  mode?: RefineMode;
  selectedText?: string;
};

function isSitemapNode(value: unknown): value is SitemapNode {
  if (!value || typeof value !== "object") {
    return false;
  }

  const node = value as { id?: unknown; data?: Partial<SitemapNodeData> };

  return (
    typeof node.id === "string" &&
    typeof node.data?.title === "string" &&
    typeof node.data?.path === "string"
  );
}

async function saveCopy({
  content,
  page,
  sitemapId,
  supabase,
}: {
  content: string;
  page: Pick<SitemapNodeData, "title" | "path">;
  sitemapId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const timestamp = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("page_copies")
    .select("id")
    .eq("sitemap_id", sitemapId)
    .eq("url_path", page.path)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const payload = {
    sitemap_id: sitemapId,
    page_name: page.title,
    url_path: page.path,
    content,
    updated_at: timestamp,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("page_copies")
      .update(payload)
      .eq("id", existing.id)
      .select("id,page_name,url_path,content,updated_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("page_copies")
    .insert(payload)
    .select("id,page_name,url_path,content,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function buildPagePrompt({
  brief,
  page,
}: {
  brief: string;
  page: SitemapNode;
}) {
  return `Project context:
${brief || "No project brief was saved for this sitemap."}

Page context:
- Title: ${page.data.title}
- Path: ${page.data.path}
- Sections: ${(page.data.sections ?? []).join(", ") || "Not specified"}`;
}

function buildRefinePrompt({
  currentContent,
  feedback,
  mode,
  page,
  selectedText,
}: {
  currentContent: string;
  feedback?: string;
  mode: RefineMode;
  page: SitemapNode;
  selectedText?: string;
}) {
  return `Page:
- Title: ${page.data.title}
- Path: ${page.data.path}
- Sections: ${(page.data.sections ?? []).join(", ") || "Not specified"}

Refinement mode:
${mode}

Feedback:
${feedback?.trim() || "No extra feedback provided."}

Current full page copy:
${currentContent || "No current copy exists."}

Selected excerpt:
${selectedText || "No selected excerpt."}`;
}

function removeUnrequestedLeadingHeading({
  content,
  selectedText,
}: {
  content: string;
  selectedText?: string;
}) {
  const selectionStartsWithHeading = /^#{1,6}\s+\S/.test(selectedText?.trimStart() ?? "");

  if (selectionStartsWithHeading) {
    return content;
  }

  return content.replace(/^\s*#{1,6}\s+[^\n]+(?:\n{1,2})?/, "").trimStart();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await context.params;
  let body: CopyActionRequest;

  try {
    body = (await request.json()) as CopyActionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = await createClient();

  if (body.action === "save") {
    const title = body.page?.title?.trim();
    const path = body.page?.path?.trim();
    const content = body.content?.trim() ?? "";

    if (!title || !path) {
      return NextResponse.json(
        { error: "Page title and path are required." },
        { status: 400 },
      );
    }

    try {
      const copy = await saveCopy({
        content,
        page: { title, path },
        sitemapId: id,
        supabase,
      });

      return NextResponse.json({ copy });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save copy.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { data: sitemap, error: sitemapError } = await supabase
    .from("sitemaps")
    .select("brief,nodes")
    .eq("id", id)
    .single();

  if (sitemapError || !sitemap) {
    return NextResponse.json(
      { error: sitemapError?.message ?? "Sitemap not found." },
      { status: sitemapError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const nodes = Array.isArray(sitemap.nodes)
    ? sitemap.nodes.filter(isSitemapNode)
    : [];
  const selectedNodes = body.pageId
    ? nodes.filter((node) => node.id === body.pageId)
    : nodes;

  if (selectedNodes.length === 0) {
    return NextResponse.json(
      { error: "No matching sitemap page nodes were found." },
      { status: 400 },
    );
  }

  const { data: prompt, error: promptError } = await supabase
    .from("system_prompts")
    .select("prompt_text")
    .eq("name", body.action === "refine" ? "webcopy_refinement" : "webcopy_generator")
    .single();

  if (promptError || !prompt?.prompt_text) {
    return NextResponse.json(
      {
        error:
          promptError?.message ??
          `Missing ${
            body.action === "refine" ? "webcopy_refinement" : "webcopy_generator"
          } system prompt.`,
      },
      { status: 500 },
    );
  }

  try {
    if (body.action === "refine") {
      const page = selectedNodes[0];
      const mode = body.mode ?? "regenerate";
      const needsSelection = mode !== "regenerate";

      if (!page) {
        return NextResponse.json({ error: "Select a page before refining copy." }, { status: 400 });
      }

      if (needsSelection && !body.selectedText?.trim()) {
        return NextResponse.json(
          { error: "Selected text is required for this refinement." },
          { status: 400 },
        );
      }

      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: prompt.prompt_text,
        prompt: buildRefinePrompt({
          currentContent: body.currentContent ?? "",
          feedback: body.feedback,
          mode,
          page,
          selectedText: body.selectedText,
        }),
        temperature: 0.4,
        maxOutputTokens: mode === "regenerate" ? 2200 : 700,
      });

      const content =
        mode === "regenerate"
          ? result.text.trim()
          : removeUnrequestedLeadingHeading({
              content: result.text.trim(),
              selectedText: body.selectedText,
            });

      return NextResponse.json({ content });
    }

    const copies = [];

    for (const page of selectedNodes) {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: prompt.prompt_text,
        prompt: buildPagePrompt({
          brief: sitemap.brief ?? "",
          page,
        }),
        temperature: 0.45,
        maxOutputTokens: 2200,
      });

      const copy = await saveCopy({
        content: result.text,
        page: {
          title: page.data.title,
          path: page.data.path,
        },
        sitemapId: id,
        supabase,
      });

      copies.push({ ...copy, page_id: page.id });
    }

    return NextResponse.json({ copies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate webcopy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
