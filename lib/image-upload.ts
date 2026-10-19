import { ensureSchema, getDb } from "./db";
import { PUBLIC_SITE_URL } from "./posts";

/**
 * Store an image in the `media` table under `key` (overwriting) and return its
 * public URL, bertomill.com/media/<key>. Images live in Neon rather than an
 * object store: they're ~100–300 KB webps, and keeping them on the site's own
 * domain is better for search than a third-party host.
 */
export async function storeMedia(key: string, data: Buffer, contentType: string): Promise<string> {
  await ensureSchema();
  await getDb()`
    INSERT INTO media (key, content_type, data)
    VALUES (${key}, ${contentType}, ${"\\x" + data.toString("hex")})
    ON CONFLICT (key) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, created_at = NOW()
  `;
  return `${PUBLIC_SITE_URL}/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function readMedia(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const rows = await getDb()`SELECT content_type, encode(data, 'base64') AS b64 FROM media WHERE key = ${key}`;
  if (!rows[0]) return null;
  return { data: Buffer.from(rows[0].b64 as string, "base64"), contentType: rows[0].content_type as string };
}

/**
 * Re-encode a generated image to webp at `width` and store it under `key`.
 * Image models return ~1.5 MB PNGs whatever size we ask for, far more than any
 * page renders, so every generated picture goes through here.
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
  return storeMedia(`${key}.webp`, webp, "image/webp");
}
