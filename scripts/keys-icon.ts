/**
 * Draw the keys app's icon, at every size a phone asks for.
 *
 *   npm run keys:icons
 *   npm run keys:icons -- --out public --sizes 192,512 --force
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * The icon is drawn rather than committed because it is *derived* — it is the
 * page's own palette and the page's own lit key, and if `keys.css` ever changes
 * colour the icon should be re-run rather than redrawn by hand in another tool.
 * It is also the only binary this repo would otherwise carry that nothing can
 * regenerate, which is exactly the kind of file the "script the repeatable" rule
 * exists to avoid.
 *
 * Why PNG and not the SVG this shape obviously wants to be: a web app manifest
 * will happily take an SVG, and iOS will not. `apple-touch-icon` has to be a
 * raster or the home screen shows a screenshot of the page instead, and a
 * screenshot of a keyboard at 60 px is a grey rectangle. See
 * [`src/utils/png.ts`](../src/utils/png.ts) for the encoder.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Command } from "commander";
import { encodePng } from "../src/utils/png";

/** The page's palette, from `src/app/keys.css`. Change it there, re-run this. */
type Colour = readonly [r: number, g: number, b: number, a: number];

const BG: Colour = [0x1b, 0x16, 0x28, 0xff];
const WHITE: Colour = [0xe8, 0xe4, 0xf0, 0xff];
const BLACK: Colour = [0x14, 0x12, 0x1a, 0xff];
const ACCENT: Colour = [0xb6, 0xa6, 0xe6, 0xff];

/**
 * Sizes, and why these.
 *
 * 192 and 512 are what a web app manifest is expected to offer — the small one
 * for the home screen, the large one for the splash screen Android generates.
 * 180 is iOS's `apple-touch-icon`, which does not read the manifest at all.
 */
const DEFAULT_SIZES = [180, 192, 512];

const program = new Command();
program
  .name("keys:icons")
  .description("draw the keys app icon as PNGs")
  .option("--out <dir>", "where to write them", "public")
  .option("--sizes <a,b,c>", "pixel sizes to draw", DEFAULT_SIZES.join(","))
  .option("--force", "overwrite icons that already exist")
  .parse();

const opts = program.opts<{ out: string; sizes: string; force?: boolean }>();

const sizes = opts.sizes
  .split(",")
  .map((part) => Number(part.trim()))
  .filter((size) => Number.isInteger(size) && size > 0);
if (sizes.length === 0) {
  console.error("keys:icons: --sizes needs at least one positive integer");
  process.exit(1);
}

const outDir = resolve(process.cwd(), opts.out);
mkdirSync(outDir, { recursive: true });

console.log("");
for (const size of sizes) {
  const file = resolve(outDir, `keys-icon-${size}.png`);
  if (existsSync(file) && !opts.force) {
    console.log(`  kept      ${rel(file)} (exists — --force to redraw)`);
    continue;
  }
  const png = encodePng(size, size, draw(size));
  writeFileSync(file, png);
  console.log(`  drew      ${rel(file)}  ${(png.length / 1024).toFixed(1)} KB`);
}
console.log(`\n  Referenced by public/keys.webmanifest and keys.html.\n`);

function rel(path: string): string {
  return relative(process.cwd(), path).split("\\").join("/");
}

/**
 * The drawing: five white keys, three black ones, and the middle key lit.
 *
 * Lit because that is what the page looks like when it is doing its job, and
 * because a home screen full of dark squares needs one bright shape to be found
 * by. The margins are wide (18% a side) so the whole keyboard survives a
 * `maskable` crop, which cuts a circle out of the middle 80%.
 */
function draw(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  fill(rgba, size, 0, 0, size, size, BG);

  const left = Math.round(size * 0.18);
  const right = Math.round(size * 0.82);
  const top = Math.round(size * 0.27);
  const bottom = Math.round(size * 0.73);
  const width = right - left;
  const height = bottom - top;

  // Five whites as equal shares, with a hairline of background between them —
  // the same 2 px gap the drawn keyboard uses, scaled.
  const whites = 5;
  const share = width / whites;
  const gap = Math.max(1, Math.round(size * 0.012));
  for (let i = 0; i < whites; i += 1) {
    const x = left + Math.round(i * share);
    const w = Math.round(share) - gap;
    fill(rgba, size, x, top, w, height, i === 2 ? ACCENT : WHITE);
  }

  // Blacks at the boundaries that have one: C-D, D-E, F-G. They straddle the
  // boundary and stop short of the bottom, which is the whole reason a drawn
  // keyboard reads as a keyboard.
  const blackWidth = Math.max(2, Math.round(share * 0.58));
  const blackHeight = Math.round(height * 0.62);
  for (const boundary of [1, 2, 4]) {
    const centre = left + Math.round(boundary * share) - Math.round(gap / 2);
    fill(rgba, size, centre - Math.round(blackWidth / 2), top, blackWidth, blackHeight, BLACK);
  }
  return rgba;
}

/** Paint a rectangle, clipped to the canvas. */
function fill(
  rgba: Uint8Array,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: Colour,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(size, x + w);
  const y1 = Math.min(size, y + h);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const at = (py * size + px) * 4;
      rgba[at] = colour[0];
      rgba[at + 1] = colour[1];
      rgba[at + 2] = colour[2];
      rgba[at + 3] = colour[3];
    }
  }
}
