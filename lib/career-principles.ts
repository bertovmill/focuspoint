import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// How Berto runs his career while still at the startup: a short markdown list at
// the top of /career. Lives in app_settings like the Home principles; Cael reads
// and rewrites it through the career_principles_doc tool.
const CAREER_PRINCIPLES_KEY = "career.principles.markdown";

// Until he first edits it, the doc opens on the principles drafted with him on 2026-10-05.
export const DEFAULT_CAREER_PRINCIPLES = [
  "1. **Build the network before I need it.**",
  "2. **Excellent work where I am is my best reference.**",
  "3. **Give first.** Lead with something useful, not an ask.",
  "4. **Hiring managers, not job boards.**",
  "5. **Proof beats claims.** Show the work, with numbers.",
  "6. **Know my runway and my triggers.** Switch from warm to active mode on purpose, not in a panic.",
  "7. **Stay discreet and stay honest.**",
].join("\n");

export function getCareerPrinciples(): Promise<SettingsDoc> {
  return getSettingsDoc(CAREER_PRINCIPLES_KEY, DEFAULT_CAREER_PRINCIPLES);
}

export function setCareerPrinciples(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(CAREER_PRINCIPLES_KEY, content);
}
