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
import { COMPOSITION_KINDS, isCompositionKind, neighboursOf } from "../src/engine/library";
import { loadLibraryFromDir } from "../src/engine/library-loader";
import { isEmotionPalette, type Palette } from "../src/engine/palette";
import { FIGURE_NAMES, isFigureName, type FigureName } from "../src/engine/figure";
import { FORM_NAMES, isFormName, type FormName } from "../src/engine/form";
import {
  REGISTERS,
  chooseKnobs,
  describeKnobs,
  type Knobs,
  type RegisterName,
  type TempoLean,
} from "../src/engine/knobs";
import { makeRng, seedFromString } from "../src/utils/random";

const REGISTER_NAMES = Object.keys(REGISTERS) as RegisterName[];
const TEMPO_LEANS: TempoLean[] = ["slow", "mid", "fast"];

const program = new Command();
program
  .name("compose")
  .description("Compose a composition JSON from a palette + mood")
  .requiredOption("--mood <text>", 'mood/scene, e.g. "dog dies"')
  .option("--palette <slug>", "emotion palette slug (default: best match for --mood)")
  .option("--with <csv>", "extra palette slugs to layer, e.g. jazz,analog-synth", "")
  .option("--seed <text>", "extra entropy for a different take", "")
  .option("--name <name>", "override the output filename/name")
  .option(
    "--figure <name[,name]>",
    `rhythmic cell per section, overriding what the mood chose: ${FIGURE_NAMES.join(" | ")}`,
  )
  .option("--register <name>", `where the bass sits: ${REGISTER_NAMES.join(" | ")}`)
  .option("--tempo <lean>", "where in the palette's range to sit: slow | mid | fast")
  .option(
    "--form <shape>",
    `how much piece to write: ${FORM_NAMES.join(" | ")} — "song" adds an intro and a B section with its own harmony`,
    "sample",
  )
  .option(
    "--kind <kind>",
    `library folder to file it under: ${COMPOSITION_KINDS.join(" | ")}`,
    "segments",
  )
  .option("--force", "overwrite if the composition already exists", false)
  .parse(process.argv);

const opts = program.opts<{
  mood: string;
  palette?: string;
  with: string;
  seed: string;
  name?: string;
  figure?: string;
  register?: string;
  tempo?: string;
  form: string;
  kind: string;
  force: boolean;
}>();

if (!isCompositionKind(opts.kind)) {
  console.error(`Unknown --kind "${opts.kind}". Pick one of: ${COMPOSITION_KINDS.join(", ")}.`);
  process.exit(2);
}

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
const overrides = knobOverrides();
if (!isFormName(opts.form)) {
  console.error(`Unknown --form "${opts.form}". Pick one of: ${FORM_NAMES.join(", ")}.`);
  process.exit(2);
}
const form: FormName = opts.form;
const comp = composeFromBlend(direction, opts.mood, {
  seed: opts.seed,
  name: opts.name,
  knobs: overrides,
  form,
});
if (lineage.length > 1) {
  console.log(
    `Blended ${direction.slugs.join(" + ")} → comps on ${direction.leadVoice}, ` +
      `sings on ${direction.melodyVoice}, pad ${direction.padVoice}.`,
  );
}
for (const warning of direction.warnings) console.warn(`  ! ${warning}`);

// Print what the mood chose. A knob nobody can see is a knob nobody turns, and
// three of this repo's loops became one song by never looking at these.
const chosen: Knobs = {
  ...chooseKnobs(
    opts.mood,
    makeRng(seedFromString(`${opts.mood}|${opts.seed}|${direction.slugs.join("+")}`)),
    direction.meter,
  ),
  ...overrides,
};
console.log("\nKnobs:");
for (const line of describeKnobs(chosen)) console.log(`  ${line}`);
console.log(
  "  " +
    (Object.keys(overrides).length > 0
      ? `(${Object.keys(overrides).join(", ")} from the flags)`
      : "override any of them with --figure / --register / --tempo"),
);
console.log("");

/**
 * The knobs named on the command line. Anything left out is the mood's to
 * choose — this is an override, not a form to fill in.
 */
function knobOverrides(): Partial<Knobs> {
  const out: Partial<Knobs> = {};

  if (opts.figure !== undefined) {
    const names = opts.figure.split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      if (!isFigureName(name)) {
        console.error(`--figure "${name}" is not on the shelf.`);
        console.error(`  pick from: ${FIGURE_NAMES.join(", ")}`);
        console.error(`  or see them described with: npm run figures`);
        process.exit(2);
      }
    }
    // One name means "this cell throughout"; two mean statement then restatement.
    const figures = names as FigureName[];
    out.figures = figures.length === 1 ? [figures[0]!, figures[0]!] : figures;
    // Naming a cell is asking for it, so it outranks the kick lock.
    out.figureFromScene = true;
  }

  if (opts.register !== undefined) {
    if (!REGISTER_NAMES.includes(opts.register as RegisterName)) {
      console.error(`--register "${opts.register}". Pick one of: ${REGISTER_NAMES.join(", ")}.`);
      process.exit(2);
    }
    out.register = opts.register as RegisterName;
  }

  if (opts.tempo !== undefined) {
    if (!TEMPO_LEANS.includes(opts.tempo as TempoLean)) {
      console.error(`--tempo "${opts.tempo}". Pick one of: ${TEMPO_LEANS.join(", ")}.`);
      process.exit(2);
    }
    out.tempo = opts.tempo as TempoLean;
  }

  return out;
}

const issues = validateComposition(comp);
if (issues.length > 0) {
  console.error(`Composer produced an invalid composition (${issues.length} issue(s)):`);
  for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
  process.exit(1);
}

// Kind is the folder (see src/engine/library.ts) — a fresh take is a segment
// until you promote it with `npm run compositions:organize`.
const dir = resolve(process.cwd(), "compositions", opts.kind);
mkdirSync(dir, { recursive: true });
const out = resolve(dir, `${comp.name}.json`);
if (existsSync(out) && !opts.force) {
  console.error(`${out} already exists. Pass --force to overwrite, or --name to rename.`);
  process.exit(1);
}

// Before it lands: is this the last piece again? Same key in the same tempo band
// is the signal docs/variety.md says to look for, and it is cheaper to notice
// here than after a twelve-minute render.
const neighbours = neighboursOf(comp, loadLibraryFromDir(resolve(process.cwd(), "compositions")));
if (neighbours.length > 0) {
  console.warn(`Already on the shelf in this key and tempo band:`);
  for (const { entry, shared } of neighbours.slice(0, 5)) {
    const other = entry.composition;
    console.warn(`  · ${entry.id} — ${other.key} @ ${other.bpm} BPM (shares ${shared.join(", ")})`);
  }
  console.warn(`  Change something, or mean it: --seed, --figure, --register, a different palette.\n`);
}

writeFileSync(out, `${JSON.stringify(comp, null, 2)}\n`, "utf8");
console.log(`Created ${out} — ${comp.key} @ ${comp.bpm} BPM, ${comp.tracks.length} tracks.`);
console.log(`Next: npm run dev, then Play / Export WAV.`);
