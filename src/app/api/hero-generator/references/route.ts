import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "hero:references:get", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "15", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hero_references")
    .select("id, title, image_url, tags, theme")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ references: data ?? [] });
}

export async function POST(request: Request) {
  console.log("[DEBUG] references POST bulk upload called");
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "hero:references:post", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    // Extract files and metadata
    const files: File[] = [];
    const metadata: Array<{ title: string; theme: string; tags: string[] }> = [];
    
    let index = 0;
    while (true) {
      const file = formData.get(`file_${index}`);
      if (!file) break;
      
      const title = formData.get(`title_${index}`)?.toString() || `Reference ${index}`;
      const theme = formData.get(`theme_${index}`)?.toString() || "both";
      const tagsString = formData.get(`tags_${index}`)?.toString() || "";
      const tags = tagsString.split(",").map(t => t.trim()).filter(Boolean);
      
      files.push(file as File);
      metadata.push({ title, theme, tags });
      index++;
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files supplied for upload." }, { status: 400 });
    }

    // Ensure storage bucket exists and is public
    const bucketName = "visual-references";
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`);
    }

    const bucketExists = buckets?.some((b: any) => b.name === bucketName);
    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket(bucketName, {
        public: true, // public read access for visual gallery
      });
      if (createBucketError && !/already exists|Duplicate/i.test(createBucketError.message)) {
        throw new Error(`Failed to create visual-references bucket: ${createBucketError.message}`);
      }
    }

    const insertedRows: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metadata[i];
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `reference-${Date.now()}-${i}-${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, buffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload file ${file.name} to Supabase: ${uploadError.message}`);
      }

      // Construct permanent public URL
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const imageUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`;

      insertedRows.push({
        title: meta.title,
        image_url: imageUrl,
        tags: meta.tags,
        theme: meta.theme,
      });
    }

    const { data: insertedData, error: insertError } = await supabase
      .from("hero_references")
      .insert(insertedRows)
      .select();

    if (insertError) {
      throw new Error(`Failed to insert visual references: ${insertError.message}`);
    }

    return NextResponse.json({ success: true, references: insertedData });

  } catch (error) {
    console.error("[ERROR] Failed visual reference bulk upload:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to upload reference files."
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  console.log("[DEBUG] references DELETE bulk delete called");
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "hero:references:delete", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { ids } = body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Missing array of ids to delete." }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    // 1. Fetch image URLs before deleting to clean up files in Supabase Storage!
    const { data: records, error: fetchError } = await supabase
      .from("hero_references")
      .select("image_url")
      .in("id", ids);

    if (fetchError) {
      throw new Error(`Failed to query references for cleanup: ${fetchError.message}`);
    }

    // 2. Delete database records
    const { error: deleteError } = await supabase
      .from("hero_references")
      .delete()
      .in("id", ids);

    if (deleteError) {
      throw new Error(`Failed to delete visual references: ${deleteError.message}`);
    }

    // 3. Clean up matching storage files to prevent orphans!
    if (records && records.length > 0) {
      const filesToDelete = records
        .map(r => {
          const url = r.image_url;
          if (url.includes("/storage/v1/object/public/visual-references/")) {
            return url.split("/visual-references/").pop();
          }
          return null;
        })
        .filter((f): f is string => !!f);

      if (filesToDelete.length > 0) {
        console.log("[DEBUG] cleaning up Supabase storage visual assets:", filesToDelete);
        const { error: removeError } = await supabase.storage
          .from("visual-references")
          .remove(filesToDelete);

        if (removeError) {
          console.error("[WARNING] Failed to clean up deleted visual assets from storage bucket:", removeError.message);
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[ERROR] Failed visual reference bulk delete:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to delete references."
    }, { status: 500 });
  }
}
