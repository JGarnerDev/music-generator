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
import { composeFromBlend } from "../src/engine/composer";
import { blendPalettes, withAncestors } from "../src/engine/blend";
import { validateComposition } from "../src/engine/composition";
import { isEmotionPalette, type Palette } from "../src/engine/palette";

const program = new Command();
program
  .name("compose")
  .description("Compose a composition JSON from a palette + mood")
  .requiredOption("--mood <text>", 'mood/scene, e.g. "dog dies"')
  .option("--palette <slug>", "emotion palette slug (default: best match for --mood)")
  .option("--with <csv>", "extra palette slugs to layer, e.g. jazz,analog-synth", "")
  .option("--seed <text>", "extra entropy for a different take", "")
  .option("--name <name>", "override the output filename/name")
  .option("--force", "overwrite if the composition already exists", false)
  .parse(process.argv);

const opts = program.opts<{
  mood: string;
  palette?: string;
  with: string;
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
  // Only emotion palettes are directly composable; genre/timbre feed the blend.
  palette = findPalettes(palettesDir, opts.mood).find(isEmotionPalette);
  if (!palette) {
    console.error(`No emotion palette matched "${opts.mood}". Pass --palette <slug> to choose one.`);
    process.exit(2);
  }
  console.log(`Matched palette "${palette.frontmatter.slug}" for mood "${opts.mood}".`);
}

if (!isEmotionPalette(palette)) {
  console.error(
    `Palette "${palette.frontmatter.slug}" is a ${palette.frontmatter.kind}, not an emotion. ` +
      `compose needs an emotion palette (genre/timbre/… are blend layers, not directly composable).`,
  );
  process.exit(2);
}

// Layer any extra palettes (genre/timbre/…) named via --with onto the emotion.
const layers: Palette[] = [palette];
for (const slug of opts.with.split(",").map((s) => s.trim()).filter(Boolean)) {
  const found = palettes.find((p) => p.frontmatter.slug === slug);
  if (!found) {
    const known = palettes.map((p) => p.frontmatter.slug).join(", ");
    console.error(`No palette "${slug}" to layer. Known: ${known || "(none)"}`);
    process.exit(2);
  }
  layers.push(found);
}

// A subtype pulls in its parent first (desert-rock → rock, desert-rock), so it
// inherits everything it didn't restate.
const lineage = withAncestors(layers, palettes);
const direction = blendPalettes(lineage);
const comp = composeFromBlend(direction, opts.mood, { seed: opts.seed, name: opts.name });
if (lineage.length > 1) {
  console.log(`Blended ${direction.slugs.join(" + ")} → ${direction.leadVoice}/${direction.padVoice}.`);
}

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
