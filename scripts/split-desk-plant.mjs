/**
 * Splits the homepage desk cutout into two layers: the desk (with the lamp,
 * the notebook and the pot's shadow) and the potted money tree, so the plant
 * can turn and react on its own in front of the desk. Prints the fractions
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

// Plant layer: the tree's box down to the pot's base. Below the slab's back
// edge only the pot survives; the desk behind it goes transparent.
const plant = Buffer.alloc(data.length);
data.copy(plant);
const plantW = treeR - treeL + 1;
const plantH = potBottom - treeTop + 1;
for (let y = treeTop; y <= potBottom; y++) {
  for (let x = treeL; x <= treeR; x++) {
    const i = (y * W + x) * 4;
    if (y >= yBack - 1) {
      const inPot = x >= potL - 2 && x <= potR + 2 && potLike(x, y);
      if (!inPot) plant[i + 3] = 0;
    }
  }
}
const plantPng = await sharp(plant, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: treeL, top: treeTop, width: plantW, height: plantH })
  .webp({ quality: 90, effort: 6, alphaQuality: 95 }).toBuffer();
await writeFile("public/site-art/plant-money-tree.webp", plantPng);

// Desk layer: the tree's box above the slab goes transparent.
const base = Buffer.alloc(data.length);
data.copy(base);
for (let y = treeTop; y < yBack - 1; y++) {
  for (let x = treeL; x <= treeR; x++) base[(y * W + x) * 4 + 3] = 0;
}
const basePng = await sharp(base, { raw: { width: W, height: H, channels: 4 } })
  .webp({ quality: 90, effort: 6, alphaQuality: 95 }).toBuffer();
await writeFile("public/site-art/desk-oak-base.webp", basePng);

const f = (n) => Number(n.toFixed(4));
console.log("PLANT_ART fractions of the desk image:", {
  left: f(treeL / W), right: f((treeR + 1) / W), top: f(treeTop / H), bottom: f((potBottom + 1) / H),
});
console.log("POT within the plant image:", {
  x: f(((potL + potR) / 2 - treeL) / plantW), top: f((potTop - treeTop) / plantH), r: f((potR - potL) / 2 / plantW),
});
console.log("sizes", { plant: `${plantW}x${plantH}`, kb: { plant: Math.round(plantPng.length / 1024), base: Math.round(basePng.length / 1024) } });
