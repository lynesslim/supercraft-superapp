import { openai } from "@ai-sdk/openai";
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

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Provide structured fallback parser if OPENAI_API_KEY is not set locally
    const fallbackSitemap = generateFallbackSitemap(document_text);
    return NextResponse.json({
      sitemap: fallbackSitemap,
      warning: "OPENAI_API_KEY not configured. Used structured fallback parser.",
    });
  }

  try {
    const result = await generateObject({
      model: openai("gpt-4o-mini"),
      system: `You are a specialized copywriting parser for Supercraft.
Analyze the copywriting document and extract the sitemap pages and section copy outlines.
Valid section_type values MUST be one of: ["hero", "about", "features", "testimonials", "cta", "footer"].`,
      prompt: `Copywriting Document:\n"""\n${document_text}\n"""`,
      schema: parseDocSchema,
      schemaName: "SupercraftParsedSitemap",
      temperature: 0.3,
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
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const headings = lines.filter((l) => l.length < 60 && !l.endsWith("."));

  return [
    {
      page_title: "Home",
      slug: "home",
      sections: [
        {
          section_type: "hero" as const,
          heading: headings[0] || "Welcome to Supercraft",
          subheading: headings[1] || "Crafting digital experiences fast",
          body_text: text.slice(0, 200),
          cta_label: "Get Started",
        },
        {
          section_type: "about" as const,
          heading: headings[2] || "About Us",
          subheading: "Learn more about our mission",
          body_text: text.slice(200, 400),
          cta_label: "Learn More",
        },
        {
          section_type: "features" as const,
          heading: headings[3] || "Our Core Features",
          subheading: "Designed for speed and precision",
          body_text: "Discover what makes our platform stand out.",
          bullet_points: ["Fast Assembly", "AI Content Population", "Seamless Integration"],
        },
        {
          section_type: "cta" as const,
          heading: "Ready to Build?",
          subheading: "Start your project today",
          body_text: "Join hundreds of creators building with Supercraft.",
          cta_label: "Contact Us",
        },
      ],
    },
  ];
}
