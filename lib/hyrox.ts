/**
 * Berto's HYROX races, shown on bertomill.com/fitness.
 *
 * Hand-kept on purpose. The official results (results.hyrox.com, run by
 * mika:timing) sit behind Cloudflare and 403 any server-side fetch, and the
 * hyranking.com mirror starts challenging after a handful of requests, so a
 * cron scraper would break silently. After a race, open the result in a real
 * browser (the `resultUrl` of an upcoming race already points at Berto's
 * entry), copy the workout summary in here, and move the race from UPCOMING
 * to RESULTS.
 */

/** The eight stations, in race order. Every result's splits follow this order. */
export const HYROX_STATIONS = [
  { name: "SkiErg", distance: "1000 m" },
  { name: "Sled Push", distance: "50 m" },
  { name: "Sled Pull", distance: "50 m" },
  { name: "Burpee Broad Jumps", distance: "80 m" },
  { name: "Row", distance: "1000 m" },
  { name: "Farmers Carry", distance: "200 m" },
  { name: "Sandbag Lunges", distance: "100 m" },
  { name: "Wall Balls", distance: "100 reps" },
] as const;

/** One run plus the station that follows it. Times are m:ss, as the official summary prints them. */
export type HyroxSplit = {
  run: string;
  station: string;
  /** Place on that station, from the official workout summary. */
  stationRank: number;
};

export type HyroxResult = {
  /** Also the page anchor: bertomill.com/fitness#hyrox-ottawa-2026. */
  slug: string;
  event: string;
  /** Race day, YYYY-MM-DD. */
  date: string;
  division: string;
  partner?: string;
  ageGroup: string;
  total: string;
  rank: number;
  /** How many finished in the field `rank` is counted against, e.g. 601 "mixed teams". */
  fieldSize: number;
  fieldLabel: string;
  runTotal: string;
  roxzone: string;
  /** Exactly eight, in HYROX_STATIONS order. */
  splits: readonly HyroxSplit[];
  resultUrl: string;
};

export type HyroxUpcoming = {
  slug: string;
  event: string;
  date: string;
  division: string;
  ageGroup: string;
  /** Berto's entry on the official site. It fills in with splits once he finishes. */
  resultUrl: string;
};

/** Newest first. */
export const HYROX_RESULTS: readonly HyroxResult[] = [
  {
    slug: "hyrox-ottawa-2026",
    event: "HYROX Ottawa 2026",
    date: "2026-05-16",
    division: "Mixed doubles",
    partner: "Katy Rozanova",
    ageGroup: "25–29",
    total: "55:20",
    rank: 1,
    fieldSize: 601,
    fieldLabel: "mixed teams",
    runTotal: "31:05",
    roxzone: "3:38",
    splits: [
      { run: "3:32", station: "3:40", stationRank: 6 },
      { run: "3:46", station: "1:40", stationRank: 34 },
      { run: "4:01", station: "2:30", stationRank: 4 },
      { run: "3:51", station: "1:45", stationRank: 1 },
      { run: "3:55", station: "4:00", stationRank: 9 },
      { run: "4:01", station: "1:25", stationRank: 11 },
      { run: "4:02", station: "2:08", stationRank: 3 },
      { run: "4:01", station: "3:35", stationRank: 22 },
    ],
    resultUrl:
      "https://results.hyrox.com/season-8/?content=detail&idp=LR3MS4JI5001E6&event=HD_LR3MS4JI1621&lang=EN_CAP",
  },
  {
    slug: "hyrox-toronto-2025",
    event: "HYROX Toronto 2025",
    date: "2025-10-03",
    division: "Mixed doubles",
    partner: "Katy Rozanova",
    ageGroup: "16–24",
    total: "57:09",
    rank: 1,
    fieldSize: 360,
    fieldLabel: "mixed teams",
    runTotal: "31:15",
    roxzone: "3:55",
    splits: [
      { run: "3:14", station: "3:50", stationRank: 5 },
      { run: "3:58", station: "1:52", stationRank: 83 },
      { run: "3:59", station: "3:08", stationRank: 25 },
      { run: "4:08", station: "1:45", stationRank: 1 },
      { run: "4:15", station: "4:23", stationRank: 18 },
      { run: "4:10", station: "1:24", stationRank: 6 },
      { run: "4:17", station: "2:21", stationRank: 6 },
      { run: "3:19", station: "3:20", stationRank: 2 },
    ],
    resultUrl:
      "https://results.hyrox.com/season-8/?content=detail&idp=LR3MS4JI3DAF59&event=HD_LR3MS4JICD5&lang=EN_CAP",
  },
];

/** Races Berto is entered in. Soonest first. */
export const HYROX_UPCOMING: readonly HyroxUpcoming[] = [
  {
    slug: "hyrox-toronto-2026",
    event: "HYROX Toronto 2026",
    date: "2026-10-02",
    division: "Solo, Pro division",
    ageGroup: "25–29",
    resultUrl:
      "https://results.hyrox.com/season-9/?content=detail&idp=LR3MS4JI595F55&event=HPRO_LR3MS4JI189F&lang=EN_CAP",
  },
];

/** "55:20" or "1:02:10" → seconds. */
export function hyroxSeconds(time: string): number {
  return time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** Today's date in Toronto as YYYY-MM-DD, so a race stops being "up next" at local midnight. */
export function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);
}

/** Whole days from `today` to `date`, both YYYY-MM-DD. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "2026-05-16" → "Saturday, May 16, 2026". Parsed at noon UTC so no timezone can shift the day. */
export function formatRaceDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** 1 → "1st", 22 → "22nd", 11 → "11th". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}
