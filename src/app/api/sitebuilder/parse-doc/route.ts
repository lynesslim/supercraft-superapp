import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface SectionCopy {
  section_type: "hero" | "about" | "features" | "testimonials" | "cta" | "footer";
  heading: string;
  subheading?: string;
  body_text?: string;
  cta_label?: string;
  bullet_points?: string[];
}

interface SitemapPageParse {
  page_title: string;
  slug: string;
  parent_slug?: string | null;
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
        required: ["page_title", "slug", "sections"],
        properties: {
          page_title: { type: "string" },
          slug: { type: "string" },
          parent_slug: { anyOf: [{ type: "string" }, { type: "null" }] },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["section_type", "heading"],
              properties: {
                section_type: {
                  type: "string",
                  enum: ["hero", "about", "features", "testimonials", "cta", "footer"],
                },
                heading: { type: "string" },
                subheading: { type: "string" },
                body_text: { type: "string" },
                cta_label: { type: "string" },
                bullet_points: {
                  type: "array",
                  items: { type: "string" },
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
  let body: { document_text?: string };

  try {
    body = (await request.json()) as { document_text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { document_text } = body;

  if (!document_text || typeof document_text !== "string") {
    return NextResponse.json(
      { error: "`document_text` string is required." },
      { status: 400 }
    );
  }

  const apiKey = process.env.SITEBUILDER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const fallbackSitemap = generateFallbackSitemap(document_text);
    return NextResponse.json({
      sitemap: fallbackSitemap,
      warning: "SITEBUILDER_OPENAI_API_KEY not configured. Used structured fallback parser.",
    });
  }

  const customOpenAI = createOpenAI({ apiKey });

  try {
    const result = await generateObject({
      model: customOpenAI("gpt-4o-mini"),
      system: `You are an expert website sitemap & copywriting parser for Supercraft.
Your primary task is to parse the website sitemap tree structure (especially ASCII tree diagrams using ├──, └──, ||, or indented sub-bullets) as the PRIMARY SOURCE OF TRUTH for page and subpage hierarchy.

Carefully identify:
1. Top-Level Parent Pages (e.g., Home, Services, About, Work, Blog, Contact Us, Privacy Policy). parent_slug should be null.
2. Child Subpages under parent categories:
   - Under Services: Brand & Strategy, Creative Content & Experiences, Digital Marketing & Performance, Customer Engagement & CRM, Technology & Digital Experiences. parent_slug: "services".
   - Under About: Our Story, Leadership. parent_slug: "about".
   - Under Work: Project 1 through Project 8. parent_slug: "work".

Ensure parent_slug is set to the parent page's slug for every subpage.
Valid section_type values MUST be one of: ["hero", "about", "features", "testimonials", "cta", "footer"].`,
      prompt: `Copywriting Document:\n"""\n${document_text}\n"""`,
      schema: parseDocSchema,
      schemaName: "SupercraftParsedSitemap",
      temperature: 0.2,
    });

    return NextResponse.json({
      sitemap: result.object.sitemap || [],
      status: "success",
    });
  } catch (error) {
    console.error("[sitebuilder/parse-doc] OpenAI parsing error:", error);
    const fallbackSitemap = generateFallbackSitemap(document_text);
    return NextResponse.json({
      sitemap: fallbackSitemap,
      warning: "OpenAI parsing encountered an issue. Applied structured fallback.",
    });
  }
}

function generateFallbackSitemap(text: string) {
  return [
    {
      page_title: "Home",
      slug: "home",
      parent_slug: null,
      sections: [
        {
          section_type: "hero" as const,
          heading: "Welcome to Supercraft",
          subheading: "Crafting digital experiences fast",
          body_text: text.slice(0, 200),
          cta_label: "Get Started",
        },
      ],
    },
    {
      page_title: "Services",
      slug: "services",
      parent_slug: null,
      sections: [
        {
          section_type: "features" as const,
          heading: "Our Services",
          subheading: "Explore what we offer",
        },
      ],
    },
    {
      page_title: "Brand & Strategy",
      slug: "brand-strategy",
      parent_slug: "services",
      sections: [
        {
          section_type: "about" as const,
          heading: "Brand & Strategy",
          subheading: "Positioning your brand for growth",
        },
      ],
    },
    {
      page_title: "About",
      slug: "about",
      parent_slug: null,
      sections: [
        {
          section_type: "about" as const,
          heading: "About Us",
          subheading: "Our Story and Leadership",
        },
      ],
    },
    {
      page_title: "Our Story",
      slug: "our-story",
      parent_slug: "about",
      sections: [
        {
          section_type: "about" as const,
          heading: "Our Journey & Story",
        },
      ],
    },
  ];
}
