// Saves a recipe into the recipe box (/meals/recipes) from a link or from
// pasted text (for sites that block apps). Most recipe sites publish a
// schema.org Recipe as JSON-LD; when one is there the model reads that,
// otherwise it reads the page's text. Either way it hands back one
// serving, so a saved recipe reads like the bank meals: "Serves 1", with protein
// and calories per plate and plain grocery names for the grocery list.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "./db";
import { normalizeIngredients } from "./nutrition";
import { shapeRecipe, type Recipe } from "./nutrition-plan";

const MODEL = "anthropic/claude-sonnet-4.6";
const MAX_HTML = 3_000_000;
const MAX_TEXT = 24_000;

/** A failure worth showing him as is ("Couldn't find a recipe on that page."). */
export class ImportError extends Error {}

const Imported = z.object({
  found: z.boolean().describe("false when the page has no recipe on it"),
  name: z.string(),
  description: z.string().describe("One short line on why it's good, in your own words, not copied"),
  minutes: z.number().int().nullable().describe("Total time, prep plus cook"),
  lines: z.array(z.string()).describe("Ingredient lines with amounts, scaled to ONE serving"),
  steps: z.array(z.string()).describe("The method, one step per item, scaled to one serving"),
  ingredients: z.array(z.string()).describe("Plain grocery names for a shopping list: 'chicken thighs', 'lemon'"),
  protein_g: z.number().nullable().describe("Protein in grams for one serving, from the page or estimated"),
  kcal: z.number().int().nullable().describe("Calories for one serving, from the page or estimated"),
});

/** Blocks links to this machine or a private network, so the server only fetches public pages. */
function isPrivateAddress(ip: string) {
  if (ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) !== 4) return false;
  const [a, b] = v4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("That doesn't look like a link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ImportError("Only web links work here.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new ImportError("That link isn't a public page.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new ImportError("Couldn't find that site.");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new ImportError("That link isn't a public page.");
  return url;
}

async function fetchPage(url: URL): Promise<string> {
  let current = url;
  // Redirects are followed by hand so each hop gets the same public-address check.
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = await assertPublicUrl(new URL(res.headers.get("location")!, current).toString());
      continue;
    }
    if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
      throw new ImportError("That site won't let apps read it. Copy the recipe from the page and paste the text here instead.");
    }
    if (!res.ok) throw new ImportError(`That page wouldn't open (${res.status}).`);
    const html = await res.text();
    return html.length > MAX_HTML ? html.slice(0, MAX_HTML) : html;
  }
  throw new ImportError("That link redirects too many times.");
}

/** Every schema.org Recipe in the page's JSON-LD blocks, @graph and arrays included. */
function findJsonLdRecipe(html: string): unknown | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const isRecipe = (n: Record<string, unknown>) => {
    const t = n["@type"];
    return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
  };
  const walk = (node: unknown): unknown | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const hit = walk(n);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    if (isRecipe(obj)) return obj;
    return walk(obj["@graph"]);
  };
  for (const [, body] of blocks) {
    try {
      const hit = walk(JSON.parse(body.trim()));
      if (hit) return hit;
    } catch {
      // A broken block on the page; try the next one.
    }
  }
  return null;
}

function pageText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/** Saves a recipe from a link, or from pasted recipe text when `input` isn't a link. */
export async function importRecipe(input: string): Promise<{ recipe: Recipe; existed: boolean }> {
  const trimmed = input.trim();
  const isLink = /^https?:\/\/\S+$/i.test(trimmed);
  const sql = getDb();

  let url: URL | null = null;
  let source: string;
  if (isLink) {
    url = await assertPublicUrl(trimmed);
    const [already] = await sql`SELECT * FROM nutrition_recipes WHERE source_url = ${url.toString()} AND archived_at IS NULL LIMIT 1`;
    if (already) return { recipe: shapeRecipe(already as Record<string, unknown>), existed: true };
    const html = await fetchPage(url);
    const ld = findJsonLdRecipe(html);
    source = `Link: ${url.toString()}\n\n${ld ? `The page's schema.org Recipe data:\n${JSON.stringify(ld).slice(0, MAX_TEXT)}` : `The page's text:\n${pageText(html)}`}`;
  } else {
    if (trimmed.length < 40) throw new ImportError("Paste a recipe link, or the whole recipe text.");
    source = `Recipe text he pasted:\n${trimmed.slice(0, MAX_TEXT)}`;
  }

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: Imported }),
    system: `You turn a recipe into one entry in Berto's recipe box. Keep the recipe's own ingredients and method, but scale every amount to ONE serving, and write the steps as short, clear instructions. Give protein and calories for that one serving: use the recipe's nutrition when it has it (divided by servings), otherwise estimate from the ingredients. If there's no recipe in it, set found to false. Never use em dashes.`,
    prompt: source,
    temperature: 0.2,
    maxOutputTokens: 3000,
  });
  if (!output.found || !output.name.trim() || output.lines.length === 0) {
    throw new ImportError(isLink ? "Couldn't find a recipe on that page." : "Couldn't find a recipe in that text.");
  }

  const [row] = await sql`
    INSERT INTO nutrition_recipes (name, description, ingredients, minutes, ingredient_lines, steps, protein_g, kcal, source_url, saved_to_box)
    VALUES (
      ${output.name.trim()}, ${output.description.trim() || null}, ${normalizeIngredients(output.ingredients)},
      ${output.minutes}, ${output.lines}, ${output.steps},
      ${output.protein_g === null ? null : Math.round(output.protein_g)}, ${output.kcal}, ${url ? url.toString() : null}, true
    )
    RETURNING *
  `;
  return { recipe: shapeRecipe(row as Record<string, unknown>), existed: false };
}
