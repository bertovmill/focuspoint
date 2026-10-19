import { readMedia } from "@/lib/image-upload";

// Images stored in the `media` table (lib/image-upload.ts): article covers,
// inline pictures, nutrition art and uploads. Public on both hosts, since covers
// appear in link previews and next/image refetches them without a session.
// Keys are timestamped and never reused for different content, so they cache forever.
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const media = await readMedia(key.join("/"));
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
