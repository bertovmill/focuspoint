// Neon returns TIMESTAMPTZ columns as JS Date objects, and eve refuses a tool
// result that isn't plain JSON ("returned a non-JSON-serializable result") —
// which silently broke every list_vision call for weeks. Run any raw row a
// tool returns through this: Dates become ISO strings, bigints numbers, and
// everything else is left as it was.
export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  ) as T;
}
