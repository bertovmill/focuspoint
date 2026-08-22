import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { PROTOCOL_RULES, isOnProtocol } from "../../lib/nutrition.js";

const RULE_KEYS = PROTOCOL_RULES.map((r) => r.key) as [string, ...string[]];

export default defineTool({
  description:
    `Record which of the user's four nutrition-protocol rules they kept on a given day. The rules are: ${PROTOCOL_RULES.map((r) => `${r.key} (${r.label})`).join(", ")}. A day only counts as "on protocol" when all four are kept — that percentage is the headline number on the Nutrition screen. Pass the complete set of rules kept; this replaces whatever was stored for that day.`,
  inputSchema: z.object({
    rules: z.array(z.enum(RULE_KEYS)).describe("Every rule kept that day. Send an empty array for a day where none held."),
    note: z.string().optional(),
    date: z.string().optional().describe("ISO date string. Defaults to today."),
  }),
  async execute({ rules, note, date }) {
    const sql = getDb();
    const unique = [...new Set(rules)];
    const [row] = await sql`
      INSERT INTO nutrition_days (logged_date, rules, note, updated_at)
      VALUES (${date ?? new Date().toISOString().slice(0, 10)}, ${unique}, ${note ?? null}, NOW())
      ON CONFLICT (logged_date) DO UPDATE
        SET rules = EXCLUDED.rules,
            note = COALESCE(EXCLUDED.note, nutrition_days.note),
            updated_at = NOW()
      RETURNING logged_date, rules
    `;
    return row;
  },
  toModelOutput(output) {
    const kept = (output.rules as string[]) ?? [];
    return {
      type: "text",
      value: `${String(output.logged_date).slice(0, 10)}: kept ${kept.length}/4 rules${isOnProtocol(kept) ? " — fully on protocol." : ` (${kept.join(", ") || "none"}).`}`,
    };
  },
});
