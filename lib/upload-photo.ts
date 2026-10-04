/**
 * Upload a photo from the browser to Blob (via /api/upload) and return its URL.
 *
 * Phone photos are routinely 4000px and 5+ MB, over the upload cap and far
 * more than a note renders, so anything the browser can decode is re-encoded
 * to a JPEG no wider or taller than `maxSide` first. GIFs are left alone so
 * they keep animating.
 */
export async function uploadPhoto(file: File, maxSide = 2000): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files are supported");
  const body = new FormData();
  body.append("file", file.type === "image/gif" ? file : await shrink(file, maxSide));
  const res = await fetch("/api/upload", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data.url as string;
}

async function shrink(file: File, maxSide: number): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Not decodable here (e.g. HEIC outside Safari): let the server judge it.
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
