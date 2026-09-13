"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { 
  Sparkles, Check, Eye, Download, Info, Search, ChevronDown, ArrowLeft, Image as ImageIcon, X, AtSign
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

type InstructionImage = {
  id: string;
  index: number;
  label: string;
  url: string;
  fileName: string;
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
  const [generationMode, setGenerationMode] = useState<"project" | "adhoc">("project");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [adhocName, setAdhocName] = useState<string>("");
  const [adhocDetails, setAdhocDetails] = useState<string>("");
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [themePreference, setThemePreference] = useState<"light" | "dark" | "both">("both");
  const [accentColor, setAccentColor] = useState<string>("#a3b840");
  const [customLogoUrl, setCustomLogoUrl] = useState<string>("");
  const [additionalInstruction, setAdditionalInstruction] = useState<string>("");

  // Instruction Images (Product photos, contextual screenshots) and Mention Dropdown
  const [instructionImages, setInstructionImages] = useState<InstructionImage[]>([]);
  const [isUploadingInstructionImages, setIsUploadingInstructionImages] = useState(false);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionMenuRef = useRef<HTMLDivElement | null>(null);

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
  const [isPolling, setIsPolling] = useState(false);
  const [isSavingIndex, setIsSavingIndex] = useState<number | null>(null);
  const [isEditingMockup, setIsEditingMockup] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [errorNotice, setErrorNotice] = useState<string>("");

  const jobIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

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

  // Upload contextual images (product photos, screenshot references) for additional instruction
  async function handleInstructionImagesUpload(files: FileList | File[]) {
    if (!files || files.length === 0) return;
    setIsUploadingInstructionImages(true);
    try {
      const fileArray = Array.from(files);
      const newImages: InstructionImage[] = [];
      let currentIndex = instructionImages.length;

      for (const file of fileArray) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/hero-generator/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Upload failed for ${file.name}`);

        currentIndex += 1;
        newImages.push({
          id: `inst-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          index: currentIndex,
          label: `@Image ${currentIndex}`,
          url: data.url,
          fileName: file.name,
        });
      }

      setInstructionImages(prev => [...prev, ...newImages]);
      setNotice(`Uploaded ${newImages.length} context image${newImages.length > 1 ? "s" : ""}.`);
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      console.error("Instruction images upload error", err);
      setErrorNotice(err instanceof Error ? err.message : "Failed to upload image(s).");
    } finally {
      setIsUploadingInstructionImages(false);
    }
  }

  function removeInstructionImage(id: string) {
    setInstructionImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      return filtered.map((img, idx) => ({
        ...img,
        index: idx + 1,
        label: `@Image ${idx + 1}`,
      }));
    });
  }

  function insertMention(label: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setAdditionalInstruction(prev => prev ? `${prev} ${label} ` : `${label} `);
      setMentionMenuOpen(false);
      return;
    }

    const value = textarea.value;
    const cursorPos = textarea.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    let newText = "";
    let newCursorPos = cursorPos;

    if (atIndex !== -1 && atIndex >= cursorPos - 25) {
      const textAfterCursor = value.slice(cursorPos);
      newText = textBeforeCursor.slice(0, atIndex) + `${label} ` + textAfterCursor;
      newCursorPos = atIndex + label.length + 1;
    } else {
      const before = value.slice(0, cursorPos);
      const after = value.slice(cursorPos);
      const spaceBefore = before.length > 0 && !before.endsWith(" ") ? " " : "";
      newText = before + spaceBefore + `${label} ` + after;
      newCursorPos = cursorPos + spaceBefore.length + label.length + 1;
    }

    setAdditionalInstruction(newText);
    setMentionMenuOpen(false);
    setMentionFilter("");

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }

  function handleAdditionalInstructionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setAdditionalInstruction(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!/\s/.test(query)) {
        setMentionFilter(query);
        setMentionMenuOpen(true);
        setSelectedMentionIdx(0);
        return;
      }
    }
    setMentionMenuOpen(false);
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionMenuOpen) return;

    const filtered = instructionImages.filter(img => 
      img.label.toLowerCase().includes(mentionFilter.toLowerCase()) ||
      img.fileName.toLowerCase().includes(mentionFilter.toLowerCase()) ||
      String(img.index).includes(mentionFilter)
    );

    if (filtered.length === 0) {
      if (e.key === "Escape") {
        setMentionMenuOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIdx(prev => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIdx(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const target = filtered[selectedMentionIdx] || filtered[0];
      if (target) {
        insertMention(target.label);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionMenuOpen(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setMentionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredMentionImages = instructionImages.filter(img => 
    img.label.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    img.fileName.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    String(img.index).includes(mentionFilter)
  );

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

  useEffect(() => {
    if (!isPolling) return;

    pollingRef.current = setInterval(async () => {
      const ids = Array.from(jobIdsRef.current);
      if (ids.length === 0) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setIsPolling(false);
        return;
      }

      let allDone = true;

      for (const jobId of ids) {
        try {
          const res = await fetch(`/api/hero-generator/jobs/${jobId}`);
          if (!res.ok) {
            jobIdsRef.current.delete(jobId);
            console.error(`Job ${jobId} not found.`);
            continue;
          }
          const data = await res.json();
          const job = data.job;

          if (job.status === "completed") {
            jobIdsRef.current.delete(jobId);
            if (job.result?.options) {
              setMockupOptions(prev => {
                const existingUrls = new Set(prev.map(o => o.url));
                const newOptions = job.result.options.filter((o: { url: string }) => !existingUrls.has(o.url));
                return newOptions.length > 0 ? [...prev, ...newOptions] : prev;
              });
            }
          } else if (job.status === "failed") {
            jobIdsRef.current.delete(jobId);
            setErrorNotice(job.error || "Generation failed.");
          } else {
            allDone = false;
          }
        } catch (err) {
          console.error(`Failed to poll job ${jobId}:`, err);
          allDone = false;
        }
      }

      if (allDone || jobIdsRef.current.size === 0) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setIsPolling(false);
        setNotice("Successfully generated options!");
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isPolling]);

  async function handleGenerate() {
    setErrorNotice("");
    setNotice("Crafting layout prompts and launching generator...");
    setMockupOptions([]);
    setShowResultsView(true);

    try {
      let itemsToProcess: { type: "db" | "custom", idOrUrl: string }[] = [];

      selectedRefs.forEach(id => itemsToProcess.push({ type: "db", idOrUrl: id }));
      selectedCustomRefs.forEach(url => itemsToProcess.push({ type: "custom", idOrUrl: url }));

      if (itemsToProcess.length === 0) {
         references.slice(0, 5).forEach(r => itemsToProcess.push({ type: "db", idOrUrl: r.id }));
      }

      itemsToProcess = itemsToProcess.slice(0, 5);
      const jobIds: string[] = [];

      for (const item of itemsToProcess) {
        const payload = generationMode === "project" ? {
          projectId: selectedProjectId,
          referenceIds: item.type === "db" ? [item.idOrUrl] : [],
          theme: themePreference,
          accentColor,
          logoUrl: customLogoUrl || null,
          additionalInstruction,
          customReferenceUrls: item.type === "custom" ? [item.idOrUrl] : undefined,
          instructionImages: instructionImages.length > 0 ? instructionImages.map(img => ({
            index: img.index,
            label: img.label,
            url: img.url,
            fileName: img.fileName,
          })) : undefined,
        } : {
          adhocName: adhocName.trim() || undefined,
          adhocDetails: adhocDetails.trim() || undefined,
          referenceIds: item.type === "db" ? [item.idOrUrl] : [],
          theme: themePreference,
          accentColor,
          logoUrl: customLogoUrl || null,
          additionalInstruction,
          customReferenceUrls: item.type === "custom" ? [item.idOrUrl] : undefined,
          instructionImages: instructionImages.length > 0 ? instructionImages.map(img => ({
            index: img.index,
            label: img.label,
            url: img.url,
            fileName: img.fileName,
          })) : undefined,
        };

        const response = await fetch("/api/hero-generator/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const textResponse = await response.text();
        let data;
        try {
          data = JSON.parse(textResponse);
        } catch (e) {
          console.error(`Generation failed with non-JSON response:`, textResponse.substring(0, 500));
          throw new Error(`Server returned an invalid response (not JSON). Response: ${textResponse.substring(0, 100)}...`);
        }

        if (!response.ok) {
          console.error(`Generation failed:`, data);
          throw new Error(data.details ? `${data.error} Details: ${data.details}` : data.error || `Failed to generate mockup.`);
        }

        if (data.jobId) {
          jobIds.push(data.jobId);
        }
      }

      if (jobIds.length === 0) {
        throw new Error("No generation jobs were created.");
      }

      jobIdsRef.current = new Set(jobIds);
      setIsPolling(true);
      setNotice("Generating mockups in background... Results will appear soon.");

    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : String(err));
      setNotice("");
    }
  }

  async function handleSaveMockup(optionIndex: number) {
    const option = mockupOptions[optionIndex];
    if (option.saved || generationMode === "adhoc") return;

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
              Select existing projects or generate ad hoc mockups on-the-fly with custom parameters.
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

            {/* Step 1: Generation Mode & Project / Ad-Hoc Setup */}
            <div className="flex flex-col gap-3">
              <div className="flex rounded-lg border border-white/10 bg-[#111310] p-1">
                <button
                  type="button"
                  onClick={() => setGenerationMode("project")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                    generationMode === "project"
                      ? "bg-[#a3b840] text-[#111310] shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Existing Project
                </button>
                <button
                  type="button"
                  onClick={() => setGenerationMode("adhoc")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                    generationMode === "adhoc"
                      ? "bg-[#a3b840] text-[#111310] shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Ad-Hoc Generation
                </button>
              </div>

              {generationMode === "project" ? (
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
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                        Project / Brand Name
                      </label>
                      <span className="text-[10px] font-mono text-white/35">Optional</span>
                    </div>
                    <input
                      type="text"
                      value={adhocName}
                      onChange={(e) => setAdhocName(e.target.value)}
                      placeholder="e.g. Acme SaaS (Optional)"
                      className="rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                      Project Details / Context
                    </label>
                    <textarea
                      value={adhocDetails}
                      onChange={(e) => setAdhocDetails(e.target.value)}
                      placeholder="e.g. Next-gen AI analytics tool for enterprise teams. Sleek dark dashboard layout."
                      className="w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-2.5 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60 resize-y min-h-16"
                    />
                  </div>
                </div>
              )}
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
                {generationMode === "project" && activeProject?.accent_color && (
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

            {/* Step 5: Additional Instruction & Product / Context Images */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wider uppercase text-white/45">
                  5. Additional Instruction & Images
                </label>
                <label className={`inline-flex items-center gap-1.5 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition border ${isUploadingInstructionImages ? "bg-white/10 border-white/20 text-white/40" : "bg-[#a3b840]/10 border-[#a3b840]/30 text-[#c8db5a] hover:bg-[#a3b840]/20"}`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={isUploadingInstructionImages}
                    onChange={(e) => {
                      if (e.target.files) {
                        handleInstructionImagesUpload(e.target.files);
                        e.target.value = "";
                      }
                    }}
                  />
                  <span>{isUploadingInstructionImages ? "Uploading..." : "+ Upload Image(s)"}</span>
                </label>
              </div>

              {/* Uploaded Instruction Images Preview Gallery */}
              {instructionImages.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#161814] p-3">
                  <div className="flex items-center justify-between text-[11px] text-white/40 pb-1 border-b border-white/5">
                    <span>Uploaded Context Images (click tag to insert mention):</span>
                    <span className="text-[#a3b840] font-mono font-bold">{instructionImages.length} image{instructionImages.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {instructionImages.map((img) => (
                      <div
                        key={img.id}
                        className="group flex items-center gap-2 rounded-lg border border-white/10 bg-[#0e100d] px-2.5 py-1.5 text-xs transition hover:border-[#a3b840]/60"
                      >
                        <img
                          src={img.url}
                          alt={img.fileName}
                          className="h-7 w-7 rounded-md object-cover border border-white/10 flex-shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => insertMention(img.label)}
                          className="font-mono font-bold text-[#c8db5a] hover:underline"
                          title={`Click to insert ${img.label} into instruction`}
                        >
                          {img.label}
                        </button>
                        <span className="max-w-[110px] truncate text-[11px] text-white/40" title={img.fileName}>
                          {img.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInstructionImage(img.id)}
                          className="text-white/30 hover:text-red-400 transition ml-1 px-1 font-bold text-sm"
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Textarea with @ mention autocomplete dropdown */}
              <div className="relative">
                <textarea 
                  ref={textareaRef}
                  value={additionalInstruction}
                  onChange={handleAdditionalInstructionChange}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="e.g. Sleek split layout. Place @Image 1 in the hero showcase card, and use @Image 2 as the secondary feature badge."
                  className="w-full rounded-lg border border-white/10 bg-[#111310] px-4 py-3 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/60 resize-y min-h-24"
                />

                {/* Autocomplete Dropdown Popup */}
                {mentionMenuOpen && (
                  <div
                    ref={mentionMenuRef}
                    className="absolute left-0 bottom-full mb-2 z-50 w-full max-w-sm rounded-xl border border-[#a3b840]/30 bg-[#151713] p-2 shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/40 border-b border-white/10 mb-1">
                      <span>Mention Reference Image</span>
                      <span className="text-[10px] text-white/30">↑↓ Navigate • Enter to select</span>
                    </div>
                    {filteredMentionImages.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredMentionImages.map((img, idx) => (
                          <div
                            key={img.id}
                            onClick={() => insertMention(img.label)}
                            onMouseEnter={() => setSelectedMentionIdx(idx)}
                            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer transition ${
                              selectedMentionIdx === idx
                                ? "bg-[#a3b840]/20 text-[#f3f4ec] border border-[#a3b840]/40"
                                : "text-white/70 hover:bg-white/5 border border-transparent"
                            }`}
                          >
                            <img
                              src={img.url}
                              alt={img.fileName}
                              className="h-8 w-8 rounded-md object-cover border border-white/10 flex-shrink-0"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-xs font-bold text-[#c8db5a]">
                                {img.label}
                              </span>
                              <span className="text-[11px] text-white/40 truncate">
                                {img.fileName}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-3 text-xs text-white/50 flex flex-col gap-2">
                        <span>
                          {instructionImages.length === 0
                            ? "No instruction images uploaded yet."
                            : "No matching uploaded images."}
                        </span>
                        <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer rounded-md bg-[#a3b840]/10 border border-[#a3b840]/30 px-3 py-1.5 text-xs font-semibold text-[#c8db5a] hover:bg-[#a3b840]/20">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files) {
                                handleInstructionImagesUpload(e.target.files);
                                e.target.value = "";
                              }
                            }}
                          />
                          + Upload Image Now
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-white/35">
                <span>Tip: Type <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono text-[10px]">@</kbd> to mention product or contextual photos in your prompt.</span>
              </div>
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
              disabled={isPolling || (generationMode === "project" && !selectedProjectId)}
              className="motion-lift mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#a3b840] py-4 text-sm font-bold text-[#111310] shadow-xl shadow-[#a3b840]/10 hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={16} />
              {isPolling ? "Generating 5 Mockups..." : "Generate 5 Mockups"}
            </button>
          </aside>

          {/* Reference Library & Results Chamber */}
          <div className="flex flex-col gap-8">

            
            {/* Custom Reference Upload */}
            {!isPolling && !showResultsView && (
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
            {!isPolling && !showResultsView && (
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
            {isPolling && (
              <div className="rounded-xl border border-white/8 bg-[#171914] p-8 shadow-xl shadow-black/25">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative h-16 w-16">
                    <div className="absolute inset-0 rounded-full border-4 border-[#a3b840]/10 border-t-[#a3b840] animate-spin"></div>
                    <div className="absolute inset-2 rounded-full bg-[#111310] flex items-center justify-center">
                      <Sparkles className="text-[#a3b840] animate-pulse" size={24} />
                    </div>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[#f3f4ec]">Generating Design Mockups</h3>
                  <p className="mt-2 text-xs text-white/40 max-w-sm">
                    gpt-image-2 is generating your mockups in the background. Results will appear as each one completes.
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

                        {generationMode === "project" && selectedProjectId ? (
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
                        ) : (
                          <span className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-white/40">
                            Ad-Hoc One-Off
                          </span>
                        )}
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
