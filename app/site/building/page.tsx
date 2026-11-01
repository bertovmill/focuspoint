import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { SITE_PREFIX, isPublicHost } from "@/lib/public-site";

/**
 * /building used to be the life-wealth scoreboard. Hiring leads land here from
 * old DM links, so it now sends them to the shipped builds on /capabilities.
 */
export default async function BuildingPage() {
  const host = (await headers()).get("host");
  permanentRedirect(`${isPublicHost(host) ? "" : SITE_PREFIX}/capabilities`);
}
