import { createSign } from "crypto";
import { NextResponse } from "next/server";
import type { Edge, Node } from "@xyflow/react";
import { requireApiRole } from "@/utils/auth";
import { requireGoogleExportEnv } from "@/utils/env";
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

type DocumentSection = {
  end: number;
  start: number;
  style: "TITLE" | "HEADING_1" | "HEADING_2" | "HEADING_3";
};

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getGooglePrivateKey() {
  requireGoogleExportEnv();
  return process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

async function getGoogleAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = getGooglePrivateKey();

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google export credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file",
      ].join(" "),
    }),
  );
  const signatureInput = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(signatureInput).sign(privateKey);
  const assertion = `${signatureInput}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? "Unable to authenticate with Google.");
  }

  return data.access_token;
}

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

function formatTree(items: HierarchyItem[]) {
  return items
    .map(({ depth, node }, index) => {
      if (depth === 0 && index === 0) return node.data.title || "Website";
      const prefix = depth === 0 ? "" : `${"│   ".repeat(Math.max(0, depth - 1))}├── `;
      return `${prefix}${node.data.title}`;
    })
    .join("\n");
}

function cleanMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*]\s+/, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trimEnd();
}

function pageTitle(projectName: string, title: string) {
  return `${projectName.toUpperCase()} — ${title.toUpperCase()} PAGE CONTENT`;
}

function buildDocument({
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
  let text = "";
  let cursor = 1;
  const sections: DocumentSection[] = [];
  const copyByPath = new Map(copies.map((copy) => [copy.url_path, copy]));
  const hierarchy = getHierarchyItems(nodes, edges);

  function append(value: string, style?: DocumentSection["style"]) {
    const start = cursor;
    text += value;
    cursor += value.length;
    if (style) sections.push({ start, end: cursor, style });
  }

  append(`${projectName} Site Map Proposal\n\n`, "TITLE");
  append("Sitemap Overview\n\n", "HEADING_1");
  append(
    "A sitemap is a critical planning tool in any website revamp. It provides a clear, visual representation of the website architecture, helping stakeholders align on structure, hierarchy, and navigation flow before design and development begin.\n\n",
  );
  append(`PROPOSED SITEMAP FOR ${projectName}\n\n`, "HEADING_1");
  append(`${formatTree(hierarchy)}\n\n`);

  hierarchy.forEach(({ node }) => {
    if (node.data.path === "/") return;

    const copy = copyByPath.get(node.data.path);
    append(`${pageTitle(projectName, node.data.title)}\n\n`, "HEADING_1");

    if (!copy?.content?.trim()) {
      append("No web copy saved for this page yet.\n\n");
      return;
    }

    copy.content.split("\n").forEach((line) => {
      if (/^##\s+/.test(line)) {
        append(`${cleanMarkdownLine(line).toUpperCase()}\n`, "HEADING_2");
        return;
      }

      if (/^#{1,6}\s+/.test(line)) {
        append(`${cleanMarkdownLine(line)}\n`, "HEADING_3");
        return;
      }

      append(`${cleanMarkdownLine(line)}\n`);
    });
    append("\n");
  });

  return { sections, text };
}

async function createGoogleDoc({
  projectName,
  text,
  sections,
}: {
  projectName: string;
  sections: DocumentSection[];
  text: string;
}) {
  const accessToken = await getGoogleAccessToken();
  const createResponse = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: `${projectName} Site Map Proposal` }),
  });
  const created = (await createResponse.json()) as { documentId?: string; error?: { message?: string } };

  if (!createResponse.ok || !created.documentId) {
    throw new Error(created.error?.message ?? "Unable to create Google Doc.");
  }

  const requests = [
    { insertText: { location: { index: 1 }, text } },
    ...sections.map((section) => ({
      updateParagraphStyle: {
        fields: "namedStyleType",
        paragraphStyle: { namedStyleType: section.style },
        range: { endIndex: section.end, startIndex: section.start },
      },
    })),
  ];

  const updateResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${created.documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );
  const updated = (await updateResponse.json()) as { error?: { message?: string } };

  if (!updateResponse.ok) {
    throw new Error(updated.error?.message ?? "Unable to populate Google Doc.");
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (folderId) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${created.documentId}?addParents=${encodeURIComponent(
        folderId,
      )}&fields=id,parents`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  const shareEmail = process.env.GOOGLE_DOC_EXPORT_SHARE_EMAIL;
  if (shareEmail) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${created.documentId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emailAddress: shareEmail,
        role: "writer",
        type: "user",
      }),
    });
  }

  return {
    documentId: created.documentId,
    url: `https://docs.google.com/document/d/${created.documentId}/edit`,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "export:google-doc", { limit: 20, windowMs: 60_000 });
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
      supabase
        .from("projects")
        .select("name")
        .eq("id", sitemap.project_id)
        .maybeSingle(),
      supabase
        .from("page_copies")
        .select("page_name,url_path,content")
        .eq("sitemap_id", id),
    ]);

    if (copiesError) {
      return NextResponse.json({ error: copiesError.message }, { status: 500 });
    }

    const nodes = Array.isArray(sitemap.nodes)
      ? sitemap.nodes.filter(isSitemapNode)
      : [];
    const edges = Array.isArray(sitemap.edges)
      ? sitemap.edges.filter(isSitemapEdge)
      : [];

    if (nodes.length === 0) {
      return NextResponse.json(
        { error: "This sitemap has no pages to export." },
        { status: 400 },
      );
    }

    const projectName = project?.name?.trim() || "Sitemap";
    const document = buildDocument({
      copies: (copies ?? []) as PageCopyRow[],
      edges,
      nodes,
      projectName,
    });
    const googleDoc = await createGoogleDoc({
      projectName,
      sections: document.sections,
      text: document.text,
    });

    return NextResponse.json(googleDoc);
  } catch (error) {
    logServerError("export.google_doc.failed", error, { sitemapId: id });
    return NextResponse.json({ error: "Unable to export Google Doc." }, { status: 500 });
  }
}
