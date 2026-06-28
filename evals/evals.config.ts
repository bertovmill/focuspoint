import { defineEvalConfig } from "eve/evals";

// Shared defaults for every eval. Kept minimal — no judge model or external
// reporter yet. Add `judge: { model: "..." }` here when an eval needs
// LLM-as-judge grading, and a reporter (e.g. Braintrust) for shared review.
export default defineEvalConfig({});
