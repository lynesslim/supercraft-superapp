"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GeneratedSitemap, SitemapNodeData } from "@/types/sitemap";
import type { MouseEvent as ReactMouseEvent } from "react";
import BackButton from "@/app/BackButton";

type CanvasNodeData = SitemapNodeData & {
  copyPreview?: string;
  copyStatus?: "saved" | "unsaved" | "none";
  onEditNode?: (nodeId: string) => void;
};

type GenerateResponse = {
  brief?: string;
  projectId?: string;
  sitemapId: string;
  sitemap: GeneratedSitemap;
  nodes: Node<SitemapNodeData>[];
  edges: Edge[];
  error?: string;
};

export type PageCopy = {
  id: string;
  page_name: string;
  url_path: string;
  content: string | null;
  updated_at: string;
  page_id?: string;
};

type CopyResponse = {
  copy?: PageCopy;
  copies?: PageCopy[];
  content?: string;
  error?: string;
};

type SaveSitemapResponse = {
  brief?: string;
  error?: string;
  ok?: boolean;
  projectId?: string;
  sitemapId?: string;
};

export type ProjectOption = {
  hasIncompleteDocuments?: boolean;
  id: string;
  name: string;
  sitemapId?: string;
};

type RefineMode =
  | "regenerate"
  | "regenerate-selection"
  | "paraphrase"
  | "shorten"
  | "expand"
  | "change-tone"
  | "bullet-points";

type SitemapGraphProps = {
  initialBrief?: string;
  initialCopies?: PageCopy[];
  initialEdges?: Edge[];
  initialNodes?: Node<SitemapNodeData>[];
  initialProjectHasIncompleteDocuments?: boolean;
  initialProjectId?: string;
  initialProjectName?: string;
  initialProjects?: ProjectOption[];
  initialSitemapId?: string;
};

const SITEMAP_LOADING_MESSAGES = [
  "📄 Reading project context...",
  "🧭 Planning the page hierarchy...",
  "🧩 Mapping sections and pages...",
  "🌿 Arranging the canvas...",
  "💾 Saving the sitemap...",
];

const SITEMAP_PDF_LOADING_MESSAGES = [
  "📄 Reading project context...",
  "🔎 Extracting useful PDF details...",
  "🧭 Planning the page hierarchy...",
  "🧩 Mapping sections and pages...",
  "🌿 Arranging the canvas...",
  "💾 Saving the sitemap...",
];

const COPY_GENERATION_MESSAGES = [
  "📄 Reading the client context...",
  "🧭 Planning this page...",
  "✍️ Writing the first draft...",
  "✨ Polishing the structure...",
  "💾 Saving copy...",
];

const SAVE_COPY_MESSAGES = ["💾 Saving copy...", "✅ Updating saved draft..."];

const REFINE_LOADING_MESSAGES: Record<RefineMode, string[]> = {
  regenerate: ["🔄 Regenerating copy...", "✨ Polishing the full draft..."],
  "regenerate-selection": ["🔄 Rewriting selected text...", "✨ Fitting it back into place..."],
  paraphrase: ["✍️ Paraphrasing selected text...", "✨ Preserving the meaning..."],
  shorten: ["✂️ Shortening selected text...", "✨ Keeping the core message..."],
  expand: ["➕ Expanding selected text...", "✨ Adding useful detail..."],
  "change-tone": ["🎚️ Adjusting tone...", "✨ Matching your feedback..."],
  "bullet-points": ["• Turning selection into bullet points...", "✨ Tightening the list..."],
};

// ─── Section pill colours (dark-safe) ────────────────────────────────────────
const SECTION_COLORS = [
  "bg-[#a3b840]/15 text-[#c8db5a]",
  "bg-sky-900/40 text-sky-300",
  "bg-violet-900/40 text-violet-300",
  "bg-rose-900/40 text-rose-300",
  "bg-amber-900/40 text-amber-300",
];

// ─── Node Card ────────────────────────────────────────────────────────────────
function SitemapNode({ data, id, selected }: NodeProps<Node<CanvasNodeData>>) {
  const sections = data.sections ?? [];
  const isRoot = data.path === "/";

  return (
    <div
      className={`w-52 rounded-2xl border shadow-xl transition-all ${
        selected
          ? "border-[#a3b840] shadow-[#a3b840]/25"
          : isRoot
          ? "border-[#3d4232] shadow-black/40"
          : "border-[#2d2e28] shadow-black/30"
      } ${isRoot ? "bg-[#1e221a]" : "bg-[#222420]"}`}
    >
      <Handle
        className="!h-2 !w-2 !border-2 !border-[#222420] !bg-[#a3b840]"
        position={Position.Top}
        type="target"
      />

      {/* Header */}
      <div className="border-b border-white/8 px-3 pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`text-sm font-bold leading-tight tracking-[-0.02em] ${
              isRoot ? "text-[#a3b840]" : "text-[#e8eae0]"
            }`}
          >
            {data.title}
          </h3>
          <button
            aria-label={isRoot ? "Edit project overview context" : "Edit page copy"}
            className="nodrag nopan shrink-0 rounded-md border border-white/10 px-1.5 py-1 text-[10px] font-semibold text-white/40 transition hover:border-[#a3b840]/40 hover:text-[#a3b840]"
            onClick={(event) => {
              event.stopPropagation();
              data.onEditNode?.(id);
            }}
            type="button"
          >
            Edit
          </button>
        </div>
        {!isRoot && data.purpose ? (
          <p className="mt-2 line-clamp-3 text-[10px] leading-4 text-white/45">
            {data.purpose}
          </p>
        ) : null}
      </div>

      {/* Sub-sections */}
      {sections.length > 0 && (
        <div className="flex flex-col gap-1 px-3 py-2">
          {sections.map((section, i) => (
            <div
              key={i}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                SECTION_COLORS[i % SECTION_COLORS.length]
              }`}
            >
              {section}
            </div>
          ))}
        </div>
      )}

      {/* Path pill */}
      <div className="px-3 pb-3 pt-1">
        <span className="inline-block max-w-full truncate rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-medium text-white/35">
          {data.path}
        </span>
      </div>

      {!isRoot && data.copyPreview && (
        <div className="border-t border-white/8 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a3b840]" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-[#a3b840]">
              Copy saved
            </span>
          </div>
          <p className="line-clamp-3 text-[10px] leading-4 text-white/45">
            {data.copyPreview}
          </p>
        </div>
      )}

      <Handle
        className="!h-2 !w-2 !border-2 !border-[#222420] !bg-[#a3b840]"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}

const nodeTypes = { sitemap: SitemapNode };

const NODE_WIDTH = 220;
const NODE_H_GAP = 40;
const NODE_V_GAP = 180;
const ROOT_ID = "sitemap-root";

type ContextMenuState =
  | { type: "pane"; x: number; y: number; flowPosition: XYPosition }
  | { type: "node"; x: number; y: number; nodeId: string }
  | { type: "edge"; x: number; y: number; edgeId: string };

type CopySelectionMenuState = {
  x: number;
  y: number;
};

type ListDropTarget =
  | { nodeId: string; mode: "before" | "after" | "child" }
  | { nodeId: null; mode: "top" };

type HierarchyItem = {
  node: Node<SitemapNodeData>;
  depth: number;
  parentId: string | null;
};

type GraphSnapshot = {
  edges: Edge[];
  nodes: Node<SitemapNodeData>[];
  selectedId: string;
};

type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "page"
  );
}

function getUniqueId(base: string, nodes: Node<SitemapNodeData>[]) {
  const slug = slugify(base);
  const existingIds = new Set(nodes.map((node) => node.id));
  if (!existingIds.has(slug)) return slug;

  let index = 2;
  while (existingIds.has(`${slug}-${index}`)) index += 1;
  return `${slug}-${index}`;
}

function getParentMap(edges: Edge[]) {
  const parentMap = new Map<string, string>();
  for (const edge of edges) parentMap.set(edge.target, edge.source);
  return parentMap;
}

function getChildrenMap(nodes: Node<SitemapNodeData>[], edges: Edge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  for (const node of nodes) children.set(node.id, []);

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    children.get(edge.source)?.push(edge.target);
  }

  return children;
}

function getHierarchyItems(nodes: Node<SitemapNodeData>[], edges: Edge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = getChildrenMap(nodes, edges);
  const parentMap = getParentMap(edges);
  const items: HierarchyItem[] = [];
  const visited = new Set<string>();
  const rootNode = nodeById.get(ROOT_ID);

  function visit(nodeId: string, depth: number, parentId: string | null) {
    const node = nodeById.get(nodeId);
    if (!node || visited.has(nodeId)) return;

    visited.add(nodeId);
    if (nodeId !== ROOT_ID || nodes.length === 1) {
      items.push({ node, depth, parentId });
    }

    for (const childId of children.get(nodeId) ?? []) {
      visit(childId, nodeId === ROOT_ID && nodes.length > 1 ? 0 : depth + 1, nodeId);
    }
  }

  if (rootNode) visit(ROOT_ID, 0, null);

  for (const node of nodes) {
    if (!visited.has(node.id) && !parentMap.has(node.id)) {
      visit(node.id, 0, null);
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) visit(node.id, 0, parentMap.get(node.id) ?? null);
  }

  return items;
}

function getDescendantIds(nodeId: string, edges: Edge[]) {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
  }

  const descendants = new Set<string>();
  function visit(id: string) {
    for (const childId of children.get(id) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      visit(childId);
    }
  }
  visit(nodeId);
  return descendants;
}

function replaceParentEdge(edges: Edge[], nodeId: string, parentId: string | null) {
  const nextEdges = edges.filter((edge) => edge.target !== nodeId);
  if (!parentId) return nextEdges;

  return [
    ...nextEdges,
    { id: `${parentId}-${nodeId}`, source: parentId, target: nodeId, animated: false },
  ];
}

function orderSiblings(edges: Edge[], parentId: string, orderedIds: string[]) {
  const nextEdges = edges.filter((edge) => edge.source !== parentId);
  return [
    ...nextEdges,
    ...orderedIds.map((targetId) => ({
      id: `${parentId}-${targetId}`,
      source: parentId,
      target: targetId,
      animated: false,
    })),
  ];
}

function getCopyPreview(content: string) {
  return content
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function extractSectionHeadings(content: string | null) {
  if (!content) return [];

  const headings = content
    .split("\n")
    .map((line) => {
      const match = line.match(/^##\s+(?!#)(.+?)\s*#*\s*$/);
      return match?.[1]?.trim();
    })
    .filter((heading): heading is string => Boolean(heading));

  return Array.from(new Set(headings));
}

function applyGeneratedCopySections(
  currentNodes: Node<SitemapNodeData>[],
  nextCopies: PageCopy[],
) {
  const sectionsByNodeId = new Map<string, string[]>();
  const sectionsByPath = new Map<string, string[]>();

  nextCopies.forEach((copy) => {
    const headings = extractSectionHeadings(copy.content);
    if (copy.page_id) sectionsByNodeId.set(copy.page_id, headings);
    sectionsByPath.set(copy.url_path, headings);
  });

  if (sectionsByNodeId.size === 0 && sectionsByPath.size === 0) {
    return currentNodes;
  }

  return currentNodes.map((node) => {
    const sections = sectionsByNodeId.get(node.id) ?? sectionsByPath.get(node.data.path);
    return sections ? { ...node, data: { ...node.data, sections } } : node;
  });
}

function formatSitemapCode(items: HierarchyItem[]) {
  return items
    .map(({ node, depth }) =>
      depth === 0 ? `- ${node.data.title}` : `${"---".repeat(depth)}${node.data.title}`,
    )
    .join("\n");
}

function parseSitemapCode(code: string) {
  return code
    .split("\n")
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return null;

      const nestedPrefix = line.match(/^(---)+/);
      if (nestedPrefix) {
        return {
          depth: nestedPrefix[0].length / 3,
          title: line.slice(nestedPrefix[0].length).replace(/^-\s*/, "").trim(),
        };
      }

      return { depth: 0, title: line.replace(/^-\s*/, "").trim() };
    })
    .filter((line): line is { depth: number; title: string } => Boolean(line?.title));
}

function layoutSitemapNodes(nodes: Node<SitemapNodeData>[], edges: Edge[]) {
  if (nodes.length === 0) return nodes;

  const nodeIds = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const incoming = new Map<string, number>();

  for (const node of nodes) {
    children.set(node.id, []);
    incoming.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    children.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const roots = [
    ...nodes.filter((node) => node.id === ROOT_ID).map((node) => node.id),
    ...nodes
      .filter((node) => node.id !== ROOT_ID && (incoming.get(node.id) ?? 0) === 0)
      .map((node) => node.id),
  ];

  const orderedRoots = roots.length > 0 ? roots : [nodes[0].id];
  const subtreeWidth = new Map<string, number>();
  const visiting = new Set<string>();

  function calcWidth(id: string): number {
    if (visiting.has(id)) return NODE_WIDTH;
    visiting.add(id);

    const kids = (children.get(id) ?? []).filter((kid) => nodeIds.has(kid));
    if (kids.length === 0) {
      subtreeWidth.set(id, NODE_WIDTH);
      visiting.delete(id);
      return NODE_WIDTH;
    }

    const total = kids.reduce(
      (sum, kid) => sum + calcWidth(kid) + NODE_H_GAP,
      -NODE_H_GAP,
    );
    subtreeWidth.set(id, Math.max(total, NODE_WIDTH));
    visiting.delete(id);
    return subtreeWidth.get(id)!;
  }

  const positions = new Map<string, XYPosition>();
  const assigned = new Set<string>();

  function assignPositions(id: string, centerX: number, depth: number) {
    if (assigned.has(id)) return;
    assigned.add(id);
    positions.set(id, { x: centerX - NODE_WIDTH / 2, y: depth * NODE_V_GAP });

    const kids = (children.get(id) ?? []).filter((kid) => nodeIds.has(kid));
    if (kids.length === 0) return;

    const totalWidth = kids.reduce(
      (sum, kid) => sum + (subtreeWidth.get(kid) ?? NODE_WIDTH) + NODE_H_GAP,
      -NODE_H_GAP,
    );
    let cursor = centerX - totalWidth / 2;
    for (const kid of kids) {
      const width = subtreeWidth.get(kid) ?? NODE_WIDTH;
      assignPositions(kid, cursor + width / 2, depth + 1);
      cursor += width + NODE_H_GAP;
    }
  }

  let rootCursor = 0;
  for (const rootId of orderedRoots) {
    const width = calcWidth(rootId);
    assignPositions(rootId, rootCursor + width / 2, 0);
    rootCursor += width + NODE_H_GAP * 3;
  }

  for (const node of nodes) {
    if (assigned.has(node.id)) continue;
    positions.set(node.id, { x: rootCursor, y: 0 });
    assigned.add(node.id);
    rootCursor += NODE_WIDTH + NODE_H_GAP * 3;
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

function getEventClientPosition(event: MouseEvent | TouchEvent) {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  return {
    x: event.changedTouches[0]?.clientX ?? 0,
    y: event.changedTouches[0]?.clientY ?? 0,
  };
}

function copyKeyFor(node: Node<SitemapNodeData>) {
  return node.data.path;
}

function replaceSelectedText(content: string, selection: { start: number; end: number }, nextText: string) {
  return `${content.slice(0, selection.start)}${nextText}${content.slice(selection.end)}`;
}

function cloneGraphSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      data: { ...node.data, sections: node.data.sections ? [...node.data.sections] : undefined },
      position: { ...node.position },
    })),
    selectedId: snapshot.selectedId,
  };
}

function getGraphSignature(snapshot: GraphSnapshot) {
  return JSON.stringify({
    edges: snapshot.edges.map((edge) => ({
      animated: edge.animated,
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
    nodes: snapshot.nodes.map((node) => ({
      data: node.data,
      id: node.id,
      position: node.position,
      type: node.type,
    })),
    selectedId: snapshot.selectedId,
  });
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function upsertProjectOption(
  options: ProjectOption[],
  nextProject: ProjectOption,
) {
  const existingIndex = options.findIndex((option) => option.id === nextProject.id);

  if (existingIndex === -1) {
    return [nextProject, ...options].sort((a, b) => a.name.localeCompare(b.name));
  }

  return options.map((option) =>
    option.id === nextProject.id ? { ...option, ...nextProject } : option,
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SitemapGraph({
  initialBrief = "",
  initialCopies = [],
  initialEdges = [],
  initialNodes = [],
  initialProjectHasIncompleteDocuments = false,
  initialProjectId = "",
  initialProjectName = "Sitemap Canvas",
  initialProjects = [],
  initialSitemapId = "",
}: SitemapGraphProps) {
  const router = useRouter();
  const [brief, setBrief] = useState(initialBrief);
  const [pdf, setPdf] = useState<File | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [sitemapId, setSitemapId] = useState(initialSitemapId);
  const [projectName, setProjectName] = useState(initialProjectName);
  const [projectOptions, setProjectOptions] = useState(initialProjects);
  const [strategy, setStrategy] = useState("");
  const [notice, setNotice] = useState("");
  const [copyNotice, setCopyNotice] = useState("Select a page to generate or edit copy.");
  const [selectedId, setSelectedId] = useState(initialNodes[0]?.id ?? "");
  const [hasGenerated, setHasGenerated] = useState(initialNodes.length > 0);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SitemapNodeData>>(
    initialNodes.map((node) => ({ ...node, type: "sitemap" })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<Node<SitemapNodeData>, Edge> | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copySelectionMenu, setCopySelectionMenu] = useState<CopySelectionMenuState | null>(null);
  const [listMode, setListMode] = useState<"tree" | "code">("tree");
  const [sitemapCode, setSitemapCode] = useState("");
  const [draggingNodeId, setDraggingNodeId] = useState("");
  const [dropTarget, setDropTarget] = useState<ListDropTarget | null>(null);
  const [isCopyPanelOpen, setIsCopyPanelOpen] = useState(false);
  const [copies, setCopies] = useState(initialCopies);
  const [draftsByPath, setDraftsByPath] = useState<Record<string, string>>(() =>
    initialCopies.reduce<Record<string, string>>((accumulator, copy) => {
      accumulator[copy.url_path] = copy.content ?? "";
      return accumulator;
    }, {}),
  );
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackMode, setFeedbackMode] = useState<RefineMode | null>(null);
  const [contextPdf, setContextPdf] = useState<File | null>(null);
  const [activeCopyAction, setActiveCopyAction] = useState<string | null>(null);
  const [activeRefineMode, setActiveRefineMode] = useState<RefineMode | null>(null);
  const [sitemapLoadingIndex, setSitemapLoadingIndex] = useState(0);
  const [copyLoadingIndex, setCopyLoadingIndex] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(initialSitemapId ? new Date() : null);
  const [autosaveError, setAutosaveError] = useState("");
  const [historyDepth, setHistoryDepth] = useState(0);
  const [isExportingWordDoc, setIsExportingWordDoc] = useState(false);
  const [isSavingContext, startSavingContext] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isCopyWorking, startCopyWork] = useTransition();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const copyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<GraphSnapshot[]>([]);
  const historySignatureRef = useRef("");
  const isUndoingRef = useRef(false);
  const graphRef = useRef<GraphSnapshot>({
    edges: initialEdges,
    nodes: initialNodes.map((node) => ({ ...node, type: "sitemap" })),
    selectedId: initialNodes[0]?.id ?? "",
  });
  const sitemapIdRef = useRef(initialSitemapId);
  const projectIdRef = useRef(initialProjectId);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const didMountAutosaveRef = useRef(false);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId),
    [nodes, selectedId],
  );

  const copyByPath = useMemo(() => {
    return copies.reduce<Record<string, PageCopy>>((accumulator, copy) => {
      accumulator[copy.url_path] = copy;
      return accumulator;
    }, {});
  }, [copies]);

  const selectedPath = selectedNode ? copyKeyFor(selectedNode) : "";
  const selectedCopy = selectedPath ? copyByPath[selectedPath] : undefined;
  const draft = selectedPath ? draftsByPath[selectedPath] ?? selectedCopy?.content ?? "" : "";
  const hasUnsavedCopy = selectedPath ? dirtyPaths.has(selectedPath) : false;
  const hasCopy = Boolean(draft.trim() || selectedCopy?.content);
  const hasProjectContext = Boolean(brief.trim());
  const activeProject = projectId
    ? projectOptions.find((project) => project.id === projectId)
    : undefined;
  const hasIncompleteProjectDocuments =
    Boolean(projectId) && (activeProject?.hasIncompleteDocuments ?? initialProjectHasIncompleteDocuments);
  const isRootSelected = selectedNode?.id === ROOT_ID;
  const sitemapLoadingMessages = pdf ? SITEMAP_PDF_LOADING_MESSAGES : SITEMAP_LOADING_MESSAGES;
  const sitemapLoadingText = isGenerating
    ? sitemapLoadingMessages[sitemapLoadingIndex % sitemapLoadingMessages.length]
    : "";
  const copyLoadingMessages = useMemo(() => {
    if (activeCopyAction === "Generating") return COPY_GENERATION_MESSAGES;
    if (activeCopyAction === "Saving") return SAVE_COPY_MESSAGES;
    if (activeCopyAction === "Refining" && activeRefineMode) {
      return REFINE_LOADING_MESSAGES[activeRefineMode];
    }

    return [];
  }, [activeCopyAction, activeRefineMode]);
  const copyLoadingText =
    copyLoadingMessages.length > 0
      ? copyLoadingMessages[copyLoadingIndex % copyLoadingMessages.length]
      : "";
  const isCopyBusy = Boolean(activeCopyAction) || isCopyWorking;
  const copyStatus = activeCopyAction
    ? activeCopyAction
    : hasUnsavedCopy
    ? "Unsaved"
    : selectedCopy?.content
    ? "Saved"
    : "No copy";
  const autosaveLabel =
    autosaveStatus === "saving"
      ? "Saving..."
      : autosaveStatus === "pending"
      ? "Unsaved changes"
      : autosaveStatus === "error"
      ? autosaveError || "Autosave failed"
      : lastSavedAt
      ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Autosave ready";

  const hierarchyItems = useMemo(() => getHierarchyItems(nodes, edges), [edges, nodes]);

  useEffect(() => {
    graphRef.current = { edges, nodes, selectedId };
  }, [edges, nodes, selectedId]);

  useEffect(() => {
    sitemapIdRef.current = sitemapId;
  }, [sitemapId]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const pushHistory = useCallback(() => {
    if (isUndoingRef.current) return;

    const snapshot = cloneGraphSnapshot(graphRef.current);
    const signature = getGraphSignature(snapshot);
    if (signature === historySignatureRef.current) return;

    historyRef.current = [...historyRef.current.slice(-49), snapshot];
    historySignatureRef.current = signature;
    setHistoryDepth(historyRef.current.length);
  }, []);

  const undoGraphChange = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) {
      setNotice("Nothing to undo.");
      return;
    }
    setHistoryDepth(historyRef.current.length);

    const snapshot = cloneGraphSnapshot(previous);
    isUndoingRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setSelectedId(snapshot.selectedId);
    historySignatureRef.current = getGraphSignature(snapshot);
    window.requestAnimationFrame(() => {
      isUndoingRef.current = false;
    });
    setNotice("Undid last sitemap change.");
  }, [setEdges, setNodes]);

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (event.shiftKey || event.altKey || isEditableElement(event.target)) return;

      event.preventDefault();
      undoGraphChange();
    }

    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoGraphChange]);

  function switchProject(nextProjectId: string) {
    if (nextProjectId === "__new") {
      router.push("/canvas");
      return;
    }

    const project = projectOptions.find((option) => option.id === nextProjectId);
    if (!project) return;

    router.push(
      project.sitemapId
        ? `/canvas?id=${encodeURIComponent(project.sitemapId)}`
        : `/canvas?projectId=${encodeURIComponent(project.id)}`,
    );
  }

  useEffect(() => {
    if (!isGenerating) return;

    const intervalId = window.setInterval(() => {
      setSitemapLoadingIndex((current) => current + 1);
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [isGenerating]);

  useEffect(() => {
    if (!copyLoadingMessages.length) return;

    const intervalId = window.setInterval(() => {
      setCopyLoadingIndex((current) => current + 1);
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [copyLoadingMessages.length]);

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      setEdges((current) => addEdge({ ...connection, animated: false }, current));
    },
    [pushHistory, setEdges],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<SitemapNodeData>>[]) => {
      if (changes.some((change) => change.type === "remove")) {
        pushHistory();
      }
      onNodesChange(changes);
    },
    [onNodesChange, pushHistory],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedId(nodeId);
  }, []);

  const openNodePanel = useCallback((nodeId: string) => {
    setSelectedId(nodeId);
    setIsCopyPanelOpen(true);
  }, []);

  const mergeCopies = useCallback((nextCopies: PageCopy[]) => {
    setCopies((current) => {
      const byPath = new Map(current.map((copy) => [copy.url_path, copy]));
      nextCopies.forEach((copy) => byPath.set(copy.url_path, copy));
      return Array.from(byPath.values()).sort((a, b) => a.page_name.localeCompare(b.page_name));
    });
    setDraftsByPath((current) => {
      const next = { ...current };
      nextCopies.forEach((copy) => {
        next[copy.url_path] = copy.content ?? "";
      });
      return next;
    });
    setDirtyPaths((current) => {
      const next = new Set(current);
      nextCopies.forEach((copy) => next.delete(copy.url_path));
      return next;
    });
  }, []);

  const updateCopySelection = useCallback(() => {
    const textarea = copyTextareaRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      setSelectionRange(null);
      setSelectedText("");
      return;
    }

    setSelectionRange({ start: textarea.selectionStart, end: textarea.selectionEnd });
    setSelectedText(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd));
  }, []);

  const openCopySelectionMenu = useCallback((event: ReactMouseEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    if (textarea.selectionStart === textarea.selectionEnd) {
      setCopySelectionMenu(null);
      setSelectionRange(null);
      setSelectedText("");
      return;
    }

    event.preventDefault();
    const range = { start: textarea.selectionStart, end: textarea.selectionEnd };
    setSelectionRange(range);
    setSelectedText(textarea.value.slice(range.start, range.end));
    setCopySelectionMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const updateDraft = useCallback((path: string, value: string) => {
    setDraftsByPath((current) => ({ ...current, [path]: value }));
    setDirtyPaths((current) => new Set(current).add(path));
  }, []);

  const savedCopyByPath = useMemo(() => copyByPath, [copyByPath]);

  const flowNodes = useMemo<Node<CanvasNodeData>[]>(() => {
    return nodes.map((node) => {
      const savedCopy = savedCopyByPath[node.data.path];
      const hasUnsaved = dirtyPaths.has(node.data.path);
      return {
        ...node,
        data: {
          ...node.data,
          copyPreview: savedCopy?.content ? getCopyPreview(savedCopy.content) : undefined,
          copyStatus: savedCopy?.content ? "saved" : hasUnsaved ? "unsaved" : "none",
          onEditNode: openNodePanel,
        },
      };
    });
  }, [dirtyPaths, nodes, openNodePanel, savedCopyByPath]);

  const applyGraphStructure = useCallback(
    (nextEdges: Edge[], message?: string) => {
      pushHistory();
      setEdges(nextEdges);
      setNodes((current) => layoutSitemapNodes(current, nextEdges));
      if (message) setNotice(message);
      window.requestAnimationFrame(() => {
        void flowInstance?.fitView({ padding: 0.2, duration: 250 });
      });
    },
    [flowInstance, pushHistory, setEdges, setNodes],
  );

  const createPage = useCallback(
    ({
      parentId,
      position,
      sourceNode,
      title = "New Page",
    }: {
      parentId?: string | null;
      position?: XYPosition;
      sourceNode?: Node<SitemapNodeData>;
      title?: string;
    }) => {
      pushHistory();
      const id = getUniqueId(title, nodes);
      const parent =
        parentId === undefined
          ? sourceNode ?? selectedNode
          : parentId
          ? nodes.find((node) => node.id === parentId)
          : undefined;
      const nodePosition =
        position ??
        (parent
          ? { x: parent.position.x, y: parent.position.y + NODE_V_GAP + 40 }
          : { x: 0, y: 0 });

      setNodes((current) => [
        ...current,
        {
          id,
          type: "sitemap",
          position: nodePosition,
          data: {
            title,
            purpose: "",
            path: `/${id}`,
            sections: ["Menu", "Hero", "Footer"],
          },
        },
      ]);

      if (parent) {
        setEdges((current) => [
          ...current,
          { id: `${parent.id}-${id}`, source: parent.id, target: id, animated: false },
        ]);
      }

      selectNode(id);
      setNotice(parent ? `Added child page under ${parent.data.title}.` : "Added page.");
      return id;
    },
    [nodes, pushHistory, selectNode, selectedNode, setEdges, setNodes],
  );

  const autoArrange = useCallback(() => {
    pushHistory();
    setNodes((current) => layoutSitemapNodes(current, edges));
    setNotice("Canvas auto-arranged.");
    window.requestAnimationFrame(() => {
      void flowInstance?.fitView({ padding: 0.2, duration: 250 });
    });
  }, [edges, flowInstance, pushHistory, setNodes]);

  const editNode = useCallback((nodeId: string) => {
    openNodePanel(nodeId);
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [openNodePanel]);

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;

      pushHistory();
      const id = getUniqueId(`${node.data.title} copy`, nodes);
      setNodes((current) => [
        ...current,
        {
          ...node,
          id,
          selected: false,
          position: { x: node.position.x + 280, y: node.position.y + 40 },
          data: {
            ...node.data,
            title: `${node.data.title} Copy`,
            path: `/${id}`,
          },
        },
      ]);
      selectNode(id);
      setNotice(`Duplicated ${node.data.title}.`);
    },
    [nodes, pushHistory, selectNode, setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      pushHistory();
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      if (selectedId === nodeId) {
        setSelectedId("");
        setIsCopyPanelOpen(false);
      }
      setNotice("Page deleted.");
    },
    [pushHistory, selectedId, setEdges, setNodes],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      pushHistory();
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      setNotice("Connection deleted.");
    },
    [pushHistory, setEdges],
  );

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ) => {
      if (connectionState.toNode || !connectionState.fromNode || !flowInstance) return;

      const clientPosition = getEventClientPosition(event);
      const flowPosition = flowInstance.screenToFlowPosition(clientPosition);
      createPage({
        parentId: connectionState.fromNode.id,
        position: { x: flowPosition.x - NODE_WIDTH / 2, y: flowPosition.y - 60 },
      });
    },
    [createPage, flowInstance],
  );

  const applyListDrop = useCallback(() => {
    if (!dropTarget || !draggingNodeId || draggingNodeId === ROOT_ID) return;

    const targetId = dropTarget.nodeId;
    if (targetId === draggingNodeId) return;
    if (targetId && getDescendantIds(draggingNodeId, edges).has(targetId)) return;

    if (dropTarget.mode === "top" || !targetId) {
      applyGraphStructure(
        replaceParentEdge(edges, draggingNodeId, null),
        "Page moved to top level.",
      );
      setDraggingNodeId("");
      setDropTarget(null);
      return;
    }

    if (dropTarget.mode === "child") {
      applyGraphStructure(
        replaceParentEdge(edges, draggingNodeId, targetId),
        `Moved page under ${nodes.find((node) => node.id === targetId)?.data.title ?? "page"}.`,
      );
      setDraggingNodeId("");
      setDropTarget(null);
      return;
    }

    const targetItem = hierarchyItems.find((entry) => entry.node.id === targetId);
    if (!targetItem?.parentId) {
      applyGraphStructure(
        replaceParentEdge(edges, draggingNodeId, null),
        "Page moved to top level.",
      );
      setDraggingNodeId("");
      setDropTarget(null);
      return;
    }

    const siblings = hierarchyItems
      .filter((entry) => entry.parentId === targetItem.parentId)
      .map((entry) => entry.node.id)
      .filter((id) => id !== draggingNodeId);
    const targetIndex = siblings.indexOf(targetId);
    const insertIndex = dropTarget.mode === "before" ? targetIndex : targetIndex + 1;
    siblings.splice(Math.max(0, insertIndex), 0, draggingNodeId);

    const movedToParent = replaceParentEdge(edges, draggingNodeId, targetItem.parentId);
    applyGraphStructure(
      orderSiblings(movedToParent, targetItem.parentId, siblings),
      "Page order updated.",
    );
    setDraggingNodeId("");
    setDropTarget(null);
  }, [applyGraphStructure, draggingNodeId, dropTarget, edges, hierarchyItems, nodes]);

  const syncSitemapCode = useCallback(() => {
    setSitemapCode(formatSitemapCode(hierarchyItems));
  }, [hierarchyItems]);

  const applySitemapCode = useCallback(() => {
    const parsed = parseSitemapCode(sitemapCode);
    if (parsed.length === 0) {
      setNotice("Code editor is empty.");
      return;
    }

    const existingByOrder = hierarchyItems.map((item) => item.node);
    const nextNodes: Node<SitemapNodeData>[] = [];
    const nodeIds = new Set<string>();
    const stack: Node<SitemapNodeData>[] = [];
    const nextEdges: Edge[] = [];

    parsed.forEach((line, index) => {
      const existing = existingByOrder[index];
      const title = line.title;
      const id = existing?.id ?? getUniqueId(title, [...nodes, ...nextNodes]);
      const node: Node<SitemapNodeData> = existing
        ? {
            ...existing,
            data: {
              ...existing.data,
              title,
              purpose: existing.data.purpose ?? "",
              path: existing.data.path === "/" ? "/" : `/${slugify(title)}`,
            },
          }
        : {
            id,
            type: "sitemap",
            position: { x: 0, y: 0 },
            data: {
              title,
              purpose: "",
              path: `/${slugify(title)}`,
              sections: [],
            },
          };

      nextNodes.push(node);
      nodeIds.add(node.id);

      const depth = Math.max(0, Math.min(line.depth, stack.length));
      stack[depth] = node;
      stack.length = depth + 1;

      const parent = depth === 0 ? nodes.find((item) => item.id === ROOT_ID) : stack[depth - 1];
      if (parent && parent.id !== node.id) {
        nextEdges.push({
          id: `${parent.id}-${node.id}`,
          source: parent.id,
          target: node.id,
          animated: false,
        });
      }
    });

    const rootNode = nodes.find((node) => node.id === ROOT_ID && !nodeIds.has(ROOT_ID));
    const allNodes = rootNode ? [rootNode, ...nextNodes] : nextNodes;
    pushHistory();
    setNodes(layoutSitemapNodes(allNodes, nextEdges));
    setEdges(nextEdges);
    if (allNodes[0]) selectNode(allNodes[0].id);
    setNotice("Sitemap code applied.");
  }, [hierarchyItems, nodes, pushHistory, selectNode, setEdges, setNodes, sitemapCode]);

  const saveCurrentSitemap = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const snapshot = graphRef.current;
      if (snapshot.nodes.length === 0) {
        if (!silent) setNotice("Create at least one page before saving.");
        return "";
      }

      const currentSitemapId = sitemapIdRef.current;

      if (currentSitemapId) {
        const response = await fetch(`/api/sitemaps/${currentSitemapId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief, nodes: snapshot.nodes, edges: snapshot.edges }),
        });
        const data = (await response.json()) as SaveSitemapResponse;

        if (!response.ok) {
          const message = data.error ?? "Unable to save sitemap.";
          if (!silent) {
            setNotice(message);
            setCopyNotice(message);
          }
          throw new Error(message);
        }

        setLastSavedAt(new Date());
        return currentSitemapId;
      }

      if (!silent) setNotice("Creating saved sitemap...");
      const response = await fetch("/api/sitemaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          edges: snapshot.edges,
          nodes: snapshot.nodes,
          projectId: projectIdRef.current,
          projectName,
        }),
      });
      const data = (await response.json()) as SaveSitemapResponse;

      if (!response.ok || !data.sitemapId) {
        const message = data.error ?? "Unable to create saved sitemap.";
        if (!silent) {
          setNotice(message);
          setCopyNotice(message);
        }
        throw new Error(message);
      }

      sitemapIdRef.current = data.sitemapId;
      setSitemapId(data.sitemapId);
      projectIdRef.current = data.projectId ?? projectIdRef.current;
      setProjectId(data.projectId ?? projectIdRef.current);
      if (data.projectId) {
        setProjectOptions((current) =>
          upsertProjectOption(current, {
            id: data.projectId!,
            name: projectName,
            sitemapId: data.sitemapId,
          }),
        );
      }
      setLastSavedAt(new Date());
      if (!silent) setNotice("Saved.");
      return data.sitemapId;
    },
    [brief, projectName],
  );

  const runAutosave = useCallback(async () => {
    if (!hasGenerated || graphRef.current.nodes.length === 0) return "";

    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      return "";
    }

    autosaveInFlightRef.current = true;
    let latestSitemapId = "";

    try {
      do {
        autosaveQueuedRef.current = false;
        setAutosaveStatus("saving");
        setAutosaveError("");
        latestSitemapId = await saveCurrentSitemap({ silent: true });
        setAutosaveStatus("saved");
      } while (autosaveQueuedRef.current);

      return latestSitemapId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Autosave failed.";
      setAutosaveError(message);
      setAutosaveStatus("error");
      return latestSitemapId;
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [hasGenerated, saveCurrentSitemap]);

  useEffect(() => {
    if (!hasGenerated) return;

    if (!didMountAutosaveRef.current) {
      didMountAutosaveRef.current = true;
      return;
    }

    setAutosaveStatus("pending");
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void runAutosave();
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [brief, edges, hasGenerated, nodes, runAutosave]);

  async function ensureSitemapSaved() {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    try {
      const savedSitemapId = await saveCurrentSitemap();
      setAutosaveStatus("saved");
      return savedSitemapId;
    } catch {
      return "";
    }
  }

  async function syncGeneratedCopySections(savedSitemapId: string, nextCopies: PageCopy[]) {
    const nextNodes = applyGeneratedCopySections(nodes, nextCopies);
    if (nextNodes === nodes) return true;

    pushHistory();
    setNodes(nextNodes);
    graphRef.current = { edges, nodes: nextNodes, selectedId };

    const response = await fetch(`/api/sitemaps/${savedSitemapId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, nodes: nextNodes, edges }),
    });
    const data = (await response.json()) as SaveSitemapResponse;

    if (!response.ok) {
      const message = data.error ?? "Generated copy saved, but sub-sections could not be saved.";
      setNotice(message);
      setCopyNotice(message);
      return false;
    }

    return true;
  }

  function saveProjectContext() {
    startSavingContext(async () => {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) return;

      const formData = new FormData();
      formData.append("brief", brief);
      if (contextPdf) formData.append("pdf", contextPdf);

      setCopyNotice("Saving project overview context...");
      const response = await fetch(`/api/sitemaps/${savedSitemapId}`, {
        method: "PATCH",
        body: formData,
      });
      const data = (await response.json()) as SaveSitemapResponse;

      if (!response.ok) {
        const message = data.error ?? "Unable to save project overview context.";
        setNotice(message);
        setCopyNotice(message);
        return;
      }

      setBrief(data.brief ?? brief);
      setContextPdf(null);
      setNotice("Project overview context saved.");
      setCopyNotice("Project overview context saved.");
    });
  }

  function generateCopy(pageId = selectedNode?.id) {
    if (!pageId) {
      setCopyNotice("Select a page before generating copy.");
      return;
    }

    if (!hasProjectContext) {
      setCopyNotice("Add project overview context or upload a PDF before generating copy.");
      return;
    }

    setCopyLoadingIndex(0);
    setActiveCopyAction("Generating");
    setActiveRefineMode(null);
    setCopyNotice(COPY_GENERATION_MESSAGES[0]);

    startCopyWork(async () => {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) {
        setActiveCopyAction(null);
        return;
      }

      const response = await fetch(`/api/sitemaps/${savedSitemapId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", pageId }),
      });
      const data = (await response.json()) as CopyResponse;

      setActiveCopyAction(null);
      setActiveRefineMode(null);

      if (!response.ok || !data.copies?.length) {
        setCopyNotice(data.error ?? "Copy generation failed.");
        return;
      }

      mergeCopies(data.copies);
      const sectionsSaved = await syncGeneratedCopySections(savedSitemapId, data.copies);
      if (!sectionsSaved) return;
      setCopyNotice("Generated and saved page copy.");
    });
  }

  function generateFullWebCopy() {
    if (nodes.length === 0) {
      setCopyNotice("Create at least one page before generating copy.");
      return;
    }

    if (!hasProjectContext) {
      setCopyNotice("Add project overview context or upload a PDF before generating copy.");
      return;
    }

    setCopyLoadingIndex(0);
    setActiveCopyAction("Generating");
    setActiveRefineMode(null);
    setCopyNotice("Generating full web copy...");

    startCopyWork(async () => {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) {
        setActiveCopyAction(null);
        return;
      }

      const response = await fetch(`/api/sitemaps/${savedSitemapId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = (await response.json()) as CopyResponse;

      setActiveCopyAction(null);
      setActiveRefineMode(null);

      if (!response.ok || !data.copies?.length) {
        setCopyNotice(data.error ?? "Full web copy generation failed.");
        return;
      }

      mergeCopies(data.copies);
      const sectionsSaved = await syncGeneratedCopySections(savedSitemapId, data.copies);
      if (!sectionsSaved) return;
      setCopyNotice(`Generated and saved web copy for ${data.copies.length} pages.`);
    });
  }

  function saveCopyDraft() {
    if (!selectedNode) {
      setCopyNotice("Select a page before saving copy.");
      return;
    }

    setCopyLoadingIndex(0);
    setActiveCopyAction("Saving");
    setActiveRefineMode(null);
    setCopyNotice(SAVE_COPY_MESSAGES[0]);

    startCopyWork(async () => {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) {
        setActiveCopyAction(null);
        return;
      }

      const response = await fetch(`/api/sitemaps/${savedSitemapId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          page: {
            title: selectedNode.data.title,
            path: selectedNode.data.path,
          },
          content: draft,
        }),
      });
      const data = (await response.json()) as CopyResponse;

      setActiveCopyAction(null);
      setActiveRefineMode(null);

      if (!response.ok || !data.copy) {
        setCopyNotice(data.error ?? "Save failed.");
        return;
      }

      mergeCopies([data.copy]);
      const sectionsSaved = await syncGeneratedCopySections(savedSitemapId, [data.copy]);
      if (!sectionsSaved) return;
      setCopyNotice("Edited copy saved.");
    });
  }

  async function exportWordDoc() {
    if (nodes.length === 0) {
      setNotice("Create at least one page before exporting.");
      return;
    }

    setIsExportingWordDoc(true);
    setNotice("Preparing Word document export...");

    try {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) return;

      window.location.href = `/api/sitemaps/${savedSitemapId}/export/word`;
      setNotice("Word document export started.");
    } finally {
      setIsExportingWordDoc(false);
    }
  }

  function refineCopy(mode: RefineMode) {
    if (!selectedNode) {
      setCopyNotice("Select a page before refining copy.");
      return;
    }

    if (!hasProjectContext) {
      setCopyNotice("Add project overview context or upload a PDF before using AI editing.");
      return;
    }

    const isSelectionMode = mode !== "regenerate";
    if (isSelectionMode && (!selectionRange || !selectedText.trim())) {
      setCopyNotice("Select text in the editor before using selection tools.");
      return;
    }

    setCopyLoadingIndex(0);
    setActiveCopyAction("Refining");
    setActiveRefineMode(mode);
    setCopyNotice(REFINE_LOADING_MESSAGES[mode][0]);

    startCopyWork(async () => {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) {
        setActiveCopyAction(null);
        setActiveRefineMode(null);
        return;
      }

      const response = await fetch(`/api/sitemaps/${savedSitemapId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          pageId: selectedNode.id,
          mode,
          currentContent: draft,
          selectedText: isSelectionMode ? selectedText : undefined,
          feedback: feedback.trim() || undefined,
        }),
      });
      const data = (await response.json()) as CopyResponse;

      setActiveCopyAction(null);
      setActiveRefineMode(null);

      if (!response.ok || typeof data.content !== "string") {
        setCopyNotice(data.error ?? "Refinement failed.");
        return;
      }

      const nextDraft =
        isSelectionMode && selectionRange
          ? replaceSelectedText(draft, selectionRange, data.content)
          : data.content;

      updateDraft(selectedNode.data.path, nextDraft);
      setSelectedText("");
      setSelectionRange(null);
      setCopySelectionMenu(null);
      setFeedbackMode(null);
      setCopyNotice("Draft refined. Save when ready.");
    });
  }

  function generateSitemap() {
    if (hasIncompleteProjectDocuments) {
      setNotice("PDF analysis must finish before generating a sitemap.");
      return;
    }

    startGenerating(async () => {
      setSitemapLoadingIndex(0);
      setNotice(sitemapLoadingMessages[0]);
      const formData = new FormData();
      formData.append("brief", brief);
      if (projectId) formData.append("projectId", projectId);
      if (!projectId && pdf) formData.append("pdf", pdf);

      const response = await fetch("/api/sitemaps/generate", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as GenerateResponse;

      if (!response.ok) {
        setNotice(data.error ?? "Sitemap generation failed.");
        return;
      }

      setSitemapId(data.sitemapId);
      setProjectId(data.projectId ?? projectId);
      setBrief(data.brief ?? brief);
      setProjectName(data.sitemap.projectName);
      if (data.projectId) {
        setProjectOptions((current) =>
          upsertProjectOption(current, {
            id: data.projectId!,
            name: data.sitemap.projectName,
            sitemapId: data.sitemapId,
          }),
        );
      }
      setStrategy(data.sitemap.strategy);
    historyRef.current = [];
    historySignatureRef.current = "";
    setHistoryDepth(0);
    setNodes(data.nodes.map((node) => ({ ...node, type: "sitemap" })));
      setEdges(data.edges);
      if (data.nodes[0]) selectNode(data.nodes[0].id);
      setHasGenerated(true);
      setNotice(`Sitemap ready — ${data.nodes.length} pages generated.`);
    });
  }

  function saveEdits() {
    startSaving(async () => {
      const savedSitemapId = await ensureSitemapSaved();
      if (!savedSitemapId) return;
      setNotice("Saved.");
    });
  }

  function updateSelectedNode<K extends keyof SitemapNodeData>(
    field: K,
    value: SitemapNodeData[K],
  ) {
    if (!selectedNode) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, [field]: value } }
          : node,
      ),
    );
  }

  function initCanvas() {
    setSitemapId("");
    setProjectId(initialProjectId);
    setProjectName(initialProjectName);
    setStrategy("");
    setCopies([]);
    setDraftsByPath({});
    setDirtyPaths(new Set());
    setPdf(null);
    setContextPdf(null);
    setSelectedText("");
    setSelectionRange(null);
    setCopySelectionMenu(null);
    setFeedback("");
    setFeedbackMode(null);
    setActiveCopyAction(null);
    setActiveRefineMode(null);
    setIsCopyPanelOpen(false);
    historyRef.current = [];
    historySignatureRef.current = "";
    setHistoryDepth(0);
    setNodes([
      {
        id: ROOT_ID,
        type: "sitemap",
        position: { x: 0, y: 0 },
        data: { title: "Sitemap", path: "/", sections: [] },
      },
    ]);
    setEdges([]);
    selectNode(ROOT_ID);
    setHasGenerated(true);
    setNotice("Canvas initialized. Select a node and click Add to branch pages.");
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#111310] text-[#e8eae0]">
      {/* Canvas */}
      <div className="fixed inset-0 h-screen w-screen">
        <ReactFlow
          colorMode="dark"
          edges={edges}
          fitView
          nodeTypes={nodeTypes}
          nodes={flowNodes}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onEdgesChange={onEdgesChange}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault();
            setContextMenu({
              type: "edge",
              x: event.clientX,
              y: event.clientY,
              edgeId: edge.id,
            });
          }}
          onInit={setFlowInstance}
          onNodeClick={(_, node) => {
            closeContextMenu();
            selectNode(node.id);
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            selectNode(node.id);
            setContextMenu({
              type: "node",
              x: event.clientX,
              y: event.clientY,
              nodeId: node.id,
            });
          }}
          onNodeDragStart={pushHistory}
          onNodesChange={handleNodesChange}
          onPaneClick={() => {
            closeContextMenu();
            setSelectedId("");
            setIsCopyPanelOpen(false);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({
              type: "pane",
              x: event.clientX,
              y: event.clientY,
              flowPosition: flowInstance?.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              }) ?? { x: 0, y: 0 },
            });
          }}
          proOptions={{ hideAttribution: true }}
          style={{ background: "#111310" }}
        >
          <Background color="#2a2d22" gap={28} />
          <Controls className="motion-pop !bottom-4 !left-4 !top-auto !rounded-2xl !border !border-white/10 !bg-[#1a1c16]/90 !shadow-xl !backdrop-blur-xl" />
          <MiniMap
            className="motion-pop !rounded-2xl !border !border-white/10 !bg-[#1a1c16]/90 !shadow-xl !backdrop-blur-xl"
            nodeColor="#a3b840"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {contextMenu && (
        <div
          className="motion-pop fixed z-30 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1a1c16]/95 py-1 text-xs text-[#e8eae0] shadow-2xl shadow-black/50 backdrop-blur-xl"
          onClick={(event) => event.stopPropagation()}
          style={{
            left:
              typeof window === "undefined"
                ? contextMenu.x
                : Math.min(contextMenu.x, window.innerWidth - 190),
            top:
              typeof window === "undefined"
                ? contextMenu.y
                : Math.min(contextMenu.y, window.innerHeight - 180),
          }}
        >
          {contextMenu.type === "pane" && (
            <>
              <button
                className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
                onClick={() => {
                  createPage({ parentId: null, position: contextMenu.flowPosition });
                  closeContextMenu();
                }}
                type="button"
              >
                Add page here
              </button>
              <button
                className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
                onClick={() => {
                  autoArrange();
                  closeContextMenu();
                }}
                type="button"
              >
                Auto-arrange
              </button>
              <button
                className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
                onClick={() => {
                  void flowInstance?.fitView({ padding: 0.2, duration: 250 });
                  closeContextMenu();
                }}
                type="button"
              >
                Fit view
              </button>
            </>
          )}

          {contextMenu.type === "node" && (
            <>
              <button
                className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
                onClick={() => {
                  editNode(contextMenu.nodeId);
                  closeContextMenu();
                }}
                type="button"
              >
                Edit
              </button>
              <button
                className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
                onClick={() => {
                  createPage({ parentId: contextMenu.nodeId });
                  closeContextMenu();
                }}
                type="button"
              >
                Add child page
              </button>
              <button
                className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
                onClick={() => {
                  duplicateNode(contextMenu.nodeId);
                  closeContextMenu();
                }}
                type="button"
              >
                Duplicate
              </button>
              <div className="my-1 border-t border-white/10" />
              <button
                className="block w-full px-3 py-2 text-left text-red-300 transition hover:bg-red-500/10"
                onClick={() => {
                  deleteNode(contextMenu.nodeId);
                  closeContextMenu();
                }}
                type="button"
              >
                Delete
              </button>
            </>
          )}

          {contextMenu.type === "edge" && (
            <button
              className="block w-full px-3 py-2 text-left text-red-300 transition hover:bg-red-500/10"
              onClick={() => {
                deleteEdge(contextMenu.edgeId);
                closeContextMenu();
              }}
              type="button"
            >
              Delete connection
            </button>
          )}
        </div>
      )}

      {/* Single floating panel */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <aside className="motion-slide-up pointer-events-auto absolute left-4 top-4 flex max-h-[calc(100vh-2rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1a1c16]/95 shadow-2xl shadow-black/50 backdrop-blur-2xl">
          {/* Top bar */}
          <div className="border-b border-white/8 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <BackButton
                  className="h-8 w-8 shrink-0 bg-[#111310]/80"
                  fallbackHref={projectId ? `/projects/${projectId}` : "/"}
                />
                <Link
                  className="truncate text-[10px] font-semibold tracking-[0.22em] text-[#a3b840]/70 uppercase transition hover:text-[#a3b840]"
                  href={projectId ? `/projects/${projectId}` : "/"}
                >
                  Supercraft Studio
                </Link>
              </div>
              {hasGenerated && (
                <button
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-white/40 transition hover:border-[#a3b840]/40 hover:text-[#a3b840]"
                  onClick={() => setHasGenerated(false)}
                  type="button"
                >
                  ← Context
                </button>
              )}
            </div>

            <label
              className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30"
              htmlFor="project-switcher"
            >
              Project
            </label>
            <select
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#111310] px-3 py-2 text-xs font-semibold text-[#e8eae0] outline-none transition focus:border-[#a3b840]/50"
              id="project-switcher"
              onChange={(event) => switchProject(event.target.value)}
              value={projectId || "__new"}
            >
              <option value="__new">New project</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* ── Project overview context panel ── */}
          {!hasGenerated && (
            <div className="motion-fade-in canvas-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div>
                <h1 className="text-lg font-semibold tracking-[-0.04em] text-[#e8eae0]">
                  Sitemap canvas
                </h1>
                <p className="mt-0.5 text-[11px] leading-4 text-white/40">
                  Review the project overview context or upload a PDF brief to generate a hierarchical sitemap.
                </p>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                <label className="text-xs font-semibold text-white/55" htmlFor="brief">
                  Project Overview Context
                </label>
                <textarea
                  className="mt-2 min-h-36 w-full resize-y rounded-xl border border-white/8 bg-white/5 p-3 text-xs leading-5 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/50 focus:ring-2 focus:ring-[#a3b840]/10"
                  id="brief"
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Audience, offer, brand tone, goals, must-have pages…"
                  value={brief}
                />

                <label className="mt-3 block text-xs font-semibold text-white/55" htmlFor="pdf">
                  PDF Upload
                </label>
                <input
                  accept="application/pdf"
                  className="mt-2 w-full rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-[11px] text-white/50 file:mr-3 file:rounded-full file:border-0 file:bg-[#a3b840] file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-[#1a1c16]"
                  id="pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                  type="file"
                />

                <button
                  className="motion-lift mt-3 w-full rounded-full bg-[#a3b840] px-4 py-2.5 text-xs font-bold tracking-wide text-[#1a1c16] shadow-lg shadow-[#a3b840]/20 transition hover:bg-[#b5cc4a] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    isGenerating ||
                    hasIncompleteProjectDocuments ||
                    (!brief.trim() && !pdf)
                  }
                  onClick={generateSitemap}
                  type="button"
                >
                  {isGenerating ? "Generating..." : "Generate Sitemap"}
                </button>
                {hasIncompleteProjectDocuments ? (
                  <p className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-center text-[11px] font-medium text-amber-100">
                    PDF analysis must finish before generating a sitemap.
                  </p>
                ) : null}

                {sitemapLoadingText && (
                  <p className="motion-status-pulse mt-2 rounded-xl border border-[#a3b840]/15 bg-[#a3b840]/8 px-3 py-2 text-center text-[11px] font-medium text-[#c8db5a]">
                    {sitemapLoadingText}
                  </p>
                )}

                <button
                  className="mt-2 w-full rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-white/45 transition hover:border-white/20 hover:text-white/70"
                  onClick={initCanvas}
                  type="button"
                >
                  Start blank canvas
                </button>
              </div>

              {notice && (
                <p className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-[11px] text-white/55">
                  {notice}
                </p>
              )}
            </div>
          )}

          {/* ── Editor panel ── */}
          {hasGenerated && (
            <div className="motion-fade-in canvas-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {/* Project header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.18em] text-[#a3b840]/70 uppercase">
                    Editor
                  </p>
                  <h2 className="mt-0.5 text-base font-semibold tracking-[-0.03em] text-[#e8eae0]">
                    {projectName}
                  </h2>
                </div>
                <span className="mt-1 shrink-0 rounded-full bg-[#a3b840]/15 px-2.5 py-1 text-[10px] font-semibold text-[#a3b840]">
                  {nodes.length} pages
                </span>
              </div>

              {strategy && (
                <p className="line-clamp-3 text-[11px] leading-4 text-white/40">{strategy}</p>
              )}

              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    autosaveStatus === "error"
                      ? "bg-red-400"
                      : autosaveStatus === "pending" || autosaveStatus === "saving"
                      ? "bg-amber-300"
                      : "bg-[#a3b840]"
                  }`}
                />
                <p className="min-w-0 flex-1 truncate text-[11px] text-white/45">
                  Autosave: {autosaveLabel}
                </p>
                <button
                  className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-medium text-white/40 transition hover:border-[#a3b840]/40 hover:text-[#a3b840] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={historyDepth === 0}
                  onClick={undoGraphChange}
                  type="button"
                >
                  Undo
                </button>
              </div>

              {/* Action bar */}
              <div className="grid grid-cols-2 gap-2">
                <button
                   className="motion-lift rounded-full bg-[#a3b840] px-3 py-2 text-xs font-bold text-[#1a1c16] shadow transition hover:bg-[#b5cc4a] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isSaving || nodes.length === 0}
                  onClick={saveEdits}
                  type="button"
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                   className="motion-lift rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-[#e8eae0] transition hover:bg-white/12"
                  disabled={isCopyBusy || nodes.length === 0 || !hasProjectContext}
                  onClick={generateFullWebCopy}
                  type="button"
                >
                  {activeCopyAction === "Generating" ? "Generating..." : "Generate Full Web Copy"}
                </button>
                <button
                   className="motion-lift col-span-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-[#e8eae0] transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isExportingWordDoc || nodes.length === 0}
                  onClick={exportWordDoc}
                  type="button"
                >
                  {isExportingWordDoc ? "Exporting Word Doc..." : "Export Word Doc"}
                </button>
              </div>

              {/* Node editor */}
              {selectedNode ? (
                <div ref={editorRef} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                  <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
                    Selected — {selectedNode.data.title}
                  </p>

                  <label className="text-xs font-semibold text-white/55" htmlFor="title">
                    Page title
                  </label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs text-[#e8eae0] outline-none focus:border-[#a3b840]/50"
                    id="title"
                    onChange={(e) => updateSelectedNode("title", e.target.value)}
                    onFocus={pushHistory}
                    value={selectedNode.data.title}
                  />

                  {selectedNode.id !== ROOT_ID ? (
                    <>
                      <label className="mt-3 block text-xs font-semibold text-white/55" htmlFor="purpose">
                        Purpose
                      </label>
                      <textarea
                        className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs leading-5 text-[#e8eae0] outline-none focus:border-[#a3b840]/50"
                        id="purpose"
                        onChange={(e) => updateSelectedNode("purpose", e.target.value)}
                        onFocus={pushHistory}
                        placeholder="High-level intent for this page"
                        value={selectedNode.data.purpose ?? ""}
                      />
                    </>
                  ) : null}

                  <label className="mt-3 block text-xs font-semibold text-white/55" htmlFor="path">
                    URL path
                  </label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs text-[#e8eae0] outline-none focus:border-[#a3b840]/50"
                    id="path"
                    onChange={(e) => updateSelectedNode("path", e.target.value)}
                    onFocus={pushHistory}
                    value={selectedNode.data.path}
                  />

                  <label className="mt-3 block text-xs font-semibold text-white/55" htmlFor="sections">
                    Sub-sections
                    <span className="ml-1 font-normal text-white/30">(comma separated)</span>
                  </label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs text-[#e8eae0] outline-none focus:border-[#a3b840]/50"
                    id="sections"
                    onChange={(e) =>
                      updateSelectedNode(
                        "sections",
                        e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    onFocus={pushHistory}
                    value={(selectedNode.data.sections ?? []).join(", ")}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-4 text-center text-xs text-white/30">
                  Click a node on the canvas to edit it
                </div>
              )}

              {/* Page list */}
              <div
                className="canvas-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-2xl border border-white/8 bg-black/20 p-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  applyListDrop();
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
                    Pages
                  </p>
                  <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
                    <button
                      className={`rounded-full px-2 py-1 text-[10px] font-medium transition ${
                        listMode === "tree"
                          ? "bg-[#a3b840] text-[#1a1c16]"
                          : "text-white/45 hover:text-white/75"
                      }`}
                      onClick={() => setListMode("tree")}
                      type="button"
                    >
                      List
                    </button>
                    <button
                      className={`rounded-full px-2 py-1 text-[10px] font-medium transition ${
                        listMode === "code"
                          ? "bg-[#a3b840] text-[#1a1c16]"
                          : "text-white/45 hover:text-white/75"
                      }`}
                      onClick={() => {
                        syncSitemapCode();
                        setListMode("code");
                      }}
                      type="button"
                    >
                      Code
                    </button>
                  </div>
                </div>

                {listMode === "tree" ? (
                  <div className="grid gap-1">
                    {hierarchyItems.map((item) => {
                      const { node, depth } = item;
                      const isDropTarget = dropTarget?.nodeId === node.id;

                      return (
                        <div
                          className={`group relative flex items-stretch gap-1 rounded-xl border text-xs transition ${
                            node.id === selectedId
                              ? "border-[#a3b840]/50 bg-[#a3b840]/15 text-[#c8db5a]"
                              : "border-white/8 bg-white/5 text-white/55 hover:bg-white/8 hover:text-white/80"
                          } ${
                            draggingNodeId === node.id
                              ? "opacity-40"
                              : isDropTarget && dropTarget.mode === "child"
                              ? "ring-2 ring-[#a3b840]/60"
                              : ""
                          }`}
                          draggable={node.id !== ROOT_ID}
                          key={node.id}
                          onDragStart={() => setDraggingNodeId(node.id)}
                          onDragEnd={() => {
                            setDraggingNodeId("");
                            setDropTarget(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (!draggingNodeId || draggingNodeId === node.id) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const y = event.clientY - rect.top;
                            const ratio = y / rect.height;
                            const mode =
                              ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "child";
                            setDropTarget({ nodeId: node.id, mode });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            applyListDrop();
                          }}
                          style={{ paddingLeft: `${depth * 24 + 8}px` }}
                        >
                          {/* Tree connector line for child pages */}
                          {depth > 0 && (
                            <span
                              className="absolute bottom-1 top-1 rounded-full"
                              style={{
                                left: `${(depth - 1) * 24 + 14}px`,
                                width: "2px",
                                background:
                                  node.id === selectedId
                                    ? "rgba(163,184,64,0.5)"
                                    : "rgba(255,255,255,0.12)",
                              }}
                            />
                          )}
                          {isDropTarget && dropTarget.mode === "before" && (
                            <span className="absolute -top-1 left-2 right-2 h-0.5 rounded-full bg-[#a3b840]" />
                          )}
                          {isDropTarget && dropTarget.mode === "after" && (
                            <span className="absolute -bottom-1 left-2 right-2 h-0.5 rounded-full bg-[#a3b840]" />
                          )}
                          <button
                            className="min-w-0 flex-1 py-2 pr-2 text-left"
                            onClick={() => selectNode(node.id)}
                            type="button"
                          >
                            <span className="block truncate font-semibold">
                              {node.data.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] opacity-60">
                              {node.data.path}
                            </span>
                          </button>

                          <button
                            aria-label="Open editor"
                            className="mr-1 shrink-0 self-center rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/35 opacity-70 transition hover:border-[#a3b840]/40 hover:text-[#a3b840] group-hover:opacity-100"
                            onClick={() => openNodePanel(node.id)}
                            type="button"
                          >
                            Edit
                          </button>
                        </div>
                      );
                    })}
                    {draggingNodeId && (
                      <div
                        className={`rounded-xl border border-dashed px-3 py-2 text-center text-[11px] transition ${
                          dropTarget?.mode === "top" && dropTarget.nodeId === null
                            ? "border-[#a3b840]/60 bg-[#a3b840]/10 text-[#c8db5a]"
                            : "border-white/10 text-white/25"
                        }`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDropTarget({ nodeId: null, mode: "top" });
                        }}
                      >
                        Drop here for top level
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <textarea
                      className="min-h-56 w-full resize-y rounded-xl border border-white/8 bg-[#111310] p-3 font-mono text-[11px] leading-5 text-[#e8eae0] outline-none placeholder:text-white/25 focus:border-[#a3b840]/50"
                      onChange={(event) => setSitemapCode(event.target.value)}
                      spellCheck={false}
                      value={sitemapCode}
                    />
                    <button
                      className="rounded-full bg-[#a3b840] px-3 py-2 text-xs font-bold text-[#1a1c16] shadow transition hover:-translate-y-0.5 hover:bg-[#b5cc4a]"
                      onClick={applySitemapCode}
                      type="button"
                    >
                      Apply code
                    </button>
                  </div>
                )}
              </div>

              {(sitemapLoadingText || notice) && (
                <p className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-[11px] text-white/45">
                  {sitemapLoadingText || notice}
                </p>
              )}
            </div>
          )}
        </aside>

        {hasGenerated && selectedNode && isCopyPanelOpen && (
          <aside className="pointer-events-auto absolute right-0 top-0 flex h-screen w-[min(42rem,100vw)] flex-col overflow-hidden border-l border-white/10 bg-[#1a1c16] text-[#e8eae0] shadow-2xl shadow-black/60">
            <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/8 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold tracking-[-0.03em]">
                  {selectedNode.data.title}
                </h2>
                <p className="mt-1 truncate font-mono text-[11px] text-white/35">
                  {selectedNode.data.path}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isRootSelected ? (
                  <button
                    className="rounded-full bg-[#a3b840] px-3 py-1.5 text-[11px] font-bold text-[#1a1c16] transition hover:bg-[#b5cc4a] disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={isSavingContext}
                    onClick={saveProjectContext}
                    type="button"
                  >
                    {isSavingContext ? "Saving..." : "Save context"}
                  </button>
                ) : (
                  <>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        copyStatus === "Saved"
                          ? "bg-[#a3b840]/20 text-[#c8db5a]"
                          : copyStatus === "Unsaved"
                          ? "bg-amber-500/15 text-amber-300"
                          : copyStatus === "No copy"
                          ? "bg-white/8 text-white/40"
                          : "bg-[#a3b840]/25 text-[#c8db5a]"
                      }`}
                    >
                      {copyStatus}
                    </span>
                    {hasCopy && (
                      <>
                        <button
                          className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/50 transition hover:border-[#a3b840]/40 hover:text-[#a3b840] disabled:cursor-not-allowed disabled:opacity-35"
                          disabled={isCopyBusy}
                          onClick={() => {
                            setFeedback("");
                            setFeedbackMode("regenerate");
                          }}
                          type="button"
                        >
                          Regen
                        </button>
                        <button
                          className="rounded-full bg-[#a3b840] px-3 py-1.5 text-[11px] font-bold text-[#1a1c16] transition hover:bg-[#b5cc4a] disabled:cursor-not-allowed disabled:opacity-35"
                          disabled={isCopyBusy || !hasUnsavedCopy}
                          onClick={saveCopyDraft}
                          type="button"
                        >
                          Save
                        </button>
                      </>
                    )}
                  </>
                )}
                <button
                  className="rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/40 transition hover:border-white/20 hover:text-white/70"
                  onClick={() => setIsCopyPanelOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="canvas-scrollbar relative flex flex-1 flex-col overflow-y-auto">
              {isRootSelected ? (
                <div className="flex flex-1 flex-col gap-4 px-6 py-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a3b840]/70">
                      Client context
                    </p>
                    <p className="mt-2 text-xs leading-5 text-white/40">
                      This project overview is used as context for all page copy generation.
                    </p>
                  </div>
                  <textarea
                    className="canvas-scrollbar min-h-80 flex-1 resize-none rounded-2xl border border-white/8 bg-[#111310] p-4 text-sm leading-7 text-[#e8eae0] outline-none placeholder:text-white/20 focus:border-[#a3b840]/50"
                    onChange={(event) => setBrief(event.target.value)}
                    placeholder="Project summary, industry, USP, strategy sheet, brief, additional details, audience, offer, brand tone, constraints, and must-have messaging..."
                    value={brief}
                  />
                  <div className="rounded-2xl border border-dashed border-white/12 bg-white/5 p-3">
                    <label className="text-xs font-semibold text-white/55" htmlFor="context-pdf">
                      PDF Upload
                    </label>
                    <input
                      accept="application/pdf"
                      className="mt-2 w-full rounded-xl border border-white/8 bg-[#111310] p-3 text-[11px] text-white/50 file:mr-3 file:rounded-full file:border-0 file:bg-[#a3b840] file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-[#1a1c16]"
                      id="context-pdf"
                      onChange={(event) => setContextPdf(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </div>
                </div>
              ) : !hasCopy ? (
                <div className="flex flex-1 items-center justify-center px-8">
                  <div className="w-full max-w-sm text-center">
                    {!hasProjectContext ? (
                      <p className="text-sm leading-6 text-white/40">
                        Add project overview context from the root sitemap node before generating copy.
                      </p>
                    ) : (
                      <p className="text-sm leading-6 text-white/40">
                        Start with generated copy, then edit directly on the page.
                      </p>
                    )}
                    <button
                      className="mt-5 rounded-full bg-[#a3b840] px-5 py-2.5 text-sm font-bold text-[#1a1c16] shadow-lg shadow-[#a3b840]/15 transition hover:-translate-y-0.5 hover:bg-[#b5cc4a] disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={isCopyBusy || !hasProjectContext}
                      onClick={() => generateCopy(selectedNode.id)}
                      type="button"
                    >
                      {activeCopyAction === "Generating" ? "Generating..." : "Generate copy"}
                    </button>
                    {activeCopyAction === "Generating" && copyLoadingText && (
                      <p className="mt-3 rounded-xl border border-[#a3b840]/15 bg-[#a3b840]/8 px-3 py-2 text-[11px] font-medium text-[#c8db5a]">
                        {copyLoadingText}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <textarea
                  ref={copyTextareaRef}
                  className="canvas-scrollbar h-full flex-1 resize-none border-0 bg-transparent px-10 py-8 text-[15px] leading-8 text-[#e8eae0] outline-none placeholder:text-white/20"
                  onBlur={updateCopySelection}
                  onChange={(event) => {
                    if (!selectedPath) return;
                    updateDraft(selectedPath, event.target.value);
                  }}
                  onContextMenu={openCopySelectionMenu}
                  onKeyUp={updateCopySelection}
                  onMouseUp={updateCopySelection}
                  placeholder="Write webcopy..."
                  spellCheck
                  value={draft}
                />
              )}

              {(copyLoadingText || copyNotice) && (
                <p className="absolute bottom-4 left-6 right-6 rounded-xl border border-white/8 bg-[#111310]/90 px-3 py-2 text-[11px] leading-5 text-white/45 shadow-xl">
                  {copyLoadingText || copyNotice}
                </p>
              )}
            </div>
          </aside>
        )}

        {copySelectionMenu && selectedText && (
          <div
            className="pointer-events-auto fixed z-40 min-w-48 overflow-hidden rounded-xl border border-white/10 bg-[#1a1c16]/95 py-1 text-xs text-[#e8eae0] shadow-2xl shadow-black/50 backdrop-blur-xl"
            style={{
              left:
                typeof window === "undefined"
                  ? copySelectionMenu.x
                  : Math.min(copySelectionMenu.x, window.innerWidth - 210),
              top:
                typeof window === "undefined"
                  ? copySelectionMenu.y
                  : Math.min(copySelectionMenu.y, window.innerHeight - 230),
            }}
          >
            <button
              className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
              disabled={isCopyBusy}
              onClick={() => {
                setFeedback("");
                setFeedbackMode("regenerate-selection");
                setCopySelectionMenu(null);
              }}
              type="button"
            >
              Regenerate with feedback
            </button>
            <button
              className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
              disabled={isCopyBusy}
              onClick={() => {
                setCopySelectionMenu(null);
                refineCopy("paraphrase");
              }}
              type="button"
            >
              Paraphrase
            </button>
            <button
              className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
              disabled={isCopyBusy}
              onClick={() => {
                setCopySelectionMenu(null);
                refineCopy("shorten");
              }}
              type="button"
            >
              Shorten
            </button>
            <button
              className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
              disabled={isCopyBusy}
              onClick={() => {
                setCopySelectionMenu(null);
                refineCopy("expand");
              }}
              type="button"
            >
              Expand
            </button>
            <button
              className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
              disabled={isCopyBusy}
              onClick={() => {
                setCopySelectionMenu(null);
                refineCopy("bullet-points");
              }}
              type="button"
            >
              Bullet points
            </button>
            <button
              className="block w-full px-3 py-2 text-left transition hover:bg-white/8"
              disabled={isCopyBusy}
              onClick={() => {
                setFeedback("");
                setFeedbackMode("change-tone");
                setCopySelectionMenu(null);
              }}
              type="button"
            >
              Change tone
            </button>
          </div>
        )}

        {feedbackMode && (
          <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
            <div className="motion-slide-up w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1c16] p-4 text-[#e8eae0] shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {feedbackMode === "regenerate" ? "Regenerate copy" : "Refine selection"}
                </h3>
                <button
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/45 transition hover:text-white/70"
                  onClick={() => setFeedbackMode(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <textarea
                className="mt-3 min-h-28 w-full resize-y rounded-xl border border-white/8 bg-[#111310] p-3 text-xs leading-5 text-[#e8eae0] outline-none placeholder:text-white/25 focus:border-[#a3b840]/50"
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Add feedback, e.g. make it more premium, less salesy, clearer, or more concise."
                value={feedback}
              />
              <button
                className="mt-3 w-full rounded-full bg-[#a3b840] px-4 py-2.5 text-xs font-bold text-[#1a1c16] transition hover:bg-[#b5cc4a] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isCopyBusy}
                onClick={() => refineCopy(feedbackMode)}
                type="button"
              >
                {isCopyBusy ? "Regenerating..." : "Regenerate"}
              </button>
              {copyLoadingText && (
                <p className="mt-3 rounded-xl border border-[#a3b840]/15 bg-[#a3b840]/8 px-3 py-2 text-center text-[11px] font-medium text-[#c8db5a]">
                  {copyLoadingText}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
