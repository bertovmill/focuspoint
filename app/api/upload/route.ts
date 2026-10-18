import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

// iPhone photos arrive as HEIC, which only Safari can display (and the browser
// can't shrink first), so they're converted to a JPEG no bigger than 2000px
// here. Browsers often send them with an empty type, so the extension counts too.
function isHeic(file: File) {
  return /^image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

async function heicToJpeg(file: File): Promise<File> {
  const [{ default: convert }, { default: sharp }] = await Promise.all([import("heic-convert"), import("sharp")]);
  const decoded = await convert({ buffer: new Uint8Array(await file.arrayBuffer()), format: "JPEG", quality: 0.95 });
  const jpeg = await sharp(decoded)
    .rotate()
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([new Uint8Array(jpeg)], name, { type: "image/jpeg" });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  let file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (isHeic(file)) {
    try {
      file = await heicToJpeg(file);
    } catch {
      return NextResponse.json({ error: "Couldn't read that HEIC photo" }, { status: 400 });
    }
  }

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, GIF, WebP, and HEIC images are supported" }, { status: 400 });
  }

  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }

  const blob = await put(`uploads/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  return NextResponse.json({ url: blob.url, name: file.name, size: file.size });
}
