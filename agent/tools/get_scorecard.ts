import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import {
  METRIC_WEIGHT,
  formatMetric,
  formatTarget,
  getScorecardSummary,
  metricDef,
} from "../../lib/scorecard.js";

export default defineTool({
  description:
    "Read the daily scorecard — whether today is a winning day, scored out of 100. Three keys decide it, each " +
    "worth an equal share: steps, sleep, and keystrokes. 100 means every target was hit; going past a target " +
    "earns nothing extra. Use this when he asks how today is going, whether he's winning, what's left to hit, " +
    "or about his perfect-day streak.",
  inputSchema: z.object({}),
  async execute() {
    return getScorecardSummary(getDb());
  },
  toModelOutput(output) {
    const lines = output.today.metrics.map((m) => {
      const def = metricDef(m.key);
      const value = formatMetric(m.key, m.value);
      const target = formatTarget(m.key, m.target);
      return `${m.hit ? "✓" : "·"} ${def.label}: ${value}${target ? ` (target ${target})` : ""} — ${m.points}/${METRIC_WEIGHT.toFixed(1)} pts`;
    });

    const missing = output.today.metrics.filter((m) => !m.hit).map((m) => metricDef(m.key).label);
    const verdict = missing.length
      ? `Still open: ${missing.join(", ")}.`
      : "Every metric hit — today is a win.";

    const streak =
      output.streak > 0
        ? `Perfect-day streak: ${output.streak}${output.atRisk ? " (not yet extended today)" : ""}.`
        : "No perfect-day streak running.";

    return {
      type: "text",
      value: [
        `${output.today.date} — ${Math.round(output.today.score)}/100, ${output.today.hitCount} of ${output.today.metrics.length} targets hit.`,
        ...lines,
        verdict,
        streak,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});
