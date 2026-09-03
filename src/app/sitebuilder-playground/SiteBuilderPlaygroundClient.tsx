"use client";

import { useState, useTransition, useId } from "react";
import { 
  FileText, 
  UploadCloud, 
  Sparkles, 
  Check, 
  Copy, 
  Layers, 
  Settings2, 
  Code, 
  Eye, 
  AlertCircle,
  FolderTree,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronsDownUp,
  CornerDownRight,
  GitBranch
} from "lucide-react";

interface SectionItem {
  title?: string;
  description?: string;
}

interface SectionCopy {
  section_type: string;
  design_tag?: string;
  heading: string;
  subheading?: string;
  body_text?: string;
  cta_label?: string;
  items?: SectionItem[];
}

interface SitemapPage {
  page_title: string;
  slug: string;
  parent_slug?: string | null;
  sections: SectionCopy[];
}

interface ParseResponse {
  sitemap: SitemapPage[];
  extracted_text?: string;
  model_used?: string;
  status: string;
}

interface TreePageNode {
  page: SitemapPage;
  originalIndex: number;
  subpages: TreePageNode[];
}

function buildSitemapTree(pages: SitemapPage[]): { tree: TreePageNode[]; orphans: TreePageNode[] } {
  if (!pages || pages.length === 0) return { tree: [], orphans: [] };

  const rootNodes: TreePageNode[] = [];
  const subNodes: TreePageNode[] = [];

  pages.forEach((p, idx) => {
    const node: TreePageNode = { page: p, originalIndex: idx, subpages: [] };
    const pSlug = (p.parent_slug || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
    if (!pSlug) {
      rootNodes.push(node);
    } else {
      subNodes.push(node);
    }
  });

  const orphans: TreePageNode[] = [];
  subNodes.forEach(sub => {
    const parentSlug = (sub.page.parent_slug || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
    const parent = rootNodes.find(r => {
      const rSlug = r.page.slug.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
      return rSlug === parentSlug;
    });

    if (parent) {
      parent.subpages.push(sub);
    } else {
      orphans.push(sub);
    }
  });

  return { tree: rootNodes, orphans };
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert website sitemap & copywriting structure parser for Supercraft.
Your task is to analyze the provided copywriting document (Markdown, PDF, or Word) and extract:
1. The exact Sitemap Tree Hierarchy:
   - Root parent pages (e.g. Home, Services, About, Portfolio, Contact). parent_slug MUST be null.
   - Child subpages (e.g. /services/web-design, /about/team). parent_slug MUST be the parent page's slug.
2. Structured Sections for each page:
   - section_type: MUST match one of the exact library categories:
     ["hero", "subpage-hero", "about", "features", "services", "process", "portfolio", "timeline", "authority-bar", "cta", "faq", "contact", "opening-loader", "page-breaker", "header", "footer"]
   - design_tag: Estimate the layout structure based on item count:
     - 2 items -> "2-points"
     - 3 items -> "3-points"
     - 4 items -> "4-points"
     - 5+ items -> "multi"
   - heading: Section title / headline
   - subheading: Subtitle or section intro (or null if none)
   - body_text: Body paragraph (or null if none)
   - cta_label: Call-to-action button text (or null if none)
   - items: Array of sub-points, service cards, features, or FAQ items [{ title, description }]
   - Ensure slug contains NO leading or trailing slashes (e.g. "services", "about", "contact", not "/services"). For the home page, slug MUST be "home".`;

const SAMPLE_COPY = `# BrandCraft Studio - Website Copywriting

## Page: Home (/home)
### Section: Hero
Heading: Designing High-Impact Digital Experiences
Subheading: We partner with visionary brands to create category-defining websites and interactive systems.
CTA: View Case Studies

### Section: Authority Bar
Heading: Trusted by industry innovators across Southeast Asia
Subheading: Global teams scaling their design with Supercraft

### Section: Services (3 Points)
Heading: What We Do
Subheading: Strategic creative capabilities built for digital speed
- Brand Identity: Logo systems, typography hierarchy, and dynamic style guides.
- Web Design & Engineering: Headless WordPress, bespoke Elementor architecture, and web apps.
- Motion & Interactions: Micro-animations, scroll physics, and custom 3D web visuals.

### Section: Call To Action
Heading: Ready to build something extraordinary?
Subheading: Book an exploratory consultation with our design directors.
CTA: Start Your Project

---

## Page: Services (/services)
### Section: Hero
Heading: Comprehensive Digital Capabilities
Subheading: From foundational strategy to production-grade deployment.

### Section: Process (4 Points)
Heading: Our 4-Stage Engagement Framework
- 01 Discover: Deep-dive workshops to uncover brand positioning and architecture.
- 02 Blueprint: Wireframes, sitemaps, and copywriting structural mapping.
- 03 Craft: Visual design systems, Component library, and interactive motion.
- 04 Deploy: Pixel-perfect build, QA testing, and performance optimization.

---

## Subpage: Web Design (/services/web-design)
Parent: services
### Section: Subpage Hero
Heading: Custom Web Design & Engineering
Subheading: High-performance websites designed to convert.

### Section: Features (multi)
Heading: Built Without Compromise
- Fast Load Speeds: Sub-second rendering optimized for core web vitals.
- Modular Components: Reusable section blueprints synced to your brand library.
- SEO Architecture: Semantic markup, clean hierarchy, and schema tags.
- Custom Animations: Smooth GSAP-driven scroll interactions.
- Responsive Across Devices: Flawless layout on desktop, tablet, and mobile.`;

export default function SiteBuilderPlaygroundClient() {
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState(SAMPLE_COPY);
  const [selectedModel, setSelectedModel] = useState("gpt-5.4-nano-2026-03-17");
  const [customModel, setCustomModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  
  const [isParsing, startParsing] = useTransition();
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"visual" | "text" | "json">("visual");
  const [copied, setCopied] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Progressive Disclosure States
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fileInputId = useId();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const togglePage = (pIdx: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(pIdx)) {
        next.delete(pIdx);
      } else {
        next.add(pIdx);
      }
      return next;
    });
  };

  const toggleSection = (pIdx: number, sIdx: number) => {
    const key = `${pIdx}-${sIdx}`;
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllPages = () => {
    if (!result?.sitemap) return;
    setExpandedPages(new Set(result.sitemap.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedPages(new Set());
    setExpandedSections(new Set());
  };

  const expandAllContent = () => {
    if (!result?.sitemap) return;
    setExpandedPages(new Set(result.sitemap.map((_, i) => i)));
    const allSecKeys: string[] = [];
    result.sitemap.forEach((page, pIdx) => {
      page.sections?.forEach((_, sIdx) => {
        allSecKeys.push(`${pIdx}-${sIdx}`);
      });
    });
    setExpandedSections(new Set(allSecKeys));
  };

  const runParse = () => {
    setError(null);
    setResult(null);
    setExpandedPages(new Set());
    setExpandedSections(new Set());

    const modelToUse = selectedModel === "custom" ? customModel : selectedModel;
    if (!modelToUse) {
      setError("Please specify an AI model.");
      return;
    }

    startParsing(async () => {
      const startTime = performance.now();
      try {
        let response: Response;

        if (inputMode === "file" && selectedFile) {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("model", modelToUse);
          formData.append("system_prompt", systemPrompt);

          response = await fetch("/api/sitebuilder/parse-doc", {
            method: "POST",
            body: formData,
          });
        } else {
          response = await fetch("/api/sitebuilder/parse-doc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              document_text: rawText,
              model: modelToUse,
              system_prompt: systemPrompt,
            }),
          });
        }

        const data = await response.json();
        const endTime = performance.now();
        setExecutionTime(Math.round(endTime - startTime));

        if (!response.ok || data.error) {
          setError(data.error || "Failed to parse document.");
        } else {
          setResult(data);
          setExpandedPages(new Set());
          setExpandedSections(new Set());
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Request error: ${msg}`);
      }
    });
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.sitemap, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPages = result?.sitemap?.length || 0;
  const parentPages = result?.sitemap?.filter(p => !p.parent_slug)?.length || 0;
  const subPages = result?.sitemap?.filter(p => !!p.parent_slug)?.length || 0;
  const totalSections = result?.sitemap?.reduce((acc, p) => acc + (p.sections?.length || 0), 0) || 0;

  const { tree, orphans } = buildSitemapTree(result?.sitemap || []);

  // Render a Single Page Card Component (reused for root pages and nested subpages)
  const renderPageCard = (node: TreePageNode, isSubpage: boolean = false, isLastSubpage: boolean = false) => {
    const page = node.page;
    const pIdx = node.originalIndex;
    const isPageExpanded = expandedPages.has(pIdx);
    const sectionsCount = page.sections?.length || 0;

    return (
      <div
        key={`${page.slug}-${pIdx}`}
        className={`rounded-xl border transition overflow-hidden ${
          isSubpage
            ? "bg-[#141611] border-amber-500/30 shadow-md shadow-black/20"
            : "bg-[#191b15] border-white/12 shadow-lg shadow-black/25"
        }`}
      >
        {/* Tier 1: Page Header Row (Always Visible) */}
        <div
          onClick={() => togglePage(pIdx)}
          className={`flex items-center justify-between p-3 cursor-pointer select-none transition ${
            isSubpage ? "hover:bg-amber-500/[0.04]" : "hover:bg-white/[0.03]"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1 rounded bg-white/5 text-white/50 hover:text-white shrink-0">
              {isPageExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#a3b840]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>

            {isSubpage ? (
              <span className="flex items-center gap-1 text-amber-400 text-xs font-bold shrink-0 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/25">
                <CornerDownRight className="w-3 h-3" /> Subpage
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#a3b840] text-xs font-bold shrink-0 bg-[#a3b840]/10 px-1.5 py-0.5 rounded border border-[#a3b840]/25">
                <Layers className="w-3 h-3" /> Root
              </span>
            )}

            <span className="font-bold text-white text-sm truncate">
              {page.page_title}
            </span>

            <code className={`text-[11px] px-2 py-0.5 rounded truncate ${
              isSubpage ? "bg-amber-500/10 text-amber-300/80" : "bg-white/5 text-white/50"
            }`}>
              /{isSubpage ? `${page.parent_slug}/${page.slug}` : page.slug}
            </code>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/60">
              {sectionsCount} {sectionsCount === 1 ? "sec" : "secs"}
            </span>

            {!isSubpage && node.subpages.length > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25 flex items-center gap-1">
                <GitBranch className="w-3 h-3" /> {node.subpages.length} {node.subpages.length === 1 ? "subpage" : "subpages"}
              </span>
            )}
          </div>
        </div>

        {/* Tier 2: Sections Breakdown (Visible when Page is Expanded) */}
        {isPageExpanded && (
          <div className="border-t border-white/5 p-3 space-y-2 bg-[#12140e]/60 animate-fadeIn">
            {page.sections && page.sections.length > 0 ? (
              page.sections.map((sec, sIdx) => {
                const secKey = `${pIdx}-${sIdx}`;
                const isSecExpanded = expandedSections.has(secKey);
                const hasContent = sec.subheading || sec.body_text || sec.cta_label || (sec.items && sec.items.length > 0);

                return (
                  <div
                    key={secKey}
                    className="rounded-lg border border-white/5 bg-[#171913] overflow-hidden transition"
                  >
                    {/* Section Header Row */}
                    <div
                      onClick={() => hasContent && toggleSection(pIdx, sIdx)}
                      className={`flex items-center justify-between p-2.5 transition ${
                        hasContent ? "cursor-pointer hover:bg-white/[0.02]" : "cursor-default"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {hasContent ? (
                          <span className="p-0.5 rounded text-white/40">
                            {isSecExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[#a3b840]" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                        ) : (
                          <span className="w-4" />
                        )}

                        <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold uppercase text-[10px] tracking-wide border border-blue-500/30 shrink-0">
                          {sec.section_type}
                        </span>

                        {sec.design_tag && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 font-semibold text-[10px] border border-purple-500/30 shrink-0">
                            {sec.design_tag}
                          </span>
                        )}

                        <span className="font-semibold text-white text-xs truncate">
                          {sec.heading}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {sec.cta_label && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-medium border border-emerald-500/20">
                            CTA: {sec.cta_label}
                          </span>
                        )}

                        {sec.items && sec.items.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-white/5 text-white/60 text-[10px]">
                            {sec.items.length} items
                          </span>
                        )}

                        {hasContent && (
                          <span className="text-[10px] text-white/30 hover:text-white/60">
                            {isSecExpanded ? "collapse" : "view copy"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tier 3: Section Content (Visible when Section is Expanded) */}
                    {isSecExpanded && (
                      <div className="border-t border-white/5 p-3.5 bg-[#10120d] text-xs space-y-2.5 animate-fadeIn">
                        {sec.subheading && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-0.5">
                              Subheading:
                            </span>
                            <p className="text-white/70 italic">&ldquo;{sec.subheading}&rdquo;</p>
                          </div>
                        )}

                        {sec.body_text && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-0.5">
                              Body Copy:
                            </span>
                            <p className="text-white/60 leading-relaxed">{sec.body_text}</p>
                          </div>
                        )}

                        {sec.cta_label && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                              Button Label:
                            </span>
                            <span className="px-2.5 py-1 rounded bg-[#a3b840] text-[#111310] font-bold text-[11px]">
                              {sec.cta_label}
                            </span>
                          </div>
                        )}

                        {/* Repeater Items / Bullet Points */}
                        {sec.items && sec.items.length > 0 && (
                          <div className="pt-2 border-t border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-2">
                              Repeater Items ({sec.items.length} points):
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {sec.items.map((item, iIdx) => (
                                <div
                                  key={`item-${pIdx}-${sIdx}-${iIdx}`}
                                  className="p-2.5 rounded bg-white/[0.02] border border-white/5"
                                >
                                  <strong className="text-white/90 text-xs block">
                                    {item.title || `Item ${iIdx + 1}`}
                                  </strong>
                                  {item.description && (
                                    <p className="text-white/50 text-[11px] mt-1 leading-snug">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-white/30 italic p-2">
                No sections parsed for this page.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#111310] text-[#e8eae0] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#a3b840]/15 text-[#a3b840] border border-[#a3b840]/30">
                <Sparkles className="w-3.5 h-3.5" /> SiteBuilder Lab
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-white/60 border border-white/10">
                Model: {selectedModel === "custom" ? customModel : selectedModel}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Sitemap & Document Parser Playground
            </h1>
            <p className="text-sm text-white/50 mt-1">
              Upload a .docx or .pdf copywriting document to test AI page hierarchy, sitemap trees, and section breakdown extraction.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#1a1c16] text-white/70 border border-white/10 hover:border-[#a3b840]/40 hover:text-white transition"
            >
              <Settings2 className="w-4 h-4" />
              {showPromptEditor ? "Hide Prompt Rules" : "Customize System Prompt"}
            </button>
          </div>
        </div>

        {/* Collapsible System Prompt Editor */}
        {showPromptEditor && (
          <div className="mt-4 p-5 rounded-xl border border-white/10 bg-[#161813] animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                System Prompt & Taxonomy Rules
              </span>
              <button
                type="button"
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                className="text-xs text-[#a3b840] hover:underline"
              >
                Reset to Default Rules
              </button>
            </div>
            <textarea
              rows={8}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full font-mono text-xs bg-[#111310] border border-white/10 rounded-lg p-3 text-white/80 focus:border-[#a3b840]/60 outline-none leading-5"
            />
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Inputs & Controls */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-[#171914] shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                Input Source
              </span>
              <div className="flex items-center p-0.5 rounded-lg bg-[#111310] border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode("file")}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    inputMode === "file"
                      ? "bg-[#a3b840] text-[#111310] font-bold shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("text")}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    inputMode === "text"
                      ? "bg-[#a3b840] text-[#111310] font-bold shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Paste Text
                </button>
              </div>
            </div>

            {/* Mode 1: File Dropper */}
            {inputMode === "file" ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                  selectedFile
                    ? "border-[#a3b840]/60 bg-[#a3b840]/5"
                    : "border-white/15 bg-[#111310]/50 hover:border-[#a3b840]/40"
                }`}
              >
                <input
                  id={fileInputId}
                  type="file"
                  accept=".docx,.pdf,.txt,.md,.json"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-[#a3b840]/15 flex items-center justify-center text-[#a3b840] mb-3">
                      <FileText className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-white text-sm break-all">{selectedFile.name}</p>
                    <p className="text-xs text-white/40 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Click or drop another to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/50 mb-3">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-white/90">
                      Drop .docx or .pdf file here
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      Supports Word (.docx), PDF (.pdf), Markdown (.md), or Plain Text (.txt)
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <textarea
                  rows={12}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste your copywriting document..."
                  className="w-full font-mono text-xs bg-[#111310] border border-white/10 rounded-xl p-3 text-white/80 focus:border-[#a3b840]/60 outline-none leading-relaxed"
                />
                <button
                  type="button"
                  onClick={() => setRawText(SAMPLE_COPY)}
                  className="mt-2 text-xs text-[#a3b840] hover:underline"
                >
                  Load Sample Copywriting Document
                </button>
              </div>
            )}

            {/* Model Selector */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2">
                Select Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#111310] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-medium focus:border-[#a3b840]/60 outline-none"
              >
                <option value="gpt-5.4-nano-2026-03-17">gpt-5.4-nano-2026-03-17 (Recommended)</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="custom">Custom Model Identifier...</option>
              </select>

              {selectedModel === "custom" && (
                <input
                  type="text"
                  placeholder="e.g. gpt-4.5-preview, claude-3-5-sonnet-20241022"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="mt-2 w-full bg-[#111310] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#a3b840]/60"
                />
              )}
            </div>

            {/* Submit Button */}
            <button
              type="button"
              disabled={isParsing || (inputMode === "file" && !selectedFile) || (inputMode === "text" && !rawText.trim())}
              onClick={runParse}
              className="mt-6 w-full py-3.5 rounded-xl font-bold text-sm bg-[#a3b840] text-[#111310] shadow-lg shadow-[#a3b840]/15 hover:bg-[#b8ce4a] active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isParsing ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#111310] border-t-transparent rounded-full animate-spin" />
                  Parsing with {selectedModel === "custom" ? customModel : selectedModel}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Parse Document & Generate Structure
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Hierarchy & Results */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-white/10 bg-[#171914] shadow-xl overflow-hidden min-h-[560px] flex flex-col">
            {/* Top Bar: Tabs & Stats */}
            <div className="p-4 border-b border-white/10 bg-[#141611] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-[#111310] p-1 rounded-lg border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("visual")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                    activeTab === "visual"
                      ? "bg-[#a3b840] text-[#111310]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> Visual Hierarchy Tree
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("text")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                    activeTab === "text"
                      ? "bg-[#a3b840] text-[#111310]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Extracted Text
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("json")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                    activeTab === "json"
                      ? "bg-[#a3b840] text-[#111310]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <Code className="w-3.5 h-3.5" /> Raw JSON
                </button>
              </div>

              {result && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/40 mr-1">
                    <strong className="text-white/80">{executionTime}ms</strong>
                  </span>
                  <button
                    type="button"
                    onClick={copyJson}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 border border-white/10 text-white/70 hover:text-white transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy JSON"}
                  </button>
                </div>
              )}
            </div>

            {/* Stats Overview Bar & Global Controls */}
            {result && (
              <div className="border-b border-white/10 bg-[#12140f] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-white/40 mr-1.5">Pages:</span>
                    <strong className="text-white font-semibold">{totalPages}</strong>
                    <span className="text-white/40 text-[11px] ml-1">({parentPages} root, {subPages} sub)</span>
                  </div>
                  <div className="h-3 w-px bg-white/10" />
                  <div>
                    <span className="text-white/40 mr-1.5">Sections:</span>
                    <strong className="text-[#a3b840] font-semibold">{totalSections}</strong>
                  </div>
                </div>

                {/* Quick Expand / Collapse Controls */}
                {activeTab === "visual" && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={collapseAll}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition"
                      title="Collapse everything to pages only"
                    >
                      <ChevronsDownUp className="w-3 h-3" />
                      Collapse All
                    </button>
                    <button
                      type="button"
                      onClick={expandAllPages}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition"
                      title="Expand to show all section headers"
                    >
                      <ChevronsUpDown className="w-3 h-3" />
                      Section Headers
                    </button>
                    <button
                      type="button"
                      onClick={expandAllContent}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-[#a3b840]/10 border border-[#a3b840]/30 text-[#a3b840] hover:bg-[#a3b840]/20 transition"
                      title="Expand all section content details"
                    >
                      <Sparkles className="w-3 h-3" />
                      Expand All
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Content Body */}
            <div className="p-5 flex-1 overflow-y-auto">
              {!result && !isParsing && (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-white/30">
                  <FolderTree className="w-12 h-12 mb-3 stroke-[1.5]" />
                  <p className="text-base font-semibold text-white/60">No sitemap parsed yet</p>
                  <p className="text-xs text-white/40 max-w-sm mt-1">
                    Upload your Word or PDF file on the left and click parse to preview the structured sitemap tree.
                  </p>
                </div>
              )}

              {isParsing && (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <div className="w-10 h-10 border-3 border-[#a3b840] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-semibold text-white">Analyzing document structure...</p>
                  <p className="text-xs text-white/40 mt-1">
                    Extracting headings, pages, and mapping sections to library taxonomy.
                  </p>
                </div>
              )}

              {result && activeTab === "visual" && (
                <div className="space-y-4">
                  {/* Render Hierarchical Tree (Root Pages with Nested Subpages directly underneath) */}
                  {tree.map((rootNode) => (
                    <div key={`root-group-${rootNode.page.slug}`} className="space-y-2">
                      {/* Root Page Card */}
                      {renderPageCard(rootNode, false)}

                      {/* Nested Child Subpages Container with Tree Branch Connectors */}
                      {rootNode.subpages.length > 0 && (
                        <div className="ml-5 pl-5 border-l-2 border-dashed border-amber-500/35 space-y-2.5 my-2">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400/60 flex items-center gap-1.5 py-0.5">
                            <CornerDownRight className="w-3 h-3 text-amber-400" />
                            <span>Subpages of /{rootNode.page.slug}:</span>
                          </div>
                          {rootNode.subpages.map((subNode, sIdx) => 
                            renderPageCard(subNode, true, sIdx === rootNode.subpages.length - 1)
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Any Orphan Subpages (whose parent slug didn't match a root page) */}
                  {orphans.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-dashed border-white/10">
                      <div className="text-xs font-semibold text-white/40 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Additional Subpages (Parent not matched in root list):</span>
                      </div>
                      <div className="ml-5 pl-5 border-l-2 border-dashed border-amber-500/25 space-y-2">
                        {orphans.map((orphanNode) => renderPageCard(orphanNode, true))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result && activeTab === "text" && (
                <div>
                  <div className="mb-3 text-xs text-white/50">
                    This is the Markdown/Text extracted from your document (via Mammoth or pdf-parse) before sending to the model:
                  </div>
                  <pre className="p-4 rounded-xl bg-[#111310] border border-white/10 font-mono text-xs text-white/80 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                    {result.extracted_text || "No extracted text preview available."}
                  </pre>
                </div>
              )}

              {result && activeTab === "json" && (
                <pre className="p-4 rounded-xl bg-[#111310] border border-white/10 font-mono text-xs text-[#a3b840] whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                  {JSON.stringify(result.sitemap, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
