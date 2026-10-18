import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// Berto's principles: one markdown document at the bottom of Home, written in a
// Notion-style editor. Lives in app_settings like the training plan doc; Cael
// reads and rewrites it through the principles_doc tool.
const PRINCIPLES_KEY = "principles.markdown";

// Until he first edits the doc, it opens on the four behaviours that used to be
// a hardcoded "Today that means: …" line under the dashboard.
export const DEFAULT_PRINCIPLES = [
  "1. Save",
  "2. Improve the service",
  "3. Go above and beyond",
  "4. Skip the AI noise",
].join("\n");

export function getPrinciples(): Promise<SettingsDoc> {
  return getSettingsDoc(PRINCIPLES_KEY, DEFAULT_PRINCIPLES);
}

export function setPrinciples(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(PRINCIPLES_KEY, content);
}
