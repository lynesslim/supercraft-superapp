"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { 
  Sparkles, Check, Eye, Download, Info, Search, ChevronDown, ArrowLeft
} from "lucide-react";
import Lightbox from "../components/Lightbox";

type Project = {
  id: string;
  name: string;
  logo_url: string | null;
  accent_color: string | null;
};

type Reference = {
  id: string;
  title: string;
  image_url: string;
  tags: string[];
  theme: "light" | "dark" | "both";
};

type MockupOption = {
  url: string;
  prompt: string;
  saved?: boolean;
  width?: number;
  height?: number;
};


const visualStyles = [
  "Split-screen layout",
  "Bento-box UI dashboard",
  "Glassmorphic SaaS style",
  "Bold editorial typography",
  "Clean corporate design"
];

export default function HeroGeneratorClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [hasMoreReferences, setHasMoreReferences] = useState(true);
  const [isLoadingMoreRefs, setIsLoadingMoreRefs] = useState(false);
  const [randomSeed] = useState(() => Math.random());
  
  // Selection states
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [themePreference, setThemePreference] = useState<"light" | "dark" | "both">("both");
  const [accentColor, setAccentColor] = useState<string>("#a3b840");
  const [customLogoUrl, setCustomLogoUrl] = useState<string>("");
  const [additionalInstruction, setAdditionalInstruction] = useState<string>("");


  
  // Search and dropdown state for active project
  const [projectSearch, setProjectSearch] = useState("");
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Output states
  const [mockupOptions, setMockupOptions] = useState<MockupOption[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showResultsView, setShowResultsView] = useState(false);
  
  // Custom Reference Uploads state
  const [customReferences, setCustomReferences] = useState<Array<{ url: string; id: string; title: string }>>([]);
  const [selectedCustomRefs, setSelectedCustomRefs] = useState<string[]>([]);
  const [isUploadingCustomRef, setIsUploadingCustomRef] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Status states
  const [isGenerating, startGenerating] = useTransition();
  const [isSavingIndex, setIsSavingIndex] = useState<number | null>(null);
  const [isEditingMockup, setIsEditingMockup] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [errorNotice, setErrorNotice] = useState<string>("");

  const activeProject = projects.find(p => p.id === selectedProjectId);

  // Pre-load default values when active project changes
  useEffect(() => {
    if (activeProject) {
      const timer = setTimeout(() => {
        if (activeProject.accent_color) {
          setAccentColor(activeProject.accent_color);
        }
        if (activeProject.logo_url) {
          setCustomLogoUrl(activeProject.logo_url);
        } else {
          setCustomLogoUrl("");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedProjectId, activeProject]);

  useEffect(() => {
    async function loadData() {
      try {
        // Load projects
        const projRes = await fetch("/api/projects");
        if (projRes.ok) {
          const projData = await projRes.json();
          setProjects(projData.projects || []);
          if (projData.projects?.length > 0) {
            setSelectedProjectId(projData.projects[0].id);
          }
        }

        // Load visual reference library from database
        const limit = 15;
        const refRes = await fetch(`/api/hero-generator/references?limit=${limit}&offset=0&seed=${randomSeed}`);
        if (refRes.ok) {
          const refData = await refRes.json();
          const initialRefs = refData.references || [];
          setReferences(initialRefs);
          if (initialRefs.length < limit) {
            setHasMoreReferences(false);
          }
        } else {
          setReferences([]);
        }

      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    }
    void loadData();
  }, []);

  const loadMoreReferences = useCallback(async (currentOffset: number) => {
    if (isLoadingMoreRefs || !hasMoreReferences) return;
    setIsLoadingMoreRefs(true);
    try {
      const limit = 15;
      const res = await fetch(`/api/hero-generator/references?limit=${limit}&offset=${currentOffset}&seed=${randomSeed}`);
      if (res.ok) {
        const data = await res.json();
        const newRefs = data.references || [];
        if (newRefs.length < limit) {
          setHasMoreReferences(false);
        }
        setReferences(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const filtered = newRefs.filter((r: Reference) => !existingIds.has(r.id));
          return [...prev, ...filtered];
        });
      }
    } catch (err) {
      console.error("Failed to load more references", err);
    } finally {
      setIsLoadingMoreRefs(false);
    }
  }, [isLoadingMoreRefs, hasMoreReferences, randomSeed]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    const reachedBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 80;
    if (reachedBottom && !isLoadingMoreRefs && hasMoreReferences) {
      void loadMoreReferences(references.length);
    }
  }

  function toggleReference(id: string) {
    setSelectedRefs(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      if (prev.length >= 5) {
        setNotice("Maximum of 5 inspiration references allowed.");
        setTimeout(() => setNotice(""), 3000);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function handleCustomFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsUploadingCustomRef(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/hero-generator/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      const newRef = {
        url: data.url,
        id: `custom-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
      };
      setCustomReferences(prev => [...prev, newRef]);
      setNotice(`Uploaded "${file.name}" as custom reference.`);
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      console.error("Upload error", err);
      setErrorNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploadingCustomRef(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/hero-generator/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setCustomLogoUrl(data.url);
      setNotice(`Uploaded logo successfully.`);
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      console.error(err);
      setErrorNotice("Failed to upload logo.");
    } finally {
      setIsUploadingLogo(false);
    }
  }

  function toggleCustomRef(url: string) {
    setSelectedCustomRefs(prev => {
      if (prev.includes(url)) return prev.filter(item => item !== url);
      if (prev.length + selectedRefs.length >= 5) {
        setNotice("Maximum of 5 total references allowed.");
        setTimeout(() => setNotice(""), 3000);
        return prev;
      }
      return [...prev, url];
    });
  }

  function handleGenerate() {
    setErrorNotice("");
    setNotice("Crafting premium layout prompts and launching gpt-image-2 generators in parallel...");
    setMockupOptions([]);
    setShowResultsView(true);

    startGenerating(async () => {
      try {
        let itemsToProcess: { type: "db" | "custom", idOrUrl: string }[] = [];
        
        selectedRefs.forEach(id => itemsToProcess.push({ type: "db", idOrUrl: id }));
        selectedCustomRefs.forEach(url => itemsToProcess.push({ type: "custom", idOrUrl: url }));
        
        if (itemsToProcess.length === 0) {
           references.slice(0, 5).forEach(r => itemsToProcess.push({ type: "db", idOrUrl: r.id }));
        }
        
        itemsToProcess = itemsToProcess.slice(0, 5);
        const generatedOptions: any[] = [];
        
        const generationPromises = itemsToProcess.map(async (item, i) => {
          // Stagger each parallel request by 1.5 seconds to prevent proxy API concurrency limits from crashing the 5th request
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, i * 1500));
          }

          const response = await fetch("/api/hero-generator/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: selectedProjectId,
              referenceIds: item.type === "db" ? [item.idOrUrl] : [],
              theme: themePreference,
              accentColor,
              logoUrl: customLogoUrl || null,
              additionalInstruction,
              customReferenceUrls: item.type === "custom" ? [item.idOrUrl] : undefined,
            })
          });

          const data = await response.json();
          if (!response.ok) {
            console.error(`Generation ${i+1} failed:`, data);
            throw new Error(data.details ? `${data.error} Details: ${data.details}` : data.error || `Failed to generate mockup ${i+1}.`);
          }
          
          if (data.options && data.options.length > 0) {
             setMockupOptions(prev => [...prev, ...data.options]);
          }
        });

        await Promise.all(generationPromises);

        setNotice("Successfully generated options! Pick your favorites to save.");
      } catch (err) {
        setErrorNotice(err instanceof Error ? err.message : String(err));
        setNotice("");
      }
    });
  }

  async function handleSaveMockup(optionIndex: number) {
    const option = mockupOptions[optionIndex];
    if (option.saved) return;

    setIsSavingIndex(optionIndex);
    try {
      const response = await fetch("/api/hero-generator/mockups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          imageUrl: option.url,
          promptUsed: option.prompt,
          accentColor,
          theme: themePreference
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Save action failed.");
      }

      setMockupOptions(prev => prev.map((item, idx) => 
        idx === optionIndex ? { ...item, saved: true } : item
      ));
      setNotice("Mockup saved to project details!");
      setTimeout(() => setNotice(""), 4000);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingIndex(null);
    }
  }

  return (
    <main className="motion-fade-in min-h-screen bg-[#111310] px-4 py-8 text-[#e8eae0] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        
        {/* Header Banner */}
        <header className="flex flex-col gap-6 rounded-2xl border border-white/8 bg-[#171914] p-6 shadow-2xl shadow-black/40 sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#a3b840]/15 px-3 py-1 text-xs font-semibold text-[#c8db5a] border border-[#a3b840]/25">
              <Sparkles size={12} />
              <span>GPT Image 2 Powered</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#f3f4ec] sm:text-4xl">
              Hero Section Mockups.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Select projects, choose visual references, and generate 5 layout mockups in parallel.
            </p>
          </div>
        </header>

        {/* Form Workspace Grid */}
        <section className="mt-8 grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
          
          {/* Customizer Sidebar */}
          <aside className="flex flex-col gap-6 rounded-xl border border-white/8 bg-[#171914] p-5 shadow-xl shadow-black/25">
            <h2 className="text-lg font-bold text-[#f3f4ec] border-b border-white/5 pb-3">
              Configure Mockup
            </h2>

            {/* Step 1: Select Project with Search */}
            <div className="flex flex-col gap-2 relative">
              <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                1. Select Active Project
              </label>
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-[#111310] px-4 py-3 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60 text-left"
                >
                  <span className="truncate">
                    {activeProject ? activeProject.name : "Select a project..."}
                  </span>
                  <ChevronDown size={16} className={`text-white/40 transition-transform ${isProjectDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isProjectDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsProjectDropdownOpen(false)}
                    />
                    
                    <div className="absolute left-0 right-0 mt-1.5 rounded-lg border border-white/10 bg-[#171914] shadow-2xl p-2 z-20 flex flex-col gap-2 max-h-60">
                      <div className="relative flex items-center">
                        <Search size={14} className="absolute left-3 text-white/30" />
                        <input
                          type="text"
                          placeholder="Search projects..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          className="w-full rounded bg-[#111310] border border-white/5 pl-9 pr-3 py-1.5 text-xs text-[#e8eae0] outline-none placeholder-white/20 focus:border-[#a3b840]/40"
                          autoFocus
                        />
                      </div>
                      
                      <div className="overflow-y-auto flex-1 flex flex-col gap-0.5 pr-1">
                        {projects
                          .filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedProjectId(p.id);
                                setIsProjectDropdownOpen(false);
                                setProjectSearch("");
                              }}
                              className={`w-full text-left px-3 py-2 text-xs rounded transition flex items-center justify-between ${
                                selectedProjectId === p.id 
                                  ? "bg-[#a3b840]/10 text-[#c8db5a] font-bold" 
                                  : "text-white/70 hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <span className="truncate">{p.name}</span>
                              {selectedProjectId === p.id && <Check size={12} strokeWidth={3} />}
                            </button>
                          ))}
                        {projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
                          <div className="text-[10px] text-white/30 text-center py-4">
                            No projects found
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 2: Theme Settings */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                2. Design Theme Preferred
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["light", "dark", "both"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setThemePreference(t)}
                    className={`rounded-lg border py-2.5 text-xs font-bold capitalize transition ${
                      themePreference === t 
                        ? "bg-[#a3b840] border-[#a3b840] text-[#111310]"
                        : "border-white/10 bg-[#111310] text-white/60 hover:border-white/20"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Color Palette & Accents */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                  3. Color Palette / Accent
                </label>
                {activeProject?.accent_color && (
                  <span className="text-[10px] bg-white/5 text-[#a3b840] px-1.5 py-0.5 rounded font-mono">
                    Project Default Set
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <input 
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-11 w-12 cursor-pointer rounded-lg border border-white/10 bg-[#111310] p-1"
                />
                <input 
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#a3b840"
                  className="flex-1 rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm font-mono text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60"
                />
              </div>
            </div>

            {/* Step 4: Company Logo */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                4. Company Logo (Upload or URL)
              </label>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={customLogoUrl}
                  onChange={(e) => setCustomLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 rounded-lg border border-white/10 bg-[#111310] px-4 py-3 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60"
                />
                <label className={`flex cursor-pointer items-center justify-center rounded-lg px-4 text-xs font-bold transition border ${isUploadingLogo ? "bg-white/10 border-white/20 text-white/40" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}>
                  <input type="file" accept="image/*" className="hidden" disabled={isUploadingLogo} onChange={handleLogoUpload} />
                  {isUploadingLogo ? "..." : "Upload"}
                </label>
              </div>
            </div>

            {/* Step 5: Additional Instruction */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                5. Additional Instruction
              </label>
              <textarea 
                value={additionalInstruction}
                onChange={(e) => setAdditionalInstruction(e.target.value)}
                placeholder="e.g. Sleek mobile app layout, split-screen UX card overlays, and dark themed accent highlights."
                className="w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-3 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60 resize-y min-h-20"
              />
            </div>



            {/* Step 5: Active inspirations summary */}
            <div className="rounded-lg border border-[#a3b840]/10 bg-[#111310]/50 p-4">
              <div className="flex justify-between text-xs font-bold text-white/50">
                <span>Inspiration Selected:</span>
                <span className={selectedRefs.length + selectedCustomRefs.length > 0 ? "text-[#c8db5a]" : "text-white/35"}>
                  {selectedRefs.length + selectedCustomRefs.length} / 5 Selected
                </span>
              </div>
              {selectedRefs.length === 0 && selectedCustomRefs.length === 0 && (
                <p className="mt-2 text-xs leading-normal text-white/30">
                  Choose visual references in the gallery or upload custom layouts.
                </p>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedProjectId}
              className="motion-lift mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#a3b840] py-4 text-sm font-bold text-[#111310] shadow-xl shadow-[#a3b840]/10 hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={16} />
              {isGenerating ? "Generating 5 Mockups..." : "Generate 5 Mockups"}
            </button>
          </aside>

          {/* Reference Library & Results Chamber */}
          <div className="flex flex-col gap-8">
            
            {/* Custom Reference Upload */}
            {!isGenerating && !showResultsView && (
              <section className="rounded-xl border border-white/8 bg-[#171914] p-5 shadow-xl shadow-black/25">
                <div className="border-b border-white/5 pb-4">
                  <h2 className="text-lg font-bold text-[#f3f4ec]">
                    Custom Reference Upload
                  </h2>
                  <p className="text-xs text-white/40">Upload your own layout images as styling guides</p>
                </div>
                <div className="mt-4">
                  <div className="relative flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#111310] p-6 text-center transition hover:border-[#a3b840]/30 min-h-28">
                    <input
                      accept="image/*"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      disabled={isUploadingCustomRef}
                      onChange={handleCustomFileUpload}
                      type="file"
                    />
                    <div className="pointer-events-none">
                      <p className="text-sm font-semibold text-white/70">
                        {isUploadingCustomRef ? "Uploading..." : "Drag & drop or click to upload"}
                      </p>
                      <p className="mt-1 text-xs text-white/35">JPEG, PNG, WebP (max 10MB each)</p>
                    </div>
                  </div>
                  {customReferences.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {customReferences.map((ref) => {
                        const active = selectedCustomRefs.includes(ref.url);
                        return (
                          <button
                            key={ref.id}
                            type="button"
                            onClick={() => toggleCustomRef(ref.url)}
                            className={`group relative overflow-hidden rounded-lg border transition ${
                              active
                                ? "border-[#a3b840] shadow-md shadow-[#a3b840]/5"
                                : "border-white/10 hover:border-white/20"
                            }`}
                          >
                            <img
                              src={ref.url}
                              alt={ref.title}
                              className="w-full aspect-[4/3] object-cover transition duration-300 group-hover:scale-105"
                            />
                            {active && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#a3b840] text-[#111310]">
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                              <p className="truncate text-[10px] text-white/90 font-semibold">{ref.title}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Visual References Gallery (Simplified, database-driven) */}
            {!isGenerating && !showResultsView && (
              <section className="rounded-xl border border-white/8 bg-[#171914] p-5 shadow-xl shadow-black/25">
                <div className="border-b border-white/5 pb-4">
                  <h2 className="text-lg font-bold text-[#f3f4ec]">
                    Visual Inspiration Gallery
                  </h2>
                  <p className="text-xs text-white/40">Select up to 5 layouts to steer gpt-image-2 generator</p>
                </div>

                {/* References Cards Grid */}
                <div 
                  onScroll={handleScroll}
                  style={{ height: '600px', maxHeight: '600px' }}
                  className="mt-5 overflow-y-auto pr-2 canvas-scrollbar block w-full relative"
                >
                  <div className="columns-2 sm:columns-3 gap-4">
                  {references.map(ref => {
                    const active = selectedRefs.includes(ref.id);
                    return (
                      <button
                        key={ref.id}
                        onClick={() => toggleReference(ref.id)}
                        className={`break-inside-avoid mb-4 block group relative overflow-hidden rounded-xl border transition duration-300 w-full ${
                          active 
                            ? "border-[#a3b840] shadow-xl shadow-[#a3b840]/5" 
                            : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <img 
                          src={ref.image_url} 
                          alt={ref.title || "Inspiration"} 
                          className="w-full h-auto block transition duration-500 group-hover:scale-105"
                        />
                        
                        {active && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#a3b840] text-[#111310] shadow-lg">
                              <Check size={18} strokeWidth={3} />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  </div>
                  
                  {isLoadingMoreRefs && (
                    <div className="flex flex-col items-center justify-center py-4 text-white/45 border-t border-white/5 w-full">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#a3b840]/25 border-t-[#a3b840]"></div>
                      <p className="mt-2 text-[10px] text-white/35 font-mono">Loading next blueprints...</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Live Notices */}
            {notice && (
              <div className="rounded-xl border border-[#a3b840]/20 bg-[#a3b840]/5 p-4 text-sm text-[#c8db5a] flex items-center gap-3">
                <Info size={16} className="shrink-0" />
                <span>{notice}</span>
              </div>
            )}
            {errorNotice && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 flex items-center gap-3">
                <Info size={16} className="shrink-0" />
                <span>{errorNotice}</span>
              </div>
            )}

            {/* Generated Mockups Chamber */}
            {isGenerating && (
              <div className="rounded-xl border border-white/8 bg-[#171914] p-8 shadow-xl shadow-black/25">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative h-16 w-16">
                    <div className="absolute inset-0 rounded-full border-4 border-[#a3b840]/10 border-t-[#a3b840] animate-spin"></div>
                    <div className="absolute inset-2 rounded-full bg-[#111310] flex items-center justify-center">
                      <Sparkles className="text-[#a3b840] animate-pulse" size={24} />
                    </div>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[#f3f4ec]">Assembling Design Mockups</h3>
                  <p className="mt-2 text-xs text-white/40 max-w-sm">
                    OpenAI gpt-image-2 is busy mapping color themes and styling rules across 5 discrete options. This takes about 10-15 seconds.
                  </p>
                  
                  {/* Glassmorphic progress shimmers */}
                  <div className="mt-6 grid grid-cols-2 gap-4 w-full max-w-lg sm:grid-cols-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="rounded-lg bg-[#111310]/60 border border-white/5 relative overflow-hidden"
                        style={{ aspectRatio: "9/16" }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer"></div>
                        <div className="absolute bottom-2 left-2 right-2 h-3 bg-white/5 rounded"></div>
                      </div>
                    ))}
                  </div>


                </div>
              </div>
            )}

            {showResultsView && mockupOptions.length > 0 && (
              <section className="rounded-xl border border-white/8 bg-[#171914] p-5 shadow-xl shadow-black/25">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h2 className="text-lg font-bold text-[#f3f4ec]">
                    Generated Options (5)
                  </h2>
                  <button
                    onClick={() => setShowResultsView(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-bold text-[#e8eae0] border border-white/10 transition"
                  >
                    <ArrowLeft size={14} />
                    <span>Go Back</span>
                  </button>
                </div>
                
                <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {mockupOptions.map((opt, idx) => (
                    <div 
                      key={idx}
                      className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#111310]/60 transition duration-300 hover:border-white/20"
                    >

                      <div 
                        className="relative w-full bg-black/40 overflow-hidden"
                        style={{ aspectRatio: "9/16" }}
                      >

                        <img 
                          src={opt.url} 
                          alt={`Option ${idx + 1}`} 
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />

                        
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 transition duration-300 group-hover:opacity-100 flex items-center justify-center gap-3">
                          <button
                            onClick={() => setLightboxIndex(idx)}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition"
                            title="Preview Fullscreen"
                          >
                            <Eye size={16} />
                          </button>
                          <a
                            href={opt.url}
                            download={`hero-mockup-option-${idx + 1}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition"
                            title="Download Raw Image"
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      </div>

                      <div className="p-4 border-t border-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-[#f3f4ec]">Layout Option {idx + 1}</p>
                          <p className="text-[10px] text-white/40 mt-0.5 truncate max-w-[150px]">
                            {visualStyles[idx]}
                          </p>
                        </div>

                        <button
                          onClick={() => handleSaveMockup(idx)}
                          disabled={opt.saved || isSavingIndex === idx}
                          className={`rounded-lg px-3 py-2 text-xs font-extrabold flex items-center gap-1.5 transition ${
                            opt.saved
                              ? "bg-white/5 text-[#a3b840] border border-[#a3b840]/25 cursor-default"
                              : "bg-[#a3b840] text-[#111310] hover:bg-[#c8db5a]"
                          }`}
                        >
                          {isSavingIndex === idx ? (
                            <span>Saving...</span>
                          ) : opt.saved ? (
                            <>
                              <Check size={12} strokeWidth={3} />
                              <span>Saved</span>
                            </>
                          ) : (
                            <span>Save to Project</span>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        </section>

      </div>

      {/* Fullscreen Lightbox Portal */}
      {lightboxIndex !== null && (
        <Lightbox
          imageUrl={mockupOptions[lightboxIndex].url}
          isEditingImage={isEditingMockup}
          onAiEdit={async (instruction) => {
            setIsEditingMockup(true);
            try {
              const option = mockupOptions[lightboxIndex];
              const res = await fetch("/api/hero-generator/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageUrl: option.url,
                  projectId: selectedProjectId,
                  instruction,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || data.details || "Edit failed.");
              const newOption: MockupOption = {
                url: data.imageUrl,
                prompt: data.prompt,
              };
              setMockupOptions((prev) => {
                const next = [...prev, newOption];
                setLightboxIndex(next.length - 1);
                return next;
              });
              setNotice("AI edit complete! New option shown.");
              setTimeout(() => setNotice(""), 4000);
              return data.imageUrl;
            } catch (err) {
              setErrorNotice(err instanceof Error ? err.message : String(err));
              return "";
            } finally {
              setIsEditingMockup(false);
            }
          }}
          onClose={() => { setLightboxIndex(null); setErrorNotice(""); }}
        >
          <div className="mt-4 w-full rounded-xl border border-white/5 bg-[#111310]/80 p-5 backdrop-blur-md text-[#f4f6ea] max-w-full">
            <p className="font-extrabold text-[#f3f4ec]">AI generation prompt used:</p>
            <p className="text-xs text-white/50 mt-2 font-mono leading-relaxed bg-[#111310] p-3 rounded-lg border border-white/5 whitespace-pre-wrap break-all">
              {mockupOptions[lightboxIndex].prompt}
            </p>
          </div>
        </Lightbox>
      )}

    </main>
  );
}
