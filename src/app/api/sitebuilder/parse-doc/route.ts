import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import { NextResponse } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "hero",
  "subpage-hero",
  "authority-bar",
  "logo-cloud",
  "about",
  "team",
  "services",
  "features",
  "process",
  "portfolio",
  "case-study",
  "timeline",
  "testimonials",
  "pricing",
  "blog",
  "cta",
  "newsletter",
  "faq",
  "contact",
  "opening-loader",
  "page-breaker",
  "header",
  "footer",
] as const;

const VALID_DESIGN_TAGS = [
  "1-point",
  "2-points",
  "3-points",
  "4-points",
  "6-points",
  "multi",
  "marquee",
  "carousel",
  "bento-grid",
  "split-screen",
  "accordion",
  "tabbed",
  "masonry",
  "sticky",
  "video-background",
  "video-scroll-sequence",
  "opening-animation",
  "loader",
  "mobile",
] as const;

interface SectionItem {
  title: string;
  description: string;
}

interface SectionCopy {
  section_type: string;
  design_tag: string | null;
  heading: string;
  subheading: string | null;
  body_text: string | null;
  cta_label: string | null;
  items: SectionItem[];
}

interface SitemapPageParse {
  page_title: string;
  slug: string;
  parent_slug: string | null;
  sections: SectionCopy[];
}

interface ParsedSitemapDoc {
  sitemap: SitemapPageParse[];
}

const parseDocSchema = jsonSchema<ParsedSitemapDoc>({
  type: "object",
  additionalProperties: false,
  required: ["sitemap"],
  properties: {
    sitemap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page_title", "slug", "parent_slug", "sections"],
        properties: {
          page_title: { type: "string" },
          slug: { type: "string" },
          parent_slug: { anyOf: [{ type: "string" }, { type: "null" }] },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["section_type", "design_tag", "heading", "subheading", "body_text", "cta_label", "items"],
              properties: {
                section_type: {
                  type: "string",
                  enum: [
                    "hero",
                    "subpage-hero",
                    "authority-bar",
                    "logo-cloud",
                    "about",
                    "team",
                    "services",
                    "features",
                    "process",
                    "portfolio",
                    "case-study",
                    "timeline",
                    "testimonials",
                    "pricing",
                    "blog",
                    "cta",
                    "newsletter",
                    "faq",
                    "contact",
                    "opening-loader",
                    "page-breaker",
                    "header",
                    "footer",
                  ],
                },
                design_tag: {
                  anyOf: [
                    {
                      type: "string",
                      enum: [
                        "1-point",
                        "2-points",
                        "3-points",
                        "4-points",
                        "6-points",
                        "multi",
                        "marquee",
                        "carousel",
                        "bento-grid",
                        "split-screen",
                        "accordion",
                        "tabbed",
                        "masonry",
                        "sticky",
                        "video-background",
                        "video-scroll-sequence",
                        "opening-animation",
                        "loader",
                        "mobile",
                      ],
                    },
                    { type: "null" },
                  ],
                },
                heading: { type: "string" },
                subheading: { anyOf: [{ type: "string" }, { type: "null" }] },
                body_text: { anyOf: [{ type: "string" }, { type: "null" }] },
                cta_label: { anyOf: [{ type: "string" }, { type: "null" }] },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "description"],
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

export async function POST(request: Request) {
  let documentText = "";
  let modelOverride = "";
  let promptOverride = "";

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      documentText = (formData.get("document_text") as string) || "";
      modelOverride = (formData.get("model") as string) || "";
      promptOverride = (formData.get("system_prompt") as string) || "";

      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith(".docx")) {
          const mammothParser = mammoth as unknown as {
            convertToMarkdown: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
          };
          const { value } = await mammothParser.convertToMarkdown({ buffer });
          documentText = value;
        } else if (fileName.endsWith(".pdf")) {
          const { PDFParse } = await import("pdf-parse");
          // @ts-expect-error pdf-parse compatibility
          const parser = PDFParse.default || PDFParse;
          const pdfData = await parser(buffer);
          documentText = pdfData.text || "";
        } else {
          documentText = buffer.toString("utf-8");
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `File extraction failed: ${errorMsg}` },
        { status: 400 }
      );
    }
  } else {
    try {
      const body = await request.json();
      documentText = body.document_text || "";
      modelOverride = body.model || "";
      promptOverride = body.system_prompt || "";
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
  }

  if (!documentText || !documentText.trim()) {
    return NextResponse.json(
      { error: "No document text or file could be extracted." },
      { status: 400 }
    );
  }

  const apiKey = process.env.SITEBUILDER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      error: "OpenAI API Key is missing. Please configure OPENAI_API_KEY in .env.local",
    }, { status: 500 });
  }

  const selectedModel = modelOverride || process.env.SITEBUILDER_MODEL || "gpt-5.4-nano-2026-03-17";
  const customOpenAI = createOpenAI({ apiKey });

  const defaultSystemPrompt = `You are an expert website sitemap & copywriting structure parser for Supercraft.
Your task is to analyze the provided copywriting document (Markdown, PDF, or Word) and extract:
1. The exact Sitemap Tree Hierarchy:
   - Root parent pages (e.g. Home, Services, About, Portfolio, Contact). parent_slug MUST be null.
   - Child subpages (e.g. /services/web-design, /about/team). parent_slug MUST be the parent page's slug.
   - Ensure slug contains NO leading or trailing slashes (e.g. "services", "about", "contact", not "/services"). For the home page, slug MUST be "home".
2. Structured Sections for each page:
   - section_type: MUST match one of the exact library categories:
     ["hero", "subpage-hero", "authority-bar", "logo-cloud", "about", "team", "services", "features", "process", "portfolio", "case-study", "timeline", "testimonials", "pricing", "blog", "cta", "newsletter", "faq", "contact", "opening-loader", "page-breaker", "header", "footer"]
     * Use "authority-bar" strictly for numerical stats & milestone metrics ("X+ years", "500+ projects").
     * Use "logo-cloud" for client logos, partner logos, certificates, accreditations (ISO badges), or media mentions.
     * Use "team" for leadership & staff profile cards.
     * Use "testimonials" for customer reviews, client quotes, and ratings.
   - design_tag: Assign the best layout mechanic or point count:
     - "marquee" -> For continuous scrolling tickers (logos, credentials, or text tickers).
     - "carousel" -> For swipeable sliders (testimonials, cards).
     - "accordion" -> For collapsible Q&A / FAQs.
     - "1-point", "2-points", "3-points", "4-points", "6-points" -> Based on discrete item counts.
     - "multi" -> For expandable grids with 5+ items.
   - heading: Section title / headline
   - subheading: Subtitle or section intro (or null if none)
   - body_text: Body paragraph (or null if none)
   - cta_label: Call-to-action button text (or null if none)
   - items: Array of sub-points, cards, features, team members, or FAQ items [{ title, description }]`;

  try {
    const result = await generateObject({
      model: customOpenAI(selectedModel),
      system: promptOverride || defaultSystemPrompt,
      prompt: `Copywriting Document:\n"""\n${documentText}\n"""`,
      schema: parseDocSchema,
      schemaName: "SupercraftParsedSitemap",
      temperature: 0.1,
    });

    return NextResponse.json({
      sitemap: result.object.sitemap || [],
      extracted_text: documentText,
      extracted_text_preview: documentText.slice(0, 500),
      model_used: selectedModel,
      status: "success",
    });
  } catch (error: unknown) {
    const errDetails = error instanceof Error ? error.message : String(error);
    console.error("[sitebuilder/parse-doc] Parsing error:", error);
    return NextResponse.json(
      { error: `LLM Parsing failed with model ${selectedModel}: ${errDetails}` },
      { status: 500 }
    );
  }
}
