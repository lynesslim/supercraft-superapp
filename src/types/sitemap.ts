export type SitemapPage = {
  id: string;
  title: string;
  purpose?: string;
  path: string;
  parentId?: string | null;
  sections?: string[];
};

export type GeneratedSitemap = {
  projectName: string;
  strategy: string;
  pages: SitemapPage[];
};

export type SitemapNodeData = {
  title: string;
  purpose?: string;
  path: string;
  sections?: string[];
};
