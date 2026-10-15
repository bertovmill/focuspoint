// The cards are the photos from my LinkedIn posts (lib/site-moments). Each one
// is grouped by the year it went up, which is what the filter switches between,
// and `hue` picks its glass tint (0 pale blue for the latest year, 1 lavender
// before it); where cards merge the two blend through violet.

import { MOMENTS, type Moment } from "@/lib/site-moments";

export interface CardData extends Moment {
  readonly id: string;
  /** The year the post went up: the filter's groups. */
  readonly group: string;
  readonly hue: number;
}

const LATEST = MOMENTS.reduce((year, m) => (m.date.slice(0, 4) > year ? m.date.slice(0, 4) : year), "");

export const CARDS: readonly CardData[] = MOMENTS.map((m) => {
  const group = m.date.slice(0, 4);
  return { ...m, id: m.slug, group, hue: group === LATEST ? 0 : 1 };
});

/** Newest first: the filter's options after "All". */
export const GROUPS: readonly string[] = [...new Set(CARDS.map((card) => card.group))].sort().reverse();

export const CARD_BY_ID: ReadonlyMap<string, CardData> = new Map(CARDS.map((card) => [card.id, card]));

export function formatMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(y, m - 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}
