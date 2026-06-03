import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { requireEnv } from "@/utils/env";
import { sanitizeDocumentFileName } from "@/utils/project-documents";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const PLAYGROUND_IMAGES_BUCKET = "playground-images";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB limit for test references

function createPlaygroundTempStoragePath(fileName: string, index: number) {
  const safeFileName = sanitizeDocumentFileName(fileName);
  const extension = safeFileName.split(".").pop()?.toLowerCase() || "jpg";
  return `playground-temp/${Date.now()}-${index}-${crypto.randomUUID()}.${extension}`;
}

async function ensurePlaygroundImagesBucket(supabase: any) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }
  const exists = buckets?.some((b: any) => b.name === PLAYGROUND_IMAGES_BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(PLAYGROUND_IMAGES_BUCKET, {
      public: false, // private bucket, we will use signed URLs
    });
    if (createError && !/already exists|Duplicate/i.test(createError.message)) {
      throw new Error(`Failed to create playground-images bucket: ${createError.message}`);
    }
  }
}

async function imageUrlToBase64DataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    return url;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${url}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`[ERROR] Failed to convert image URL to base64: ${url}`, err);
    return url;
  }
}


export async function POST(request: Request) {
  console.log("[DEBUG] playground generate-hero POST called");
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;
  console.log("[DEBUG] auth passed");

  const limited = rateLimitByRequest(request, "admin:generate-hero", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  requireEnv("openai");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logServerError("playground.generate-hero.parsing", err, {
      contentType: request.headers.get("content-type"),
    });
    return NextResponse.json({ error: errMsg || "Invalid form data." }, { status: 400 });
  }

  // Extract variables
  const system = formData.get("system")?.toString().trim() ?? "";
  const projectName = formData.get("project_name")?.toString().trim() || "Test Studio Project";
  const projectSummary = formData.get("project_summary")?.toString().trim() || "A boutique brand crafting quiet luxury visual designs.";
  const industry = formData.get("industry")?.toString().trim() || "Boutique Design Agency";
  const accentColor = formData.get("accent_color")?.toString().trim() || "#a3b840";
  const theme = formData.get("theme")?.toString().trim() || "dark";
  const additionalInstruction = formData.get("additional_instruction")?.toString().trim() || "";
  const logoUrl = formData.get("logo_url")?.toString().trim() || "";
  const manualImageUrl = formData.get("image_url")?.toString().trim() || "";


  if (!system) {

    return NextResponse.json({ error: "System prompt is required." }, { status: 400 });
  }

  // Handle image files
  const imageFile = formData.get("image_file");
  let uploadedPath = "";
  let imageUrl = manualImageUrl;
  const supabase = createAdminClient();

  try {
    const isImageFilePresent = imageFile && typeof imageFile === "object" && "size" in imageFile && (imageFile as any).size > 0;
    
    if (isImageFilePresent) {
      const file = imageFile as any;
      const fileName = file.name || "reference-image.jpg";
      const fileType = file.type || "image/jpeg";

      if (!ALLOWED_IMAGE_TYPES.includes(fileType) && !/\.(jpe?g|png|webp)$/i.test(fileName)) {
        return NextResponse.json(
          { error: "Reference file must be a valid JPG, PNG, or WEBP image." },
          { status: 400 },
        );
      }

      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Reference image file must be 10MB or smaller." },
          { status: 413 },
        );
      }

      await ensurePlaygroundImagesBucket(supabase);
      const storagePath = createPlaygroundTempStoragePath(fileName, 0);
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { error: uploadError } = await supabase.storage
        .from(PLAYGROUND_IMAGES_BUCKET)
        .upload(storagePath, buffer, {
          contentType: fileType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Unable to upload temporary reference image: ${uploadError.message}`);
      }

      uploadedPath = storagePath;
      
      const { data: signedData, error: signError } = await supabase.storage
        .from(PLAYGROUND_IMAGES_BUCKET)
        .createSignedUrl(storagePath, 15 * 60);

      if (signError || !signedData?.signedUrl) {
        throw new Error(`Unable to create signed URL for temporary reference image: ${signError?.message ?? "unknown error"}`);
      }

      imageUrl = signedData.signedUrl;
      console.log("[DEBUG] uploaded temp playground image to:", uploadedPath);
    }

    // Default fallback image if nothing provided
    if (!imageUrl) {
      imageUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1024&q=80";
    }

    // Substitute template values
    let finalPrompt = system
      .replaceAll("{{accent_color}}", accentColor)
      .replaceAll("{{theme}}", theme)
      .replaceAll("{{additionalinstruction}}", additionalInstruction)
      .replaceAll("{{aesthetics}}", additionalInstruction) // legacy fallback
      .replaceAll("{{project_name}}", projectName)
      .replaceAll("{{project_summary}}", projectSummary)
      .replaceAll("{{industry}}", industry)
      .replaceAll("{{imageURL}}", "the attached layout reference image")
      .replaceAll("{{logoURL}}", logoUrl ? "the attached company logo image" : "");


    if (logoUrl && !system.includes("{{logoURL}}")) {
      finalPrompt += ` Fully integrate the company logo from the attached company logo image.`;
    }

    console.log("[DEBUG] playground generate-hero final prompt preview:", finalPrompt.slice(0, 150));

    // Construct FormData body for the multipart/form-data images/edits API call
    const formDataBody = new FormData();
    formDataBody.append("model", "gpt-image-2");
    formDataBody.append("prompt", finalPrompt);
    
    const finalSize = "1152x2048";
    formDataBody.append("size", finalSize);



    if (imageUrl) {
      console.log("[DEBUG] Fetching reference layout image for edits attachment:", imageUrl);
      const res = await fetch(imageUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch reference layout image: ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const layoutBlob = new Blob([arrayBuffer], { type: res.headers.get("content-type") || "image/png" });
      
      formDataBody.append("image[]", layoutBlob, "reference-layout.png");
    }

    if (logoUrl) {
      console.log("[DEBUG] Fetching company logo image for edits attachment:", logoUrl);
      const res = await fetch(logoUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch logo image: ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const logoBlob = new Blob([arrayBuffer], { type: res.headers.get("content-type") || "image/png" });
      
      formDataBody.append("image[]", logoBlob, "logo.png");
    }

    // Generate Mockup via OpenAI direct HTTP fetch to support custom proxy limitations
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    console.log("[DEBUG] Dispatching POST fetch to v1/images/edits");
    const response = await fetch(`${openaiBaseUrl}/images/edits`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: formDataBody,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const apiError = errorBody.error?.message ?? `API error: ${response.status}`;
      throw new Error(apiError);
    }

    const payload = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    let generatedUrl = "";
    if (payload.data?.[0]?.url) {
      generatedUrl = payload.data[0].url;
    } else if (payload.data?.[0]?.b64_json) {
      const b64 = payload.data[0].b64_json;
      generatedUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
    }

    if (!generatedUrl) {
      throw new Error("Proxy did not return any image data in the edits payload.");
    }

    const [widthStr, heightStr] = finalSize.split("x");
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);

    return NextResponse.json({
      success: true,
      imageUrl: generatedUrl,
      finalPrompt,
      width,
      height,
    });


  } catch (error) {
    logServerError("playground.generate-hero.failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to generate mockup image.",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    // Delete temp file from storage if uploaded
    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage
        .from(PLAYGROUND_IMAGES_BUCKET)
        .remove([uploadedPath]);

      if (cleanupError) {
        logServerError("playground.generate-hero.cleanup_failed", new Error(cleanupError.message), {
          uploadedPath,
        });
      } else {
        console.log("[DEBUG] cleaned up temp playground image:", uploadedPath);
      }
    }
  }
}

