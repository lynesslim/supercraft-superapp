import { readFile } from "node:fs/promises";

// Load .env.local natively
const envConfig = await readFile(new URL("../.env.local", import.meta.url), "utf8");
let apiKey = "";

for (const line of envConfig.split("\n")) {
  if (line.startsWith("SEO_OPENAI_API_KEY=") || line.startsWith("OPENAI_API_KEY=")) {
    const val = line.split("=")[1]?.replace(/"/g, "").trim();
    if (val && !apiKey) apiKey = val;
  }
}

console.log("Testing OpenAI SEO Generation with Key:", apiKey ? apiKey.substring(0, 15) + "..." : "MISSING");

const payload = {
  site_name: "Supercraft Design Studio",
  page_title: "High-Performance Elementor Web Design & SEO Services",
  content: "We build ultra-fast, modern Elementor websites designed for maximum conversion rates and search engine rankings. Our design team focuses on custom typography, interactive micro-animations, mobile responsiveness, and clean technical SEO code.",
  missing_alts: ["https://example.com/wp-content/uploads/hero-banner.jpg"],
  brand_voice: "Professional, authoritative, high-tech B2B",
  model: "gpt-4o-mini"
};

const systemPrompt = `You are an elite Technical SEO Specialist. Write optimized SEO meta tags in JSON format matching keys: meta_title, meta_description, focus_keyword, secondary_keywords (array), og_title, og_description, suggested_image_alts (array of {url, alt_text}). Tone: ${payload.brand_voice}.`;

const userPrompt = `Page Title: ${payload.page_title}\nSite Name: ${payload.site_name}\nContent:\n${payload.content}\nMissing Alt Text Images: ${JSON.stringify(payload.missing_alts)}`;

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: payload.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.4
  })
});

console.log("Response Status:", response.status);

if (response.ok) {
  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  console.log("\n=== Live OpenAI SEO Generation Output ===");
  console.dir(result, { depth: null });
} else {
  const errText = await response.text();
  console.error("OpenAI Error:", errText);
}
