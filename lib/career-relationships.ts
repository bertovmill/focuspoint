import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// The companies and people Berto has actually talked to about working together:
// one free-form markdown page under Pipeline on /career, kept warm before any
// role is open. Lives in app_settings like Principles; Cael reads and rewrites
// it through the career_relationships_doc tool.
const RELATIONSHIPS_KEY = "career.relationships.markdown";

export function getRelationships(): Promise<SettingsDoc> {
  return getSettingsDoc(RELATIONSHIPS_KEY);
}

export function setRelationships(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(RELATIONSHIPS_KEY, content);
}
