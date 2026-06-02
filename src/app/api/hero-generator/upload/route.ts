import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "hero:upload", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file supplied." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return NextResponse.json({ error: "File must be JPEG, PNG, or WebP." }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "File must be 10MB or smaller." }, { status: 413 });
  }

  const supabase = createAdminClient();

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b: any) => b.name === "visual-references");
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket("visual-references", {
        public: true,
      });
      if (createError && !/already exists|Duplicate/i.test(createError.message)) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `custom-references/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("visual-references")
      .upload(fileName, buffer, {
        contentType: file.type || "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/visual-references/${fileName}`;

    return NextResponse.json({ success: true, url: publicUrl, path: fileName });
  } catch (error) {
    logServerError("hero.upload.failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to upload reference.",
    }, { status: 500 });
  }
}
