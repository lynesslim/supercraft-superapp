"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

type PromptRow = {
  id?: string;
  name: string;
  prompt_text: string;
  updated_at?: string;
};

const fallbackPrompts: PromptRow[] = [
  {
    name: "sitemap_generator",
    prompt_text:
      "You are an expert UX designer and content strategist. Given project context, create a premium website sitemap. Return only the structured sitemap object required by the schema. Use stable kebab-case ids. Use null parentId for top-level pages. Pages should be practical, conversion-aware, and useful for the project strategy. For every page, include a purpose field that explains the high-level page intent in 1-2 concise sentences. Purpose is not a section list.",
  },
  {
    name: "style_guide_generator",
    prompt_text:
      "You are a senior brand and website copy director. Create a practical style guide for consistent website copy based on the supplied project details. Include voice, tone, messaging principles, CTA style, terminology, do/don't guidance, and formatting preferences. Return plain text only.",
  },
  {
    name: "webcopy_refinement",
    prompt_text:
      "You are editing Markdown website copy. Return only the revised Markdown text requested, with no preamble. Mode meanings: regenerate means regenerate the full page copy; regenerate-selection means rewrite only the selected excerpt; paraphrase means preserve meaning with new wording; shorten means keep the core message in fewer words; expand means add useful specific detail; change-tone means apply the feedback tone; bullet-points means convert the selected excerpt into concise Markdown bullet points. For selection tasks, return only the rewritten selected excerpt and do not include surrounding page titles, labels, or context unless they are inside the selected text. If the selected excerpt does not begin with a Markdown heading, do not begin with a heading.",
  },
  {
    name: "hero_mockup_prompt",
    prompt_text:
      "You are a world-class UI/UX visual designer specializing in modern, high-end hero sections. Generate a premium, production-grade website hero section mockup. It should look like a highly detailed Dribbble/Behance showcase or a real screenshot of a premium landing page. Fully render realistic typographic layouts, clear text, fine navigation details, high-end icons, and interactive elements. Avoid generic stock photos; make the visuals feel customized and luxurious. Accent color: {{accent_color}}. Theme: {{theme}}. Additional instructions: {{additionalinstruction}}.",
  },

];

const samples = {
  sitemap_generator:
    "Client: A boutique architecture studio in Singapore. Audience: affluent homeowners and developers. Goal: reposition the studio as refined, calm, and detail-obsessed. Need a lean website sitemap with conversion paths for consultations.",
  webcopy_generator:
    "Page: Residential Architecture. Context: Boutique Singapore architecture studio serving private homeowners. Goal: create elegant, trust-building webcopy with a clear consultation CTA.",
  project_strategy_generator:
    "Project name: TS Tyre Autocare. Brief: Tyre and car servicing workshop. Goal: improve trust, explain services clearly, and drive WhatsApp enquiries.",
  project_detail_refiner:
    "Field: USP. Current value: Reliable tyre and autocare workshop. Feedback: make it sharper, more premium, and more specific.",
  style_guide_generator:
    "Project name: Atelier Sora\nSummary: Boutique Singapore architecture studio for refined private homes and boutique developments.\nIndustry: Architecture and interior design\nUSP: Quietly luxurious spaces shaped around craft, restraint, and client lifestyle.\nStrategy sheet: Audience is affluent homeowners and developers. Tone should feel calm, precise, premium, and grounded. Conversion goal is consultation enquiries.\nSitemap: Home, Residential Architecture, Process, Portfolio, About, Contact.",
  webcopy_refinement:
    "Selected text: Our tyre services are fast and affordable. Task: make it more premium, specific, and trustworthy while keeping it short.",
  hero_mockup_prompt:
    "Accent color: #a3b840. Theme: dark. Inspired by the following aesthetic styles: Minimalist Architecture (Clean, Split-Screen), Luxury Dark Portfolio.",
};

const promptLabels: Record<string, string> = {
  project_strategy_generator: "Project Strategist",
  project_detail_refiner: "Project Detail Refiner",
  sitemap_generator: "Sitemap Architect",
  style_guide_generator: "Style Guide Director",
  webcopy_refinement: "Copy Refiner",
  webcopy_generator: "Webcopy Director",
  hero_mockup_prompt: "Hero Mockup Strategist",
};

const MAX_PLAYGROUND_PDF_BYTES = 60 * 1024 * 1024;
const MAX_PLAYGROUND_TOTAL_PDF_BYTES = 90 * 1024 * 1024;

function mergePrompts(remotePrompts: PromptRow[]) {
  const byName = new Map(fallbackPrompts.map((prompt) => [prompt.name, prompt]));

  for (const prompt of remotePrompts) {
    byName.set(prompt.name, prompt);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function validatePlaygroundPdfSelection(files: File[]) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_PLAYGROUND_TOTAL_PDF_BYTES) {
    return `Total PDF size must be ${Math.floor(MAX_PLAYGROUND_TOTAL_PDF_BYTES / 1024 / 1024)}MB or smaller.`;
  }

  for (const file of files) {
    if (file.size > MAX_PLAYGROUND_PDF_BYTES) {
      return `Each PDF must be ${Math.floor(MAX_PLAYGROUND_PDF_BYTES / 1024 / 1024)}MB or smaller.`;
    }
  }

  return "";
}

export default function PlaygroundPage() {
  const [prompts, setPrompts] = useState<PromptRow[]>(fallbackPrompts);
  const [activeName, setActiveName] = useState(fallbackPrompts[0].name);
  const [brief, setBrief] = useState(samples.sitemap_generator);
  const [output, setOutput] = useState("");
  const [notice, setNotice] = useState("Loading prompt library...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Visual strategist mock inputs
  const [projectName, setProjectName] = useState("Test Studio Project");
  const [projectSummary, setProjectSummary] = useState("A boutique brand crafting quiet luxury visual designs.");
  const [industry, setIndustry] = useState("Boutique Design Agency");
  const [accentColor, setAccentColor] = useState("#a3b840");
  const [theme, setTheme] = useState("dark");
  const [additionalInstruction, setAdditionalInstruction] = useState("Sleek mobile app layout, split-screen UX card overlays, and dark themed accent highlights.");
  const [logoUrl, setLogoUrl] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  // References Database Curation Caching
  const [activeTab, setActiveTab] = useState<"sandbox" | "gallery">("sandbox");
  const [dbReferences, setDbReferences] = useState<Array<{ id: string; title: string; image_url: string; tags: string[]; theme: string }>>([]);
  const [selectedRefsForDeletion, setSelectedRefsForDeletion] = useState<string[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryNotice, setGalleryNotice] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ file: File; title: string; theme: string; tagsString: string; preview: string }>>([]);
  const [isUploadingReferences, setIsUploadingReferences] = useState(false);

  async function loadDbReferences() {
    setGalleryLoading(true);
    try {
      const response = await fetch("/api/hero-generator/references");
      if (response.ok) {
        const data = await response.json();
        setDbReferences(data.references || []);
      } else {
        setGalleryNotice("Failed to query visual references database.");
      }
    } catch (err) {
      setGalleryNotice("Error loading gallery references database.");
    } finally {
      setGalleryLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedRefsForDeletion.length === 0) return;
    if (!confirm(`Are you sure you want to delete these ${selectedRefsForDeletion.length} visual reference templates permanently?`)) return;
    
    setGalleryLoading(true);
    setGalleryNotice("Removing records and visual assets from database...");
    
    try {
      const response = await fetch("/api/hero-generator/references", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRefsForDeletion })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete visual references.");
      }
      
      setSelectedRefsForDeletion([]);
      setGalleryNotice(`Successfully deleted visual references!`);
      await loadDbReferences();
    } catch (err) {
      setGalleryNotice(err instanceof Error ? err.message : "Error executing bulk delete.");
    } finally {
      setGalleryLoading(false);
      setTimeout(() => setGalleryNotice(""), 4000);
    }
  }

  function handleGalleryFilesSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const validImageFiles = files.filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name));
    
    const newUploads = validImageFiles.map(file => {
      // Remove extension for default title
      const cleanTitle = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const prettyTitle = cleanTitle
        .split(/[-_\s]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
        
      return {
        file,
        title: prettyTitle,
        theme: "both",
        tagsString: "Minimalist, Clean Layout",
        preview: URL.createObjectURL(file)
      };
    });
    
    setUploadingFiles(prev => [...prev, ...newUploads]);
    event.target.value = ""; // Reset
  }

  async function handleBulkUpload() {
    if (uploadingFiles.length === 0) return;
    
    setIsUploadingReferences(true);
    setGalleryNotice("Uploading multi-part images to Supabase storage and curating database...");
    
    try {
      const formData = new FormData();
      uploadingFiles.forEach((item, idx) => {
        formData.append(`file_${idx}`, item.file);
        formData.append(`title_${idx}`, item.title);
        formData.append(`theme_${idx}`, item.theme);
        formData.append(`tags_${idx}`, item.tagsString);
      });
      
      const response = await fetch("/api/hero-generator/references", {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload reference files.");
      }
      
      // Cleanup previews
      uploadingFiles.forEach(item => URL.revokeObjectURL(item.preview));
      setUploadingFiles([]);
      setGalleryNotice(`Successfully added ${uploadingFiles.length} visual reference templates!`);
      await loadDbReferences();
    } catch (err) {
      setGalleryNotice(err instanceof Error ? err.message : "Error executing bulk upload.");
    } finally {
      setIsUploadingReferences(false);
      setTimeout(() => setGalleryNotice(""), 4000);
    }
  }

  useEffect(() => {
    if (activeTab === "gallery") {
      void loadDbReferences();
    }
  }, [activeTab]);

  useEffect(() => {
    // If active prompt shifts away from hero mockup strategist, reset tab to sandbox
    if (activeName !== "hero_mockup_prompt") {
      setActiveTab("sandbox");
    } else {
      // Proactively pre-load reference counts in background
      void loadDbReferences();
    }
  }, [activeName]);

  const activePrompt =
    prompts.find((prompt) => prompt.name === activeName) ?? prompts[0];

  useEffect(() => {
    async function loadPrompts() {
      const response = await fetch("/api/admin/prompts");
      const data = (await response.json()) as { error?: string; prompts?: PromptRow[] };

      if (!response.ok) {
        setNotice(`Using local defaults. ${data.error ?? "Prompt library unavailable."}`);
        return;
      }

      if (data.prompts && data.prompts.length > 0) {
        const merged = mergePrompts(data.prompts);
        setPrompts(merged);
        setActiveName(merged[0].name);
        setBrief(samples[merged[0].name as keyof typeof samples] ?? samples.sitemap_generator);
        setNotice("Prompt library synced from Supabase.");
      } else {
        setNotice("No prompts found yet. Save the defaults to create them.");
      }
    }

    void loadPrompts();
  }, []);

  function updatePromptText(value: string) {
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.name === activeName ? { ...prompt, prompt_text: value } : prompt,
      ),
    );
  }

  function switchPrompt(name: string) {
    setActiveName(name);
    setBrief(samples[name as keyof typeof samples] ?? brief);
    setOutput("");
    setSelectedFiles([]);
    setImageFile(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setSelectedFiles((prev) => {
      const nextFiles = [...prev, ...files];
      const validationError = validatePlaygroundPdfSelection(nextFiles);
      if (validationError) {
        setErrorMessage(validationError);
        setNotice("Test failed.");
        return prev;
      }

      return nextFiles;
    });
    event.target.value = "";
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function clearError() {
    setErrorMessage(null);
    setNotice("Ready.");
  }

  function savePrompt() {
    startSaving(async () => {
      const response = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: activePrompt.name,
          prompt_text: activePrompt.prompt_text,
        }),
      });
      const data = (await response.json()) as { error?: string };

      setNotice(
        !response.ok
          ? `Save failed: ${data.error ?? "Unable to save prompt."}`
          : `${promptLabels[activePrompt.name] ?? activePrompt.name} saved to Supabase.`,
      );
    });
  }

  function testPrompt() {
    startTesting(async () => {
      setOutput("");
      setErrorMessage(null);

      if (activeName === "hero_mockup_prompt") {
        setNotice("Running visual strategist image generation...");
        const formData = new FormData();
        formData.append("system", activePrompt.prompt_text);
        formData.append("project_name", projectName);
        formData.append("project_summary", projectSummary);
        formData.append("industry", industry);
        formData.append("accent_color", accentColor);
        formData.append("theme", theme);
        formData.append("additional_instruction", additionalInstruction);
        formData.append("logo_url", logoUrl);
        formData.append("image_url", manualImageUrl);
        if (imageFile) {
          formData.append("image_file", imageFile);
        }



        try {
          const response = await fetch("/api/playground/generate-hero", {
            method: "POST",
            body: formData,
          });

          const data = (await response.json()) as { error?: string; details?: string; imageUrl?: string };

          if (!response.ok || data.error) {
            setErrorMessage(data.error ?? "Failed to generate mockup image.");
            setNotice("Test failed.");
            return;
          }

          setOutput(data.imageUrl ?? "");
          setNotice("Prompt test complete. Visual mockup generated!");
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setNotice("Test failed.");
        }
        return;
      }

      setNotice(selectedFiles.length > 0 ? "Running with PDF attachments..." : "Running prompt test...");

      const useMultipart = selectedFiles.length > 0;
      let response: Response;
      let data: { text?: string; error?: string };

      if (useMultipart) {
        const validationError = validatePlaygroundPdfSelection(selectedFiles);
        if (validationError) {
          setErrorMessage(validationError);
          setNotice("Test failed.");
          return;
        }

        const formData = new FormData();
        formData.append("system", activePrompt.prompt_text);
        formData.append("prompt", brief);
        for (const file of selectedFiles) {
          formData.append("files", file);
        }
        response = await fetch("/api/playground/generate", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: activePrompt.prompt_text, prompt: brief }),
        });
      }

      try {
        data = await response.json();
      } catch {
        data = { error: "Invalid response from server" };
      }

      if (!response.ok || data.error) {
        const errorMsg = data.error ?? `Request failed with status ${response.status}`;
        setErrorMessage(errorMsg);
        setNotice("Test failed.");
        return;
      }

      setOutput(data.text ?? "");
      setNotice("Prompt test complete.");
    });
  }

  return (
    <main className="motion-fade-in min-h-screen overflow-hidden bg-[#111310] text-[#e8eae0]">
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="motion-slide-up flex flex-col gap-5 rounded-lg border border-white/8 bg-[#1a1c16] p-5 shadow-2xl shadow-black/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a3b840] transition hover:text-[#c8db5a]"
              href="/"
            >
              Supercraft Studio
            </Link>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-[#f3f4ec] sm:text-5xl">
              Prompt playground.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
              Edit the system prompts used across project strategy, sitemap generation, web copy,
              refinement, and export formatting.
            </p>
          </div>
          <div className="rounded-lg border border-[#a3b840]/20 bg-[#111310] p-4 text-sm text-white/55 sm:w-72">
            <p className="font-semibold text-[#f3f4ec]">Prompt library</p>
            <p className="mt-2 leading-6">
              Supabase prompts override built-in defaults. Missing built-ins still appear here and
              can be saved into the database.
            </p>
          </div>
        </header>

        <section className="mt-5 grid flex-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/55">Prompt Library</p>
              <span className="rounded-md bg-[#a3b840]/15 px-3 py-1 text-xs font-semibold text-[#c8db5a]">
                Supabase
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {prompts.map((prompt) => (
                <button
                  className={`motion-lift rounded-lg border p-4 text-left transition ${
                    prompt.name === activeName
                      ? "border-[#a3b840]/50 bg-[#a3b840] text-[#111310] shadow-xl shadow-black/20"
                      : "border-white/10 bg-[#111310] text-[#e8eae0] hover:border-[#a3b840]/35"
                  }`}
                  key={prompt.name}
                  onClick={() => switchPrompt(prompt.name)}
                  type="button"
                >
                  <p className="text-base font-semibold">
                    {promptLabels[prompt.name] ?? prompt.name}
                  </p>
                  <p
                    className={`mt-2 text-xs font-semibold tracking-[0.18em] uppercase ${
                      prompt.name === activeName ? "text-[#304000]" : "text-white/40"
                    }`}
                  >
                    {prompt.name}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-white/8 bg-[#111310] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                Status
              </p>
              <p className="mt-3 text-sm leading-6 text-white/70">{notice}</p>
            </div>
          </aside>

          <div className="flex flex-col gap-5 flex-1 w-full min-w-0">
            {/* Header Tabs specifically for Hero Mockup Strategist */}
            {activeName === "hero_mockup_prompt" && (
              <div className="flex border-b border-white/10 bg-[#1a1c16] rounded-t-lg p-2 gap-2 flex-wrap shadow-md">
                <button
                  type="button"
                  onClick={() => setActiveTab("sandbox")}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                    activeTab === "sandbox"
                      ? "bg-[#a3b840] text-[#111310] shadow-sm shadow-[#a3b840]/10"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Prompt Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("gallery")}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition flex items-center gap-2 ${
                    activeTab === "gallery"
                      ? "bg-[#a3b840] text-[#111310] shadow-sm shadow-[#a3b840]/10"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span>Visual Reference Gallery Manager</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-mono font-bold transition ${
                    activeTab === "gallery" ? "bg-[#304000]/20 text-[#304000]" : "bg-white/10 text-white/70"
                  }`}>
                    {galleryLoading ? "..." : dbReferences.length}
                  </span>
                </button>
              </div>
            )}

            {activeName === "hero_mockup_prompt" && activeTab === "gallery" ? (
              <div className="rounded-b-lg border-x border-b border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/25 sm:p-6 flex flex-col gap-6 w-full min-w-0 animate-fade-in">
                {galleryNotice && (
                  <div className="rounded-lg border border-[#a3b840]/20 bg-[#a3b840]/5 p-4 text-sm text-[#c8db5a] flex items-center gap-3 animate-fade-in">
                    <span>{galleryNotice}</span>
                  </div>
                )}

                {/* Bulk Upload Zone */}
                <div className="rounded-xl border border-white/5 bg-[#111310]/50 p-5 flex flex-col gap-4">
                  <div className="border-b border-white/5 pb-3">
                    <h3 className="text-lg font-bold text-[#f3f4ec]">Bulk Upload Visual References</h3>
                    <p className="text-xs text-white/40">Select multiple mockup images. Customize metadata inside curation stage before pushing to Supabase.</p>
                  </div>
                  
                  <div className="relative flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#111310] p-8 text-center transition hover:border-[#a3b840]/30 min-h-32">
                    <input
                      accept="image/*"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      multiple
                      onChange={handleGalleryFilesSelect}
                      type="file"
                    />
                    <div className="pointer-events-none">
                      <p className="text-sm font-semibold text-white/70">
                        Drag & drop or click to add visual layout mockups in bulk
                      </p>
                      <p className="mt-1.5 text-xs text-white/35">PNG, JPEG, WebP files supported (Max 10MB each)</p>
                    </div>
                  </div>

                  {/* Upload Staging Area */}
                  {uploadingFiles.length > 0 && (
                    <div className="flex flex-col gap-4 border-t border-white/5 pt-4 animate-fade-in">
                      <p className="text-xs font-bold text-[#a3b840] uppercase tracking-wider">
                        Curation Staging Area ({uploadingFiles.length} item{uploadingFiles.length > 1 ? "s" : ""})
                      </p>
                      
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {uploadingFiles.map((item, idx) => (
                          <div key={idx} className="rounded-lg border border-white/10 bg-[#111310] p-4 flex flex-col gap-3 relative animate-scale-up">
                            <button
                              type="button"
                              onClick={() => {
                                setUploadingFiles(prev => prev.filter((_, i) => i !== idx));
                                URL.revokeObjectURL(item.preview);
                              }}
                              className="absolute top-2 right-2 text-white/40 hover:text-red-400 text-xs font-semibold bg-[#1a1c16]/80 px-2 py-0.5 rounded transition"
                            >
                              Remove
                            </button>

                            <img
                              src={item.preview}
                              alt="Thumbnail"
                              className="w-full aspect-video object-cover rounded border border-white/5"
                            />
                          </div>

                        ))}
                      </div>

                      <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            uploadingFiles.forEach(x => URL.revokeObjectURL(x.preview));
                            setUploadingFiles([]);
                          }}
                          className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white/60 hover:text-white transition"
                        >
                          Clear All
                        </button>
                        <button
                          type="button"
                          disabled={isUploadingReferences}
                          onClick={handleBulkUpload}
                          className="motion-lift rounded-lg bg-[#a3b840] px-5 py-2 text-xs font-bold text-[#111310] hover:bg-[#c8db5a] disabled:opacity-50"
                        >
                          {isUploadingReferences ? "Uploading..." : `Upload Visual References (${uploadingFiles.length})`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* References List Curation */}
                <div className="flex-1 rounded-xl border border-white/5 bg-[#111310]/50 p-5 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#f3f4ec]">Reference Inspiration Gallery ({dbReferences.length})</h3>
                      <p className="text-xs text-white/40">These references will appear directly inside the production actual mockup generator sidebar.</p>
                    </div>
                    
                    {selectedRefsForDeletion.length > 0 && (
                      <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/25 px-4 py-2 rounded-lg animate-slide-up">
                        <span className="text-xs font-semibold text-red-400">
                          {selectedRefsForDeletion.length} reference{selectedRefsForDeletion.length > 1 ? "s" : ""} selected
                        </span>
                        <button
                          type="button"
                          onClick={handleBulkDelete}
                          className="rounded-lg bg-red-500 hover:bg-red-600 px-4 py-2 text-xs font-bold text-white transition shadow-lg shadow-red-500/10"
                        >
                          Delete Selected
                        </button>
                      </div>
                    )}
                  </div>

                  {galleryLoading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#a3b840]/25 border-t-[#a3b840]"></div>
                      <p className="mt-3 text-xs text-white/40 font-mono">Loading reference library database...</p>
                    </div>
                  ) : dbReferences.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-white/5 rounded-lg text-white/35 text-xs font-semibold">
                      No visual reference templates found in database. Drag and drop files above to populate inspiration gallery!
                    </div>
                  ) : (
                    <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 overflow-y-auto max-h-[500px] pr-2 [column-fill:_balance]">
                      {dbReferences.map(ref => {
                        const isChecked = selectedRefsForDeletion.includes(ref.id);
                        return (
                          <div 
                            key={ref.id} 
                            onClick={() => {
                              setSelectedRefsForDeletion(prev => 
                                prev.includes(ref.id) 
                                  ? prev.filter(x => x !== ref.id) 
                                  : [...prev, ref.id]
                              );
                            }}
                            className={`break-inside-avoid mb-4 group relative overflow-hidden rounded-xl border transition duration-300 cursor-pointer select-none ${
                              isChecked 
                                ? "border-red-500 shadow-xl shadow-red-500/5" 
                                : "border-white/10 hover:border-white/20"
                            }`}
                          >
                            <img 
                              src={ref.image_url} 
                              alt={ref.title || "Inspiration"} 
                              className="w-full h-auto block transition duration-500 group-hover:scale-105"
                            />
                            
                            {/* Selection Checkbox indicator */}
                            <div className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded border transition text-xs font-bold ${
                              isChecked 
                                ? "bg-red-500 border-red-500 text-white" 
                                : "bg-black/50 border-white/30 text-transparent"
                            }`}>
                              ✓
                            </div>
                          </div>

                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] w-full min-w-0">

            <section className="rounded-lg border border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/25 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#a3b840]">System Prompt</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#f3f4ec]">
                    {promptLabels[activePrompt.name] ?? activePrompt.name}
                  </h2>
                </div>
                <button
                  className="motion-lift rounded-lg bg-[#a3b840] px-5 py-3 text-sm font-bold text-[#111310] shadow-lg shadow-black/15 transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                  onClick={savePrompt}
                  type="button"
                >
                  {isSaving ? "Saving..." : "Save Prompt"}
                </button>
              </div>

              <textarea
                className="mt-6 min-h-[460px] w-full resize-y rounded-lg border border-white/10 bg-[#111310] p-5 font-mono text-sm leading-7 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                onChange={(event) => updatePromptText(event.target.value)}
                value={activePrompt.prompt_text}
              />
            </section>

            <section className="rounded-lg border border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/25 sm:p-6">
              <div>
                <p className="text-sm font-semibold text-[#a3b840]">Test Harness</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#f3f4ec]">
                  {activeName === "hero_mockup_prompt" ? "Visual Strategist Inputs" : "Live AI output"}
                </h2>
              </div>

              {activeName === "hero_mockup_prompt" ? (
                <div className="mt-5 grid gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50" htmlFor="project_name">
                      Project Name
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                      id="project_name"
                      onChange={(e) => setProjectName(e.target.value)}
                      type="text"
                      value={projectName}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50" htmlFor="industry">
                      Industry
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                      id="industry"
                      onChange={(e) => setIndustry(e.target.value)}
                      type="text"
                      value={industry}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50" htmlFor="project_summary">
                      Project Summary
                    </label>
                    <textarea
                      className="mt-2 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                      id="project_summary"
                      onChange={(e) => setProjectSummary(e.target.value)}
                      value={projectSummary}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50">
                        Accent Color
                      </label>
                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-[#111310] px-3 py-1.5">
                        <input
                          className="h-8 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
                          onChange={(e) => setAccentColor(e.target.value)}
                          type="color"
                          value={accentColor}
                        />
                        <input
                          className="w-full bg-transparent font-mono text-xs uppercase text-[#e8eae0] outline-none"
                          onChange={(e) => setAccentColor(e.target.value)}
                          type="text"
                          value={accentColor}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50" htmlFor="theme">

                        Theme Mode
                      </label>
                      <select
                        className="mt-2 w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/70"
                        id="theme"
                        onChange={(e) => setTheme(e.target.value)}
                        value={theme}
                      >
                        <option value="dark">Dark Theme</option>
                        <option value="light">Light Theme</option>
                        <option value="both">Both (Side-by-Side)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50" htmlFor="additionalInstruction">
                      Additional Instruction
                    </label>
                    <textarea
                      className="mt-2 w-full min-h-20 rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70 resize-y"
                      id="additionalInstruction"
                      onChange={(e) => setAdditionalInstruction(e.target.value)}
                      placeholder="e.g. Sleek mobile app layout, split-screen UX card overlays, and dark themed accent highlights."
                      value={additionalInstruction}
                    />
                  </div>


                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50" htmlFor="logo_url">
                      Brand Logo URL
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                      id="logo_url"
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      type="text"
                      value={logoUrl}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/50">
                      Inspiration Reference Image
                    </label>
                    <div className="mt-2 flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          className="w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                          disabled={!!imageFile}
                          onChange={(e) => setManualImageUrl(e.target.value)}
                          placeholder={imageFile ? "Using uploaded reference file..." : "https://example.com/reference.jpg"}
                          type="text"
                          value={imageFile ? "" : manualImageUrl}
                        />
                        {imageFile && (
                          <button
                            className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
                            onClick={() => setImageFile(null)}
                            type="button"
                          >
                            Clear File
                          </button>
                        )}
                      </div>
                      
                      <div className="relative flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#111310]/50 p-4 transition hover:border-[#a3b840]/30">
                        <input
                          accept="image/*"
                          className="absolute inset-0 cursor-pointer opacity-0"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setImageFile(file);
                              setManualImageUrl("");
                            }
                          }}
                          type="file"
                        />
                        <div className="text-center">
                          <p className="text-xs font-medium text-white/70">
                            {imageFile ? `Selected: ${imageFile.name}` : "Or click to drag & upload custom JPEG/PNG reference"}
                          </p>
                          {!imageFile && (
                            <p className="mt-1 text-[10px] text-white/40">Up to 10MB limit</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <label className="mt-6 block text-sm font-semibold text-white/65" htmlFor="brief">
                    Mock brief / page context
                  </label>
                  <textarea
                    className="mt-3 min-h-44 w-full resize-y rounded-lg border border-white/10 bg-[#111310] p-4 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                    id="brief"
                    onChange={(event) => setBrief(event.target.value)}
                    value={brief}
                  />

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-white/65">
                      PDF attachments (optional)
                    </label>
                    <input
                      className="mt-2 block w-full text-sm text-white/50 file:mr-4 file:rounded-lg file:border file:border-[#a3b840]/30 file:bg-[#1a1c16] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#a3b840] file:transition hover:file:bg-[#222420] file:cursor-pointer"
                      accept=".pdf,application/pdf"
                      id="pdf-files"
                      multiple
                      onChange={handleFileChange}
                      type="file"
                    />
                    {selectedFiles.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {selectedFiles.map((file, i) => (
                          <li
                            className="flex items-center gap-2 rounded-lg border border-[#a3b840]/20 bg-[#111310] px-3 py-1.5 text-xs text-white/70"
                            key={`${file.name}-${i}`}
                          >
                            <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                            <span className="font-medium text-white/90">{file.name}</span>
                            <button
                              className="ml-1 text-white/40 transition hover:text-[#ff6b6b]"
                              onClick={() => removeFile(i)}
                              type="button"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              <button
                className="mt-6 w-full rounded-lg bg-[#a3b840] px-5 py-3 text-sm font-bold text-[#111310] shadow-xl shadow-black/20 transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  isTesting ||
                  (!activePrompt.prompt_text.trim()) ||
                  (activeName !== "hero_mockup_prompt" && !brief.trim() && selectedFiles.length === 0)
                }
                onClick={testPrompt}
                type="button"
              >
                {isTesting
                  ? "Generating..."
                  : activeName === "hero_mockup_prompt"
                  ? "Run Mockup Generation"
                  : selectedFiles.length > 0
                  ? `Run Test with ${selectedFiles.length} PDF${selectedFiles.length > 1 ? "s" : ""}`
                  : "Run Test Generation"}
              </button>

              {errorMessage && (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-red-400">Test failed</p>
                      <p className="mt-1 text-sm text-red-300/80">{errorMessage}</p>
                    </div>
                    <button
                      className="shrink-0 text-red-400/60 transition hover:text-red-300"
                      onClick={clearError}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 min-h-[320px] rounded-lg border border-white/10 bg-[#111310] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                  Response
                </p>
                {activeName === "hero_mockup_prompt" && output ? (
                  <div className="mt-4 flex flex-col items-center gap-4">
                    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40 p-2">
                      <img
                        alt="Generated Mockup Preview"
                        className="max-h-[500px] w-full rounded object-contain transition-transform duration-300 hover:scale-[1.02]"
                        src={output}
                      />
                    </div>
                    <a
                      className="inline-flex items-center gap-2 rounded-lg border border-[#a3b840]/30 bg-[#1a1c16] px-4 py-2 text-sm font-semibold text-[#a3b840] transition hover:bg-[#222420]"
                      download="hero-playground-mockup.png"
                      href={output}
                    >
                      Download Image
                    </a>
                  </div>
                ) : (
                  <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/75">
                    {output || "AI output will appear here after a test run."}
                  </pre>
                )}
              </div>
            </section>
          </div>
        )}
      </div>



        </section>
      </div>
    </main>
  );
}

