/**
 * Splits the homepage desk cutout into two layers: the desk (with the lamp,
 * the notebook, the pot and its shadow) and the money tree above the soil, so
 * the tree can turn and sway on its own while the pot stays put on the desk.
 * (Moving the pot too left two copies of it slipping apart.) Prints the fractions
 * `scene.ts` needs (PLANT_ART) to lay the plant back exactly where it was.
 *
 *   node scripts/split-desk-plant.mjs [public/site-art/desk-oak-money-tree.webp]
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const src = process.argv[2] ?? "public/site-art/desk-oak-money-tree.webp";
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const opaque = (x, y) => px(x, y)[3] > 110;
// The pot: pale, unsaturated ceramic. The slab is tan, the leaves green.
const potLike = (x, y) => {
  const [r, g, b, a] = px(x, y);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return a > 110 && max > 120 && (max - min) / max < 0.16;
};

// The slab's back edge: the first opaque row, over columns that hold nothing
// but desk. Objects on the desk start higher, so take the lowest answer.
let yBack = 0;
for (let x = Math.round(W * 0.3); x < W * 0.6; x += 4) {
  for (let y = 0; y < H; y++) if (opaque(x, y)) { yBack = Math.max(yBack, y); break; }
}

// The tree: everything opaque above the slab, right of centre.
let treeL = W, treeR = 0, treeTop = H;
for (let x = Math.round(W * 0.5); x < W; x++) {
  for (let y = 0; y < yBack - 2; y++) {
    if (opaque(x, y)) { treeL = Math.min(treeL, x); treeR = Math.max(treeR, x); treeTop = Math.min(treeTop, y); break; }
  }
}

// The pot, around the slab's back edge.
let potL = W, potR = 0, potTop = H, potBottom = 0;
for (let y = Math.round(yBack - H * 0.18); y < Math.min(H, yBack + H * 0.12); y++) {
  let count = 0, l = W, r = 0;
  for (let x = treeL; x <= treeR; x++) if (potLike(x, y)) { count++; l = Math.min(l, x); r = Math.max(r, x); }
  if (count >= 18) { potTop = Math.min(potTop, y); potBottom = Math.max(potBottom, y); potL = Math.min(potL, l); potR = Math.max(potR, r); }
}

console.log({ W, H, yBack, tree: { treeL, treeR, treeTop }, pot: { potL, potR, potTop, potBottom } });

// The pot's silhouette, row by row. Its shaded right side is too dark for
// potLike, so find the true centre where the pot stands against nothing (the
// opaque run around it, above the slab), then mirror the lit left edge about
// it. Everything inside (soil, the trunk's base) counts as pot. A pixel of
// margin keeps the soft edge.
const leafy = (x, y) => {
  const [r, g, b] = px(x, y);
  return g > r * 1.05 && g > b;
};
const solid = (x, y) => opaque(x, y) && !leafy(x, y);
const row = Math.round((potTop + yBack) / 2);
let runL = Math.round((potL + potR) / 2), runR = runL;
while (runL > treeL && solid(runL - 1, row)) runL--;
while (runR < treeR && solid(runR + 1, row)) runR++;
const potCx = (runL + runR) / 2;
// The rim and the soil rise a little above the first pale row.
let rimTop = potTop;
while (rimTop > treeTop && (solid(runL + 4, rimTop - 1) || solid(runR - 4, rimTop - 1))) rimTop--;
const potHalf = new Map();
let lastHalf = (runR - runL) / 2;
for (let y = rimTop; y <= potBottom; y++) {
  let count = 0, l = W;
  for (let x = treeL; x <= treeR; x++) if (potLike(x, y)) { count++; l = Math.min(l, x); }
  if (count >= 18) lastHalf = potCx - l;
  potHalf.set(y, lastHalf + 1);
}
console.log({ potCx, rimTop, potRun: [runL, runR], potHalfAt: { [row]: potHalf.get(row) } });
const inPot = (x, y) => potHalf.has(y) && Math.abs(x - potCx) <= potHalf.get(y);

// Plant layer: the tree's box down to the pot's base, but only the tree:
// the pot and everything below the slab's back edge go transparent.
const plant = Buffer.alloc(data.length);
data.copy(plant);
const plantW = treeR - treeL + 1;
const plantH = potBottom - treeTop + 1;
for (let y = treeTop; y <= potBottom; y++) {
  for (let x = treeL; x <= treeR; x++) {
    if (y >= yBack - 1 || inPot(x, y)) plant[(y * W + x) * 4 + 3] = 0;
  }
}
const plantPng = await sharp(plant, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: treeL, top: treeTop, width: plantW, height: plantH })
  .webp({ quality: 90, effort: 6, alphaQuality: 95 }).toBuffer();
await writeFile("public/site-art/plant-money-tree.webp", plantPng);

// Desk layer: the tree's box above the slab goes transparent, all but the pot.
const base = Buffer.alloc(data.length);
data.copy(base);
for (let y = treeTop; y < yBack - 1; y++) {
  for (let x = treeL; x <= treeR; x++) if (!inPot(x, y)) base[(y * W + x) * 4 + 3] = 0;
}
const basePng = await sharp(base, { raw: { width: W, height: H, channels: 4 } })
  .webp({ quality: 90, effort: 6, alphaQuality: 95 }).toBuffer();
await writeFile("public/site-art/desk-oak-base.webp", basePng);

const f = (n) => Number(n.toFixed(4));
console.log("PLANT_ART fractions of the desk image:", {
  left: f(treeL / W), right: f((treeR + 1) / W), top: f(treeTop / H), bottom: f((potBottom + 1) / H),
});
console.log("POT within the plant image:", {
  x: f((potCx - treeL) / plantW), top: f((potTop - treeTop) / plantH), r: f((runR - runL) / 2 / plantW),
});
console.log("sizes", { plant: `${plantW}x${plantH}`, kb: { plant: Math.round(plantPng.length / 1024), base: Math.round(basePng.length / 1024) } });
