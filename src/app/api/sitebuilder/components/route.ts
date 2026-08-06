import { NextResponse } from "next/server";

interface SeedComponent {
  id: string;
  title: string;
  section_type: "hero" | "about" | "features" | "testimonials" | "cta" | "footer";
  thumbnail_url: string;
  preview_url: string;
  elementor_data: unknown[];
}

const SEED_CATALOG: Record<string, SeedComponent[]> = {
  hero: [
    {
      id: "hero-split-01",
      title: "Hero Split Screen with Image",
      section_type: "hero",
      thumbnail_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/hero-split-01",
      elementor_data: [
        {
          id: "container-hero-1",
          elType: "container",
          isInner: false,
          settings: { flex_direction: "row", padding: { unit: "px", top: "80", bottom: "80", left: "20", right: "20" } },
          elements: [
            {
              id: "widget-hero-heading",
              elType: "widget",
              widgetType: "heading",
              settings: { title: "YOUR_HEADING_HERE", header_size: "h1" },
            },
            {
              id: "widget-hero-subheading",
              elType: "widget",
              widgetType: "text-editor",
              settings: { editor: "<p>YOUR_SUBHEADING_HERE</p>" },
            },
            {
              id: "widget-hero-button",
              elType: "widget",
              widgetType: "button",
              settings: { text: "YOUR_CTA_LABEL", button_type: "success" },
            },
          ],
        },
      ],
    },
    {
      id: "hero-centered-02",
      title: "Hero Centered Minimal",
      section_type: "hero",
      thumbnail_url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/hero-centered-02",
      elementor_data: [
        {
          id: "container-hero-2",
          elType: "container",
          isInner: false,
          settings: { flex_direction: "column", align_items: "center", text_align: "center" },
          elements: [
            {
              id: "widget-hero2-title",
              elType: "widget",
              widgetType: "heading",
              settings: { title: "YOUR_HEADING_HERE", header_size: "h1" },
            },
            {
              id: "widget-hero2-body",
              elType: "widget",
              widgetType: "text-editor",
              settings: { editor: "<p>YOUR_BODY_TEXT_HERE</p>" },
            },
            {
              id: "widget-hero2-btn",
              elType: "widget",
              widgetType: "button",
              settings: { text: "YOUR_CTA_LABEL" },
            },
          ],
        },
      ],
    },
    {
      id: "hero-video-03",
      title: "Hero Dark Mode with Callout",
      section_type: "hero",
      thumbnail_url: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/hero-dark-03",
      elementor_data: [
        {
          id: "container-hero-3",
          elType: "container",
          isInner: false,
          settings: { background_background: "classic", background_color: "#111827" },
          elements: [
            {
              id: "widget-hero3-title",
              elType: "widget",
              widgetType: "heading",
              settings: { title: "YOUR_HEADING_HERE", title_color: "#FFFFFF" },
            },
            {
              id: "widget-hero3-sub",
              elType: "widget",
              widgetType: "text-editor",
              settings: { editor: "<p style='color:#9CA3AF;'>YOUR_SUBHEADING_HERE</p>" },
            },
          ],
        },
      ],
    },
  ],
  about: [
    {
      id: "about-grid-01",
      title: "About Us 2-Column Story",
      section_type: "about",
      thumbnail_url: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/about-grid-01",
      elementor_data: [
        {
          id: "container-about-1",
          elType: "container",
          isInner: false,
          elements: [
            { id: "widget-about-title", elType: "widget", widgetType: "heading", settings: { title: "YOUR_HEADING_HERE" } },
            { id: "widget-about-body", elType: "widget", widgetType: "text-editor", settings: { editor: "<p>YOUR_BODY_TEXT_HERE</p>" } },
          ],
        },
      ],
    },
    {
      id: "about-stats-02",
      title: "About Us with Key Metrics",
      section_type: "about",
      thumbnail_url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/about-stats-02",
      elementor_data: [],
    },
  ],
  features: [
    {
      id: "features-3col-01",
      title: "3-Column Feature Cards",
      section_type: "features",
      thumbnail_url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/features-3col-01",
      elementor_data: [
        {
          id: "container-features-1",
          elType: "container",
          isInner: false,
          elements: [
            { id: "widget-feat-title", elType: "widget", widgetType: "heading", settings: { title: "YOUR_HEADING_HERE" } },
            { id: "widget-feat-sub", elType: "widget", widgetType: "text-editor", settings: { editor: "<p>YOUR_SUBHEADING_HERE</p>" } },
          ],
        },
      ],
    },
  ],
  testimonials: [
    {
      id: "testimonial-slider-01",
      title: "Testimonial Customer Cards",
      section_type: "testimonials",
      thumbnail_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/testimonial-slider-01",
      elementor_data: [],
    },
  ],
  cta: [
    {
      id: "cta-banner-01",
      title: "Call To Action Banner",
      section_type: "cta",
      thumbnail_url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/cta-banner-01",
      elementor_data: [
        {
          id: "container-cta-1",
          elType: "container",
          isInner: false,
          settings: { background_color: "#2563EB" },
          elements: [
            { id: "widget-cta-title", elType: "widget", widgetType: "heading", settings: { title: "YOUR_HEADING_HERE", title_color: "#FFFFFF" } },
            { id: "widget-cta-btn", elType: "widget", widgetType: "button", settings: { text: "YOUR_CTA_LABEL" } },
          ],
        },
      ],
    },
  ],
  footer: [
    {
      id: "footer-simple-01",
      title: "Minimal Footer with Links",
      section_type: "footer",
      thumbnail_url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80",
      preview_url: "https://vault.supercraft.my/preview/footer-simple-01",
      elementor_data: [],
    },
  ],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "hero";

  const components = SEED_CATALOG[type] || SEED_CATALOG["hero"];

  return NextResponse.json({
    type,
    components,
    status: "success",
  });
}
