import SiteBuilderPlaygroundClient from "./SiteBuilderPlaygroundClient";

export const metadata = {
  title: "SiteBuilder Sitemap & Doc Parser Playground | Supercraft",
  description: "Upload DOCX or PDF copywriting files to test AI sitemap tree extraction, page hierarchies, and section breakdowns.",
};

export default function SiteBuilderPlaygroundPage() {
  return <SiteBuilderPlaygroundClient />;
}
