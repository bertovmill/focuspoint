import type { MetadataRoute } from "next";
import { PUBLIC_HOST } from "@/lib/public-site";

/**
 * Only bertomill.com is crawlable, and only its public pages. Cael's own routes
 * are password-gated anyway — this keeps them out of an index by intent as well
 * as by accident.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/eve", "/traces", "/login", "/site"],
    },
    sitemap: `https://${PUBLIC_HOST}/sitemap.xml`,
    host: `https://${PUBLIC_HOST}`,
  };
}
