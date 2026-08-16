import type { MetadataRoute } from "next";
import { PUBLIC_HOST } from "@/lib/public-site";
import { listContent } from "@/lib/content";

const BASE = `https://${PUBLIC_HOST}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [writing, podcast] = await Promise.all([listContent("writing"), listContent("podcast")]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/writing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/podcast`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/building`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/newsletter`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/chat`, changeFrequency: "monthly", priority: 0.5 },
  ];

  return [
    ...staticPages,
    ...writing.map((p) => ({ url: `${BASE}/writing/${p.slug}`, lastModified: p.date, priority: 0.6 })),
    ...podcast.map((e) => ({ url: `${BASE}/podcast/${e.slug}`, lastModified: e.date, priority: 0.6 })),
  ];
}
