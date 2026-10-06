import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// The small daily moves that make the career principles true: a markdown list
// right under Principles on /career. Lives in app_settings like the principles;
// Cael reads and rewrites it through the career_daily_actions_doc tool.
const CAREER_DAILY_ACTIONS_KEY = "career.daily-actions.markdown";

// Until he first edits it, the doc opens on the actions drafted with him on 2026-10-05,
// each tagged with the principles (by number) it advances.
export const DEFAULT_CAREER_DAILY_ACTIONS = [
  "About 20 minutes a day.",
  "",
  "1. **Send one message.** A new outreach or a follow-up to someone on my list. *(1, 4)*",
  "2. **Make it a give.** Share an insight, a link or a small build, not an ask. *(3)*",
  "3. **Engage once.** A thoughtful comment on a target person's post. *(1, 3)*",
  "4. **Log a proof point.** One win from today's work, with a number if I can. *(2, 5)*",
  "5. **Update Relationships.** Note any touch so the next follow-up has context. *(1, 7)*",
].join("\n");

export function getCareerDailyActions(): Promise<SettingsDoc> {
  return getSettingsDoc(CAREER_DAILY_ACTIONS_KEY, DEFAULT_CAREER_DAILY_ACTIONS);
}

export function setCareerDailyActions(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(CAREER_DAILY_ACTIONS_KEY, content);
}
