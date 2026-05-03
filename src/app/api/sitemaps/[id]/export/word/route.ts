import { NextResponse } from "next/server";
import type { Edge, Node } from "@xyflow/react";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";
import type { SitemapNodeData } from "@/types/sitemap";

export const runtime = "nodejs";

type PageCopyRow = {
  content: string | null;
  page_name: string;
  url_path: string;
};

type HierarchyItem = {
  depth: number;
  node: Node<SitemapNodeData>;
};

type ParagraphStyle =
  | "Title"
  | "Heading1"
  | "Heading2"
  | "Heading3"
  | "FieldLabel"
  | "LayoutType"
  | "Normal"
  | "Tree"
  | "Spacer";

type DocParagraph = {
  pageBreakBefore?: boolean;
  style: ParagraphStyle;
  text: string;
};

function isSitemapNode(value: unknown): value is Node<SitemapNodeData> {
  if (!value || typeof value !== "object") return false;
  const node = value as { id?: unknown; data?: Partial<SitemapNodeData> };

  return (
    typeof node.id === "string" &&
    typeof node.data?.title === "string" &&
    typeof node.data?.path === "string"
  );
}

function isSitemapEdge(value: unknown): value is Edge {
  if (!value || typeof value !== "object") return false;
  const edge = value as { id?: unknown; source?: unknown; target?: unknown };

  return (
    typeof edge.id === "string" &&
    typeof edge.source === "string" &&
    typeof edge.target === "string"
  );
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileNameSafe(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Sitemap Export";
}

function getHierarchyItems(nodes: Node<SitemapNodeData>[], edges: Edge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, string[]>();
  const childIds = new Set<string>();

  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    childIds.add(edge.target);
    const children = childrenByParent.get(edge.source) ?? [];
    children.push(edge.target);
    childrenByParent.set(edge.source, children);
  });

  const roots = nodes.filter((node) => !childIds.has(node.id));
  const visited = new Set<string>();
  const items: HierarchyItem[] = [];

  function visit(node: Node<SitemapNodeData>, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    items.push({ depth, node });
    (childrenByParent.get(node.id) ?? []).forEach((childId) => {
      const child = nodeById.get(childId);
      if (child) visit(child, depth + 1);
    });
  }

  roots.forEach((node) => visit(node, 0));
  nodes.forEach((node) => {
    if (!visited.has(node.id)) visit(node, 0);
  });

  return items;
}

function formatTreeLine(item: HierarchyItem, index: number) {
  if (item.depth === 0 && index === 0) return item.node.data.title || "Website";
  const prefix =
    item.depth === 0 ? "" : `${"│   ".repeat(Math.max(0, item.depth - 1))}├── `;
  return `${prefix}${item.node.data.title}`;
}

function cleanMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trimEnd();
}

function parseFieldLabel(rawLine: string): false | { label: string; content: string; isLayoutType: boolean } {
  const normalized = rawLine
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trimEnd();
  const match = /^([A-Za-z][A-Za-z0-9 '_\-]{0,39}):\s*(.*)$/.exec(normalized);
  if (!match) return false;
  const label = match[1].trim();
  const content = match[2].trim().replace(/"/g, "");
  if (content.startsWith("//") || content.startsWith("http")) return false;
  const isLayoutType = label.toLowerCase() === "layout_type";
  return { label: label.charAt(0).toUpperCase() + label.slice(1), content, isLayoutType };
}

function pageTitle(projectName: string, title: string) {
  return `${projectName.toUpperCase()} — ${title.toUpperCase()} PAGE CONTENT`;
}

function pushSpacer(paragraphs: DocParagraph[]) {
  if (paragraphs.at(-1)?.style === "Spacer") return;
  paragraphs.push({ style: "Spacer", text: "" });
}

function buildParagraphs({
  copies,
  edges,
  nodes,
  projectName,
}: {
  copies: PageCopyRow[];
  edges: Edge[];
  nodes: Node<SitemapNodeData>[];
  projectName: string;
}) {
  const paragraphs: DocParagraph[] = [
    { style: "Title", text: `${projectName} Site Map Proposal` },
    { style: "Spacer", text: "" },
    { style: "Heading1", text: "Sitemap Overview" },
    {
      style: "Normal",
      text:
        "A sitemap is a critical planning tool in any website revamp. It provides a clear, visual representation of the website architecture, helping stakeholders align on structure, hierarchy, and navigation flow before design and development begin.",
    },
    { style: "Spacer", text: "" },
    { style: "Heading1", text: `PROPOSED SITEMAP FOR ${projectName}` },
    { style: "Spacer", text: "" },
  ];
  const copyByPath = new Map(copies.map((copy) => [copy.url_path, copy]));
  const hierarchy = getHierarchyItems(nodes, edges);

  hierarchy.forEach((item, index) => {
    paragraphs.push({ style: "Tree", text: formatTreeLine(item, index) });
  });
  pushSpacer(paragraphs);

  hierarchy.forEach(({ node }) => {
    if (node.data.path === "/") return;

    const copy = copyByPath.get(node.data.path);
    paragraphs.push({
      pageBreakBefore: true,
      style: "Heading1",
      text: pageTitle(projectName, node.data.title),
    });
    pushSpacer(paragraphs);

    if (!copy?.content?.trim()) {
      paragraphs.push({ style: "Normal", text: "No web copy saved for this page yet." });
      return;
    }

    let previousWasBlank = false;
    copy.content.split("\n").forEach((line) => {
      const text = cleanMarkdownLine(line);

      if (!text) {
        if (!previousWasBlank) pushSpacer(paragraphs);
        previousWasBlank = true;
        return;
      }

      if (/^##\s+/.test(line)) {
        pushSpacer(paragraphs);
        paragraphs.push({ style: "Heading2", text: text.toUpperCase() });
        pushSpacer(paragraphs);
        previousWasBlank = false;
        return;
      }

      if (/^#{1,6}\s+/.test(line)) {
        pushSpacer(paragraphs);
        paragraphs.push({ style: "Heading3", text });
        pushSpacer(paragraphs);
        previousWasBlank = false;
        return;
      }

      const field = parseFieldLabel(line);
      if (field) {
        if (field.isLayoutType) {
          paragraphs.push({ style: "LayoutType", text: `[${field.content}]` });
        } else {
          paragraphs.push({ style: "FieldLabel", text: field.label });
          if (field.content) paragraphs.push({ style: "Normal", text: field.content });
        }
        previousWasBlank = false;
        return;
      }

      paragraphs.push({ style: "Normal", text });
      previousWasBlank = false;
    });
    pushSpacer(paragraphs);
    paragraphs.push({ style: "Normal", text: "────────────────────────────────────────────────────" });
  });

  return paragraphs;
}

function paragraphXml(paragraph: DocParagraph) {
  const text = xmlEscape(paragraph.text);
  const preserve = /^\s|\s$/.test(paragraph.text) ? ' xml:space="preserve"' : "";
  const styleConfig: Record<
    ParagraphStyle,
    { after: number; before: number; color?: string; font: string; italic?: boolean; line?: number; size: number; weight?: "bold" }
  > = {
    FieldLabel: { after: 40, before: 180, font: "Arial", size: 22, weight: "bold" },
    Heading1: { after: 240, before: 460, color: "1F2937", font: "Arial", size: 32, weight: "bold" },
    Heading2: { after: 160, before: 320, color: "374151", font: "Arial", size: 26, weight: "bold" },
    Heading3: {
      after: 100,
      before: 220,
      color: "4B5563",
      font: "Arial",
      italic: true,
      size: 23,
      weight: "bold",
    },
    LayoutType: {
      after: 100,
      before: 220,
      color: "4B5563",
      font: "Arial",
      italic: true,
      size: 23,
      weight: "bold",
    },
    Normal: { after: 120, before: 0, font: "Arial", line: 276, size: 22 },
    Spacer: { after: 180, before: 0, font: "Arial", size: 8 },
    Title: { after: 420, before: 0, color: "111827", font: "Arial", size: 44, weight: "bold" },
    Tree: { after: 40, before: 0, font: "Courier New", size: 20 },
  };
  const config = styleConfig[paragraph.style];
  const lineSpacing = config.line ? ` w:line="${config.line}" w:lineRule="auto"` : "";
  const keepNext = paragraph.style.startsWith("Heading") ? "<w:keepNext/>" : "";

  const runStyle = [
    config.weight === "bold" ? "<w:b/>" : "",
    config.italic ? "<w:i/>" : "",
    `<w:rFonts w:ascii="${config.font}" w:hAnsi="${config.font}"/>`,
    config.color ? `<w:color w:val="${config.color}"/>` : "",
    `<w:sz w:val="${config.size}"/>`,
  ].join("");

  return `<w:p><w:pPr>${paragraph.pageBreakBefore ? '<w:pageBreakBefore/>' : ""}<w:pStyle w:val="${paragraph.style}"/>${keepNext}<w:spacing w:before="${config.before}" w:after="${config.after}"${lineSpacing}/></w:pPr>${paragraph.text ? `<w:r><w:rPr>${runStyle}</w:rPr><w:t${preserve}>${text}</w:t></w:r>` : ""}</w:p>`;
}

function documentXml(paragraphs: DocParagraph[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map(paragraphXml).join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:spacing w:after="420"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="44"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:keepNext/><w:spacing w:before="460" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="1F2937"/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="374151"/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="4B5563"/><w:sz w:val="23"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="FieldLabel">
    <w:name w:val="FieldLabel"/>
    <w:pPr><w:spacing w:before="180" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LayoutType">
    <w:name w:val="LayoutType"/>
    <w:pPr><w:spacing w:before="220" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="4B5563"/><w:sz w:val="23"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="HorizontalRule">
    <w:name w:val="HorizontalRule"/>
    <w:pPr><w:spacing w:before="180" w:after="40"/><w:pbdr w:bottom="single" w:color="CCCCCC" w:space="1" w:sz="6"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Tree">
    <w:name w:val="Tree"/>
    <w:pPr><w:spacing w:after="40"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Spacer">
    <w:name w:val="Spacer"/>
    <w:pPr><w:spacing w:before="0" w:after="180"/></w:pPr>
    <w:rPr><w:sz w:val="8"/></w:rPr>
  </w:style>
</w:styles>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function relsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { date: (year << 9) | (month << 5) | day, time };
}

function createZip(entries: { name: string; content: string }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { date, time } = dosDateTime();

  entries.forEach((entry) => {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + content.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createDocx(paragraphs: DocParagraph[]) {
  return createZip([
    { name: "[Content_Types].xml", content: contentTypesXml() },
    { name: "_rels/.rels", content: relsXml() },
    { name: "word/_rels/document.xml.rels", content: documentRelsXml() },
    { name: "word/document.xml", content: documentXml(paragraphs) },
    { name: "word/styles.xml", content: stylesXml() },
  ]);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "export:word", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  const supabase = createAdminClient();

  try {
    const { data: sitemap, error: sitemapError } = await supabase
      .from("sitemaps")
      .select("id,project_id,nodes,edges")
      .eq("id", id)
      .single();

    if (sitemapError || !sitemap) {
      return NextResponse.json(
        { error: sitemapError?.message ?? "Sitemap not found." },
        { status: sitemapError?.code === "PGRST116" ? 404 : 500 },
      );
    }

    const [{ data: project }, { data: copies, error: copiesError }] = await Promise.all([
      supabase.from("projects").select("name").eq("id", sitemap.project_id).maybeSingle(),
      supabase.from("page_copies").select("page_name,url_path,content").eq("sitemap_id", id),
    ]);

    if (copiesError) {
      return NextResponse.json({ error: copiesError.message }, { status: 500 });
    }

    const nodes = Array.isArray(sitemap.nodes) ? sitemap.nodes.filter(isSitemapNode) : [];
    const edges = Array.isArray(sitemap.edges) ? sitemap.edges.filter(isSitemapEdge) : [];

    if (nodes.length === 0) {
      return NextResponse.json({ error: "This sitemap has no pages to export." }, { status: 400 });
    }

    const projectName = project?.name?.trim() || "Sitemap";
    const docx = createDocx(
      buildParagraphs({
        copies: (copies ?? []) as PageCopyRow[],
        edges,
        nodes,
        projectName,
      }),
    );
    const filename = `${fileNameSafe(projectName)} Site Map Proposal.docx`;

    return new NextResponse(docx, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  } catch (error) {
    logServerError("export.word.failed", error, { sitemapId: id });
    return NextResponse.json({ error: "Unable to export Word document." }, { status: 500 });
  }
}
