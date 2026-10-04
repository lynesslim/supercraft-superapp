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

export interface SectionItem {
  title: string;
  description: string;
}

export interface SectionCopy {
  section_type: string;
  design_tag: string | null;
  heading: string;
  subheading: string | null;
  body_text: string | null;
  cta_label: string | null;
  items: SectionItem[];
}

export interface SitemapPageParse {
  page_title: string;
  slug: string;
  parent_slug: string | null;
  sections: SectionCopy[];
}

export interface BusinessService {
  title: string;
  description: string;
}

export interface BusinessContext {
  business_name: string;
  summary: string;
  services: BusinessService[];
  target_audience: string;
  brand_voice: string;
}

export interface ContextOnlyDoc {
  business_context: BusinessContext;
}

export interface FullParsedDoc {
  business_context: BusinessContext;
  sitemap: SitemapPageParse[];
}

const contextOnlySchema = jsonSchema<ContextOnlyDoc>({
  type: "object",
  additionalProperties: false,
  required: ["business_context"],
  properties: {
    business_context: {
      type: "object",
      additionalProperties: false,
      required: ["business_name", "summary", "services", "target_audience", "brand_voice"],
      properties: {
        business_name: { type: "string" },
        summary: { type: "string" },
        services: {
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
        target_audience: { type: "string" },
        brand_voice: { type: "string" },
      },
    },
  },
});

const fullDocSchema = jsonSchema<FullParsedDoc>({
  type: "object",
  additionalProperties: false,
  required: ["business_context", "sitemap"],
  properties: {
    business_context: {
      type: "object",
      additionalProperties: false,
      required: ["business_name", "summary", "services", "target_audience", "brand_voice"],
      properties: {
        business_name: { type: "string" },
        summary: { type: "string" },
        services: {
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
        target_audience: { type: "string" },
        brand_voice: { type: "string" },
      },
    },
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
  let mode = "full";

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      documentText = (formData.get("document_text") as string) || "";
      modelOverride = (formData.get("model") as string) || "";
      promptOverride = (formData.get("system_prompt") as string) || "";
      mode = (formData.get("mode") as string) || "full";

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
      mode = body.mode || "full";
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

  if (mode === "context_only") {
    const contextPrompt = `You are an expert business analyst and copywriter.
Analyze the provided document (PDF, Word, or Markdown) and extract a comprehensive structured business profile:
1. business_name: The official or commercial name of the business/organization.
2. summary: A rich write-up (2-4 paragraphs) covering who they are, what they do, their mission, history, unique value proposition, and key differentiators.
3. services: A detailed array of each service, product line, or core solution they offer [{ title, description }].
4. target_audience: Description of their ideal clients, customers, or industries served.
5. brand_voice: Tone of voice, style, and vocabulary guidelines (e.g. "Authoritative, approachable, transparent, results-driven").`;

    try {
      const result = await generateObject({
        model: customOpenAI(selectedModel),
        system: promptOverride || contextPrompt,
        prompt: `Copywriting Document:\n"""\n${documentText}\n"""`,
        schema: contextOnlySchema,
        schemaName: "SupercraftBusinessContext",
        temperature: 0.1,
      });

      return NextResponse.json({
        status: "success",
        mode: "context_only",
        business_context: result.object.business_context,
        extracted_text_preview: documentText.slice(0, 500),
        model_used: selectedModel,
      });
    } catch (error: unknown) {
      const errDetails = error instanceof Error ? error.message : String(error);
      console.error("[sitebuilder/parse-doc] Context extraction error:", error);
      return NextResponse.json(
        { error: `Context extraction failed with model ${selectedModel}: ${errDetails}` },
        { status: 500 }
      );
    }
  }

  // Full mode: Extracts both business context profile AND sitemap hierarchy
  const defaultFullPrompt = `You are an expert website sitemap & copywriting structure parser for Supercraft.
Your task is to analyze the provided copywriting document (Markdown, PDF, or Word) and extract:
1. Business Context Profile:
   - business_name: Name of the business.
   - summary: Detailed write-up of the company, mission, and value proposition.
   - services: Array of all services/deliverables [{ title, description }].
   - target_audience: Primary target audience.
   - brand_voice: Tone of voice and style.
2. The exact Sitemap Tree Hierarchy:
   - Root parent pages (e.g. Home, Services, About, Portfolio, Contact). parent_slug MUST be null.
   - Child subpages (e.g. /services/web-design, /about/team). parent_slug MUST be the parent page's slug.
   - Ensure slug contains NO leading or trailing slashes (e.g. "services", "about", "contact", not "/services"). For the home page, slug MUST be "home".
3. Structured Sections for each page:
   - section_type: MUST match one of the exact library categories:
     ["hero", "subpage-hero", "authority-bar", "logo-cloud", "about", "team", "services", "features", "process", "portfolio", "case-study", "timeline", "testimonials", "pricing", "blog", "cta", "newsletter", "faq", "contact", "opening-loader", "page-breaker", "header", "footer"]
   - design_tag: Assign the best layout mechanic or point count:
     - "marquee", "carousel", "accordion", "1-point", "2-points", "3-points", "4-points", "6-points", "multi"
   - heading: Section title / headline
   - subheading: Subtitle or section intro (or null if none)
   - body_text: Body paragraph (or null if none)
   - cta_label: Call-to-action button text (or null if none)
   - items: Array of sub-points, cards, features, team members, or FAQ items [{ title, description }]`;

  try {
    const result = await generateObject({
      model: customOpenAI(selectedModel),
      system: promptOverride || defaultFullPrompt,
      prompt: `Copywriting Document:\n"""\n${documentText}\n"""`,
      schema: fullDocSchema,
      schemaName: "SupercraftParsedSitemap",
      temperature: 0.1,
    });

    return NextResponse.json({
      status: "success",
      mode: "full",
      business_context: result.object.business_context,
      sitemap: result.object.sitemap || [],
      extracted_text: documentText,
      extracted_text_preview: documentText.slice(0, 500),
      model_used: selectedModel,
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
