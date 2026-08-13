/**
 * Everyday entry point: turn a mood into a playable composition JSON.
 *   npm run compose -- --palette sad --mood "dog dies"
 *   npm run compose -- --mood "quiet farewell" --seed 2   # auto-pick palette by mood
 * Writes compositions/<name>.json and validates it before it lands.
 * Named flags only (repo convention: no positional arguments).
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { loadPalettesFromDir, findPalettes } from "../src/engine/palette-loader";
import { composeFromPalette } from "../src/engine/composer";
import { validateComposition } from "../src/engine/composition";
import type { Palette } from "../src/engine/palette";

const program = new Command();
program
  .name("compose")
  .description("Compose a composition JSON from a palette + mood")
  .requiredOption("--mood <text>", 'mood/scene, e.g. "dog dies"')
  .option("--palette <slug>", "palette slug to use (default: best match for --mood)")
  .option("--seed <text>", "extra entropy for a different take", "")
  .option("--name <name>", "override the output filename/name")
  .option("--force", "overwrite if the composition already exists", false)
  .parse(process.argv);

const opts = program.opts<{
  mood: string;
  palette?: string;
  seed: string;
  name?: string;
  force: boolean;
}>();

const palettesDir = resolve(process.cwd(), "palettes");
const palettes = loadPalettesFromDir(palettesDir);

let palette: Palette | undefined;
if (opts.palette) {
  palette = palettes.find((p) => p.frontmatter.slug === opts.palette);
  if (!palette) {
    const known = palettes.map((p) => p.frontmatter.slug).join(", ");
    console.error(`No palette "${opts.palette}". Known: ${known || "(none)"}`);
    process.exit(2);
  }
} else {
  palette = findPalettes(palettesDir, opts.mood)[0];
  if (!palette) {
    console.error(`No palette matched "${opts.mood}". Pass --palette <slug> to choose one.`);
    process.exit(2);
  }
  console.log(`Matched palette "${palette.frontmatter.slug}" for mood "${opts.mood}".`);
}

const comp = composeFromPalette(palette, opts.mood, { seed: opts.seed, name: opts.name });

const issues = validateComposition(comp);
if (issues.length > 0) {
  console.error(`Composer produced an invalid composition (${issues.length} issue(s)):`);
  for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
  process.exit(1);
}

const dir = resolve(process.cwd(), "compositions");
mkdirSync(dir, { recursive: true });
const out = resolve(dir, `${comp.name}.json`);
if (existsSync(out) && !opts.force) {
  console.error(`${out} already exists. Pass --force to overwrite, or --name to rename.`);
  process.exit(1);
}

writeFileSync(out, `${JSON.stringify(comp, null, 2)}\n`, "utf8");
console.log(`Created ${out} — ${comp.key} @ ${comp.bpm} BPM, ${comp.tracks.length} tracks.`);
console.log(`Next: npm run dev, then Play / Export WAV.`);
