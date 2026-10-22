import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { jsonSafe } from "../../lib/json-safe";

const MAX_ROWS = 200;

// Read-only SQL against Cael's Neon database, for questions no purpose-built tool
// answers ("how many runs over 15k this year", "which meals have I eaten most").
// The query runs inside a READ ONLY transaction, so Postgres itself refuses any
// write, whatever the SQL says; writes go through `write_database`, which asks
// first.
export default defineTool({
  deferred: true,
  description:
    "Run one read-only SQL query (Postgres) against Cael's own database — every table behind the app: todos, thoughts, workouts, training sessions, meals, nutrition, reading, vision, posts, settings and more. Use when no specific tool answers the question. Call with `describe: true` first (optionally with `table`) to see tables and columns; never guess column names. Returns at most 200 rows — aggregate or LIMIT in SQL rather than pulling raw rows.",
  inputSchema: z.object({
    sql: z.string().optional().describe("A single SELECT (or WITH … SELECT). Not needed with describe."),
    describe: z.boolean().optional().describe("List tables and their columns instead of running a query."),
    table: z.string().optional().describe("With describe: only this table."),
  }),
  async execute({ sql: query, describe, table }) {
    const sql = getDb();
    if (describe || !query?.trim()) {
      const columns = await sql`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND (${table ?? null}::text IS NULL OR table_name = ${table ?? null})
        ORDER BY table_name, ordinal_position
      `;
      const tables: Record<string, string[]> = {};
      for (const c of columns) {
        (tables[c.table_name] ??= []).push(`${c.column_name} ${c.data_type}${c.is_nullable === "NO" ? " not null" : ""}`);
      }
      return { kind: "schema" as const, tables };
    }
    const [, result] = await sql.transaction(
      (txn) => [txn.query("SET LOCAL statement_timeout = '15s'"), txn.query(query.trim().replace(/;\s*$/, ""))],
      { readOnly: true, fullResults: true },
    );
    const rows = result!.rows;
    return {
      kind: "rows" as const,
      rowCount: rows.length,
      truncated: rows.length > MAX_ROWS,
      rows: jsonSafe(rows.slice(0, MAX_ROWS)),
    };
  },
  toModelOutput(output) {
    if (output.kind === "schema") {
      const names = Object.keys(output.tables);
      if (!names.length) return { type: "text", value: "No matching tables." };
      return {
        type: "text",
        value: names.map((t) => `${t}: ${output.tables[t]!.join(", ")}`).join("\n"),
      };
    }
    const head = output.truncated
      ? `${output.rowCount} rows; showing the first ${MAX_ROWS}.`
      : `${output.rowCount} row${output.rowCount === 1 ? "" : "s"}.`;
    return { type: "text", value: `${head}\n${JSON.stringify(output.rows)}` };
  },
});
