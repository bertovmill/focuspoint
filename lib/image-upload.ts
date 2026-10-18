import { put } from "@vercel/blob";

/**
 * Re-encode a generated image to webp at `width` and write it to Blob under
 * `key`. Image models return ~1.5 MB PNGs whatever size we ask for, far more
 * than any page renders, so every generated picture goes through here.
 * Overwrites, so re-running with the same key is free.
 */
export async function uploadWebp(
  key: string,
  image: { base64: string; mediaType?: string },
  width: number,
): Promise<string> {
  // Loaded on demand rather than at module init: this module is pulled into
  // the eve agent bundle, and a static import of a native package there is a
  // boot-time crash if the platform binary is missing.
  const { default: sharp } = await import("sharp");
  const webp = await sharp(Buffer.from(image.base64, "base64"))
    .resize(width, undefined, { withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const blob = await put(`${key}.webp`, webp, {
    access: "public",
    contentType: "image/webp",
    allowOverwrite: true,
  });
  return blob.url;
}
