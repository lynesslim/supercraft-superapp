import { NextResponse } from "next/server";

export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_PDF_FILES = 2;
export const MAX_TOTAL_PDF_BYTES = 24 * 1024 * 1024;
export const MAX_JSON_BODY_BYTES = 900_000;
export const MAX_TEXT_FIELD_CHARS = 40_000;

export function validatePdfFiles(files: File[]) {
  if (files.length > MAX_PDF_FILES) {
    return NextResponse.json(
      { error: `Upload up to ${MAX_PDF_FILES} PDF files at a time.` },
      { status: 400 },
    );
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_PDF_BYTES) {
    return NextResponse.json(
      {
        error: `Upload up to ${Math.floor(MAX_TOTAL_PDF_BYTES / 1024 / 1024)}MB of PDFs at a time.`,
      },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Upload must be a PDF file." }, { status: 400 });
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `PDF files must be ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)}MB or smaller.` },
        { status: 400 },
      );
    }
  }

  return null;
}

export function validateTextLength(value: string, label: string, max = MAX_TEXT_FIELD_CHARS) {
  if (value.length <= max) return null;

  return NextResponse.json(
    { error: `${label} must be ${max.toLocaleString()} characters or fewer.` },
    { status: 400 },
  );
}

export function validateJsonPayloadSize(value: unknown, label = "Payload") {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");

  if (bytes <= MAX_JSON_BODY_BYTES) return null;

  return NextResponse.json(
    { error: `${label} is too large. Please reduce the amount of content and try again.` },
    { status: 413 },
  );
}
