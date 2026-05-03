import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function getProjectByEmbedKey(
  supabase: ReturnType<typeof createAdminClient>,
  embedKey: string | null | undefined,
) {
  if (!embedKey) return null;

  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("embed_public_key", embedKey)
    .maybeSingle();

  return data as { id: string } | null;
}

const FEEDBACK_IMAGES_BUCKET = "feedback-images";

async function ensureFeedbackImagesBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === FEEDBACK_IMAGES_BUCKET);

  if (!bucketExists) {
    await supabase.storage.createBucket(FEEDBACK_IMAGES_BUCKET, {
      public: true,
    });
  }
}

export async function POST(request: NextRequest) {
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: "Server configuration error.", details: String(e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const embedKeyInput = formData.get("embed_key");
  const embedKey = typeof embedKeyInput === "string" ? embedKeyInput : null;
  const file = formData.get("file");

  if (!embedKey || !embedKey.trim()) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const project = await getProjectByEmbedKey(supabase, embedKey);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  try {
    await ensureFeedbackImagesBucket(supabase);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to create bucket.", details: String(e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const storagePath = `${project.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(FEEDBACK_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Upload failed.", details: uploadError.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const { data: urlData } = supabase.storage
    .from(FEEDBACK_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json(
    { url: urlData.publicUrl },
    { status: 201, headers: CORS_HEADERS },
  );
}