import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { jsonSafe } from "../../lib/json-safe";

// The escape hatch for changing data no purpose-built tool covers: fixing a bad
// row, a bulk rename, backfilling a column. Every call shows Berto the exact SQL
// and waits for his approval. Statements run in one transaction, so a failure
// part-way through leaves nothing half-applied.
export default defineTool({
  deferred: true,
  description:
    "Change data in Cael's database with SQL (INSERT / UPDATE / DELETE, or DDL when Berto asks for it). Only when no specific tool does the job — prefer add_todo, log_meal, etc. Look the rows up with query_database first and use WHERE clauses that hit exactly the rows meant. Berto approves every call after seeing the SQL. All statements run in one transaction. Never DROP or TRUNCATE a table unless he explicitly asked for that.",
  inputSchema: z.object({
    statements: z.array(z.string().min(1)).min(1).max(20).describe("SQL statements, run in order in one transaction."),
    reason: z.string().describe("One line on what this changes and why, shown with the approval."),
  }),
  approval: {
    request: always(),
    prompt: ({ input }) => `${input.reason}\n\n${input.statements.join(";\n")};`,
  },
  async execute({ statements }) {
    const sql = getDb();
    const results = await sql.transaction(
      (txn) => [
        txn.query("SET LOCAL statement_timeout = '30s'"),
        ...statements.map((s) => txn.query(s.trim().replace(/;\s*$/, ""))),
      ],
      { fullResults: true },
    );
    return {
      results: results.slice(1).map((r, i) => ({
        statement: i + 1,
        command: r.command,
        rowCount: r.rowCount,
        rows: jsonSafe(r.rows.slice(0, 20)),
      })),
    };
  },
  toModelOutput({ results }) {
    return {
      type: "text",
      value: results
        .map((r) => `${r.statement}. ${r.command} ${r.rowCount ?? 0}${r.rows.length ? ` ${JSON.stringify(r.rows)}` : ""}`)
        .join("\n"),
    };
  },
});
