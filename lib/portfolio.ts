import { getDb } from "./db";
import { slugify } from "./posts";

/**
 * bertomill.com/capabilities — what Berto can do, and the projects that prove it.
 *
 * Three tables (lib/db.ts): `capabilities`, `portfolio_projects`, and the
 * `project_capabilities` join. The join row carries `evidence`: one or two
 * sentences on how *that* project shows *that* capability. That's what makes the
 * page proof rather than a tag cloud.
 *
 * Nothing is hardcoded: Cael edits these through its tools (list_portfolio,
 * save_capability, save_portfolio_project), and the Career tab has an editor.
 * Long-form case studies stay as markdown in content/work; a project points at
 * one through `work_slug`.
 */

export type ProjectStatus = "draft" | "published";

export interface Capability {
  id: number;
  slug: string;
  name: string;
  summary: string;
  sortOrder: number;
}

export interface ProjectCapabilityLink {
  capabilityId: number;
  capabilitySlug: string;
  capabilityName: string;
  evidence: string;
}

export interface PortfolioProject {
  id: number;
  slug: string;
  name: string;
  summary: string;
  year: string | null;
  liveUrl: string | null;
  repoUrl: string | null;
  /** Slug of a case study at /work/<slug>, if there is one. */
  workSlug: string | null;
  status: ProjectStatus;
  sortOrder: number;
  capabilities: ProjectCapabilityLink[];
}

export interface Portfolio {
  capabilities: Capability[];
  projects: PortfolioProject[];
}

export { slugify };

function toCapability(row: Record<string, unknown>): Capability {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    summary: String(row.summary ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function toProject(row: Record<string, unknown>, links: ProjectCapabilityLink[]): PortfolioProject {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    summary: String(row.summary ?? ""),
    year: (row.year as string | null) ?? null,
    liveUrl: (row.live_url as string | null) ?? null,
    repoUrl: (row.repo_url as string | null) ?? null,
    workSlug: (row.work_slug as string | null) ?? null,
    status: row.status === "published" ? "published" : "draft",
    sortOrder: Number(row.sort_order ?? 0),
    capabilities: links,
  };
}

/** Everything, drafts included, in display order. */
export async function getPortfolio(): Promise<Portfolio> {
  const sql = getDb();
  const [capRows, projectRows, linkRows] = await Promise.all([
    sql`SELECT * FROM capabilities ORDER BY sort_order, id`,
    sql`SELECT * FROM portfolio_projects ORDER BY sort_order, id`,
    sql`
      SELECT pc.project_id, pc.capability_id, pc.evidence, c.slug, c.name
      FROM project_capabilities pc
      JOIN capabilities c ON c.id = pc.capability_id
      ORDER BY c.sort_order, c.id
    `,
  ]);
  const linksByProject = new Map<number, ProjectCapabilityLink[]>();
  for (const row of linkRows) {
    const list = linksByProject.get(Number(row.project_id)) ?? [];
    list.push({
      capabilityId: Number(row.capability_id),
      capabilitySlug: String(row.slug),
      capabilityName: String(row.name),
      evidence: String(row.evidence ?? ""),
    });
    linksByProject.set(Number(row.project_id), list);
  }
  return {
    capabilities: capRows.map(toCapability),
    projects: projectRows.map((row) => toProject(row, linksByProject.get(Number(row.id)) ?? [])),
  };
}

/**
 * What the public page shows: published projects only. A database outage is an
 * empty portfolio, not an error page.
 */
export async function getPublishedPortfolio(): Promise<Portfolio> {
  try {
    const all = await getPortfolio();
    return { capabilities: all.capabilities, projects: all.projects.filter((p) => p.status === "published") };
  } catch (error) {
    console.error("portfolio unavailable:", error);
    return { capabilities: [], projects: [] };
  }
}

export interface CapabilityFields {
  name?: string;
  summary?: string;
  sortOrder?: number;
  slug?: string;
}

/** Create a capability, or update the one with this slug. Only the fields passed change. */
export async function upsertCapability(slug: string, fields: CapabilityFields): Promise<Capability> {
  const sql = getDb();
  const [existing] = await sql`SELECT * FROM capabilities WHERE slug = ${slug}`;
  if (!existing) {
    if (!fields.name) throw new Error("A name is needed to create a capability.");
    const [row] = await sql`
      INSERT INTO capabilities (slug, name, summary, sort_order)
      VALUES (${fields.slug ?? slug}, ${fields.name}, ${fields.summary ?? ""},
              ${fields.sortOrder ?? (await nextSortOrder("capabilities"))})
      RETURNING *
    `;
    return toCapability(row);
  }
  const [row] = await sql`
    UPDATE capabilities SET
      slug = ${fields.slug ?? existing.slug},
      name = ${fields.name ?? existing.name},
      summary = ${fields.summary ?? existing.summary},
      sort_order = ${fields.sortOrder ?? existing.sort_order},
      updated_at = NOW()
    WHERE id = ${existing.id}
    RETURNING *
  `;
  return toCapability(row);
}

export async function deleteCapability(id: number): Promise<boolean> {
  const rows = await getDb()`DELETE FROM capabilities WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export interface ProjectFields {
  name?: string;
  summary?: string;
  year?: string | null;
  liveUrl?: string | null;
  repoUrl?: string | null;
  workSlug?: string | null;
  status?: ProjectStatus;
  sortOrder?: number;
  slug?: string;
  /**
   * The full set of capabilities this project proves, keyed by capability slug.
   * When passed, it replaces the project's links: a capability left out is unlinked.
   */
  capabilities?: { slug: string; evidence: string }[];
}

async function nextSortOrder(table: "capabilities" | "portfolio_projects"): Promise<number> {
  const sql = getDb();
  const [row] =
    table === "capabilities"
      ? await sql`SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM capabilities`
      : await sql`SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM portfolio_projects`;
  return Number(row.n);
}

/** `undefined` keeps the stored value; `null` or "" clears it. */
function keepOrClear(next: string | null | undefined, current: unknown): string | null {
  if (next === undefined) return (current as string | null) ?? null;
  return next?.trim() ? next.trim() : null;
}

/**
 * Create a project, or update the one with this slug. Only the fields passed
 * change. Throws on an unknown capability slug so a typo can't silently drop a link.
 */
export async function upsertProject(slug: string, fields: ProjectFields): Promise<PortfolioProject> {
  const sql = getDb();

  let capabilityIds: { id: number; evidence: string }[] | undefined;
  if (fields.capabilities) {
    const slugs = fields.capabilities.map((c) => c.slug);
    const rows = slugs.length ? await sql`SELECT id, slug FROM capabilities WHERE slug = ANY(${slugs})` : [];
    const idBySlug = new Map(rows.map((r) => [String(r.slug), Number(r.id)]));
    const unknown = slugs.filter((s) => !idBySlug.has(s));
    if (unknown.length) throw new Error(`Unknown capability slug(s): ${unknown.join(", ")}. Call list_portfolio.`);
    capabilityIds = fields.capabilities.map((c) => ({ id: idBySlug.get(c.slug)!, evidence: c.evidence.trim() }));
  }

  const [existing] = await sql`SELECT * FROM portfolio_projects WHERE slug = ${slug}`;
  let projectId: number;
  if (!existing) {
    if (!fields.name) throw new Error("A name is needed to create a project.");
    const [row] = await sql`
      INSERT INTO portfolio_projects (slug, name, summary, year, live_url, repo_url, work_slug, status, sort_order)
      VALUES (${fields.slug ?? slug}, ${fields.name}, ${fields.summary ?? ""},
              ${keepOrClear(fields.year, null)}, ${keepOrClear(fields.liveUrl, null)},
              ${keepOrClear(fields.repoUrl, null)}, ${keepOrClear(fields.workSlug, null)},
              ${fields.status ?? "draft"}, ${fields.sortOrder ?? (await nextSortOrder("portfolio_projects"))})
      RETURNING id
    `;
    projectId = Number(row.id);
  } else {
    projectId = Number(existing.id);
    await sql`
      UPDATE portfolio_projects SET
        slug = ${fields.slug ?? existing.slug},
        name = ${fields.name ?? existing.name},
        summary = ${fields.summary ?? existing.summary},
        year = ${keepOrClear(fields.year, existing.year)},
        live_url = ${keepOrClear(fields.liveUrl, existing.live_url)},
        repo_url = ${keepOrClear(fields.repoUrl, existing.repo_url)},
        work_slug = ${keepOrClear(fields.workSlug, existing.work_slug)},
        status = ${fields.status ?? existing.status},
        sort_order = ${fields.sortOrder ?? existing.sort_order},
        updated_at = NOW()
      WHERE id = ${projectId}
    `;
  }

  if (capabilityIds) {
    await sql`DELETE FROM project_capabilities WHERE project_id = ${projectId}`;
    for (const { id, evidence } of capabilityIds) {
      await sql`
        INSERT INTO project_capabilities (project_id, capability_id, evidence)
        VALUES (${projectId}, ${id}, ${evidence})
      `;
    }
  }

  const project = (await getPortfolio()).projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project vanished after saving.");
  return project;
}

export async function deleteProject(id: number): Promise<boolean> {
  const rows = await getDb()`DELETE FROM portfolio_projects WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export const CAPABILITIES_URL = "https://bertomill.com/capabilities";
