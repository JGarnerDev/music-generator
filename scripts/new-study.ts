/**
 * Fan out a set of attempts at one musical concept.
 *
 *   npm run study:new -- --concept guitar-solo --axis phrasing --mood "dusty standoff"
 *   npm run study:new -- --concept chorus-lift --axis register --mood "storm breaks" --n 4
 *   npm run study:new -- --concepts            # print the shelf and stop
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * Writes `studies/<concept>/<set>-<a|b|c|d>.json`, all four sharing one key,
 * tempo, backing and set of voices — because a thumb can only be about the axis
 * if the axis is the only thing that moved. That is rule 1 of
 * [`docs/studies.md`](../docs/studies.md) and it is enforced here rather than
 * trusted: the composition is generated once and the variants are derived from
 * it.
 *
 * **Knob axes are finished; written axes are scaffolded.** `register`, `tempo`,
 * `figure` and `harmonic-rate` are things the composer already turns, so those
 * attempts differ for real and render immediately. `phrasing`, `contour`,
 * `note-choice` and the rest are judgements no field encodes — those land as
 * `draft: true` with identical material, and the varying part is written by
 * hand before they mean anything.
 */
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { blendPalettes, withAncestors } from "../src/engine/blend";
import { composeFromBlend } from "../src/engine/composer";
import { findPalettes, loadPalettesFromDir } from "../src/engine/palette-loader";
import { isEmotionPalette, type Palette } from "../src/engine/palette";
import {
  FIGURE_NAMES,
  figureFitsMeter,
  isFigureName,
  type FigureName,
} from "../src/engine/figure";
import type { Knobs, RegisterName, TempoLean } from "../src/engine/knobs";
import { INSTRUMENT_NAMES, type Composition, type InstrumentName } from "../src/engine/composition";
import {
  CONCEPTS,
  CONCEPT_GROUPS,
  STUDY_AXES,
  STUDY_MAX_BARS,
  axisOf,
  conceptOf,
  stripToParts,
  studyBars,
  validateStudy,
  type Concept,
  type Study,
  type StudyAxis,
} from "../src/engine/study";
import { studiesRoot, studyFile, writeLedger, writeStudy } from "../src/dev/study-store";
import { makeRng, pick, seedFromString } from "../src/utils/random";

/** Attempts per set. Four is enough to see a trend and few enough to hear in a sitting. */
const DEFAULT_N = 4;

/** Suffixes for the attempts, in order. Caps the set at a comfortable size. */
const LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h"];

const program = new Command();
program
  .name("study:new")
  .description("Fan out N attempts at one musical concept, differing on exactly one axis")
  .option("--concept <slug>", "concept to study — see --concepts for the shelf")
  .option("--axis <name>", "what the attempts differ on (default: the concept's first axis)")
  .option("--mood <text>", 'scene words the shared context is built from, e.g. "dusty standoff"')
  .option("--palette <slug>", "emotion palette (default: best match for --mood)")
  .option("--with <csv>", "extra palette slugs to layer, e.g. spaghetti-western,analog-synth", "")
  .option(
    "--only <csv>",
    "strip every attempt to these instruments, e.g. bass,lead — the parts the axis is about",
    "",
  )
  .option("--set <slug>", "name for this set of attempts (default: derived from the mood)")
  .option("--n <count>", `attempts to write`, String(DEFAULT_N))
  .option("--seed <text>", "extra entropy for a different shared context", "")
  .option("--concepts", "print the concept shelf and exit", false)
  .option("--axes", "print the axis shelf and exit", false)
  .option("--force", "overwrite attempts that already exist", false)
  .parse(process.argv);

const opts = program.opts<{
  concept?: string;
  axis?: string;
  mood?: string;
  palette?: string;
  with: string;
  only: string;
  set?: string;
  n: string;
  seed: string;
  concepts: boolean;
  axes: boolean;
  force: boolean;
}>();

if (opts.concepts) {
  printConcepts();
  process.exit(0);
}
if (opts.axes) {
  printAxes();
  process.exit(0);
}

const concept = requireConcept(opts.concept);
const axis = requireAxis(concept, opts.axis);
const mood = requireMood(opts.mood);
const count = requireCount(opts.n);
const only = requireParts(opts.only);

const set = (opts.set ?? slugify(mood)).trim();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(set)) {
  console.error(`--set "${set}" must be kebab-case. Pass --set <slug> explicitly.`);
  process.exit(2);
}

const rng = makeRng(seedFromString(`${concept.slug}|${axis.name}|${mood}|${opts.seed}`));

// ── The shared context, generated once ──────────────────────────────────────

const palettesDir = resolve(process.cwd(), "palettes");
const palettes = loadPalettesFromDir(palettesDir);
const emotion = resolveEmotion();
const lineage = withAncestors([emotion, ...layers()], palettes);
const direction = blendPalettes(lineage);
for (const warning of direction.warnings) console.warn(`  ! ${warning}`);

/** The values the attempts take on the axis — the one thing allowed to differ. */
const variants = variantsFor(axis, count);
if (variants.length < count) {
  console.warn(
    `  ! ${axis.name} only offers ${variants.length} distinct value(s); writing ${variants.length} attempt(s), not ${count}.`,
  );
}

const written: string[] = [];
const dir = resolve(studiesRoot(), concept.slug);
mkdirSync(dir, { recursive: true });

variants.forEach((variant, index) => {
  const slug = `${set}-${LETTERS[index]}`;
  const id = `${concept.slug}/${slug}`;
  const path = studyFile(id);
  if (existsSync(path) && !opts.force) {
    console.error(`${id} already exists. Pass --force to overwrite, or --set to rename.`);
    process.exit(1);
  }

  const composition = compose(variant, index);
  const bars = studyBars(composition);
  if (bars > STUDY_MAX_BARS) {
    console.warn(`  ! ${id} is ${bars} bars — studies are meant to stay at ${STUDY_MAX_BARS}.`);
  }

  const study: Study = {
    concept: concept.slug,
    slug,
    title: `${concept.title} — ${variant}`,
    set,
    axis: axis.name,
    variant,
    approach: approachLine(variant),
    mood,
    held: heldLine(composition),
    ...(axis.kind === "written" ? { draft: true } : {}),
    composition,
  };

  const issues = validateStudy(study);
  if (issues.length > 0) {
    console.error(`Generated an invalid study (${issues.length} issue(s)):`);
    for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
    process.exit(1);
  }

  writeStudy(path, study);
  written.push(id);
});

writeLedger();
report();

// ── Composition ─────────────────────────────────────────────────────────────

/**
 * One attempt's composition: the shared context, plus this attempt's knob.
 *
 * The seed is the *set's*, not the attempt's, so everything the axis doesn't
 * touch is bit-identical across the set. A per-attempt seed would have made four
 * different pieces that also differ on the axis, which is precisely the
 * confounded comparison this whole file exists to prevent.
 */
function compose(variant: string, index: number): Composition {
  const knobs = knobsFor(variant);
  const full = composeFromBlend(direction, mood, {
    seed: `study|${set}|${opts.seed}`,
    name: `study-${concept.slug}-${set}-${LETTERS[index]}`,
    knobs,
    form: "sample",
  });
  // Stripped *after* composing, not by asking the palette for fewer parts: the
  // arrangement the palette would really write is the context the verdict has to
  // hold for, and only the tracks that are not the question get taken away.
  const stripped = stripToParts(full, only);
  const had = [...new Set(full.tracks.map((t) => t.instrument))];
  if (stripped.tracks.length === 0) {
    console.error(`--only ${only.join(",")} left no tracks — this blend writes: ${had.join(", ")}`);
    process.exit(1);
  }
  // Naming a part the blend never wrote is worse than a typo: the set still
  // builds, one part lighter than asked for, and the axis ends up being judged
  // against a thinner arrangement than the handoff describes.
  if (index === 0) {
    const missing = only.filter((name) => !had.includes(name));
    if (missing.length > 0) {
      console.warn(
        `  ! --only names ${missing.join(", ")}, which this blend does not write — kept ${stripped.tracks
          .map((t) => t.instrument)
          .join(", ")}. It writes: ${had.join(", ")}.`,
      );
    }
  }
  return stripped;
}

/** The knob override this variant stands for. Written axes override nothing. */
function knobsFor(variant: string): Partial<Knobs> {
  switch (axis.name) {
    case "register":
      return { register: variant as RegisterName };
    case "tempo":
      return { tempo: variant as TempoLean };
    case "figure":
      return { figures: [variant as FigureName, variant as FigureName], figureFromScene: true };
    case "harmonic-rate":
      return { splitBars: variant === "split-bars" };
    default:
      // A written axis: identical material for every attempt, deliberately. The
      // difference is the part still to be written, and `draft: true` says so.
      return {};
  }
}

/** The values this axis fans out across, capped at `count` and always distinct. */
function variantsFor(chosen: StudyAxis, n: number): string[] {
  if (chosen.name === "figure") {
    // Filtered by meter: the shelf carries cells of both lengths, and a 3/4 cell
    // picked for a 4/4 blend (or the reverse) throws out of the composer rather
    // than producing an attempt, which kills the whole set mid-fan-out.
    const shelf = [...FIGURE_NAMES]
      .filter(isFigureName)
      .filter((name) => figureFitsMeter(name, direction.meter));
    const picked: FigureName[] = [];
    while (picked.length < Math.min(n, shelf.length)) {
      const candidate = pick(rng, shelf.filter((name) => !picked.includes(name)));
      picked.push(candidate);
    }
    return picked;
  }
  if (chosen.values) return [...chosen.values].slice(0, n);
  // A written axis has no shelf of values — the attempts are placeholders named
  // by position, to be renamed when the varying part is actually written.
  return LETTERS.slice(0, n).map((letter) => `take ${letter.toUpperCase()}`);
}

function approachLine(variant: string): string {
  return axis.kind === "knob"
    ? `${axis.name} = ${variant}; everything else held.`
    : `${axis.name}: to be written — ${variant} of the set, material still shared.`;
}

function heldLine(comp: Composition): string {
  const parts = comp.tracks.map((track) => track.instrument).join(", ");
  return `${comp.key} @ ${comp.bpm} BPM, ${parts}`;
}

// ── Flag plumbing ───────────────────────────────────────────────────────────

function resolveEmotion(): Palette {
  if (opts.palette) {
    const found = palettes.find((p) => p.frontmatter.slug === opts.palette);
    if (!found) {
      console.error(`No palette "${opts.palette}". Known: ${palettes.map((p) => p.frontmatter.slug).join(", ")}`);
      process.exit(2);
    }
    if (!isEmotionPalette(found)) {
      console.error(`Palette "${opts.palette}" is a ${found.frontmatter.kind}, not an emotion.`);
      process.exit(2);
    }
    return found;
  }
  const matched = findPalettes(palettesDir, mood).find(isEmotionPalette);
  if (!matched) {
    console.error(`No emotion palette matched "${mood}". Pass --palette <slug>.`);
    process.exit(2);
  }
  console.log(`Matched palette "${matched.frontmatter.slug}" for mood "${mood}".`);
  return matched;
}

function layers(): Palette[] {
  const out: Palette[] = [];
  for (const slug of opts.with.split(",").map((s) => s.trim()).filter(Boolean)) {
    const found = palettes.find((p) => p.frontmatter.slug === slug);
    if (!found) {
      console.error(`No palette "${slug}" to layer. Known: ${palettes.map((p) => p.frontmatter.slug).join(", ")}`);
      process.exit(2);
    }
    out.push(found);
  }
  return out;
}

function requireConcept(slug: string | undefined): Concept {
  if (!slug) {
    console.error("Nothing to study: pass --concept <slug>. See the shelf with --concepts.");
    process.exit(2);
  }
  const found = conceptOf(slug.trim());
  if (!found) {
    console.error(`Unknown concept "${slug}". See the shelf with: npm run study:new -- --concepts`);
    process.exit(2);
  }
  return found;
}

function requireAxis(chosen: Concept, name: string | undefined): StudyAxis {
  const wanted = (name ?? chosen.axes[0]!).trim();
  const found = axisOf(wanted);
  if (!found) {
    console.error(`Unknown axis "${wanted}". See the shelf with: npm run study:new -- --axes`);
    process.exit(2);
  }
  // A concept lists the axes that make sense for it, but this is a warning
  // rather than a rejection: "what does tempo do to a cadence" is an odd
  // question, not an invalid one.
  if (!chosen.axes.includes(found.name)) {
    console.warn(
      `  ! ${chosen.slug} does not list "${found.name}" — its axes are ${chosen.axes.join(", ")}.`,
    );
  }
  return found;
}

function requireMood(text: string | undefined): string {
  if (!text || text.trim() === "") {
    console.error('Nothing to build from: pass --mood "<scene words>".');
    process.exit(2);
  }
  return text.trim();
}

/**
 * The instruments to keep. Empty means keep everything, which is the old
 * behaviour and rarely the right one — a study heard against a full arrangement
 * is a study whose axis the ear has to go looking for.
 */
function requireParts(raw: string): InstrumentName[] {
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((name) => !INSTRUMENT_NAMES.includes(name as InstrumentName));
  if (unknown.length > 0) {
    console.error(`--only: unknown instrument(s) ${unknown.join(", ")}. Known: ${INSTRUMENT_NAMES.join(", ")}`);
    process.exit(2);
  }
  return names as InstrumentName[];
}

function requireCount(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2 || n > LETTERS.length) {
    console.error(`--n must be an integer from 2 to ${LETTERS.length}, got "${raw}"`);
    process.exit(2);
  }
  return n;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 3)
    .join("-");
}

// ── Output ──────────────────────────────────────────────────────────────────

function report(): void {
  console.log(`\nWrote ${written.length} attempt(s) to studies/${concept.slug}/:`);
  for (const id of written) console.log(`  · ${id}`);
  console.log(`\nSet "${set}" · concept ${concept.slug} · axis ${axis.name} (${axis.kind})`);
  if (only.length > 0) {
    console.log(`Stripped to: ${only.join(", ")}`);
  } else {
    console.warn(
      `  ! Full arrangement. A study heard against six parts is one whose axis is hard to\n` +
        `    pick out — pass --only <instruments> with the parts the question is about.`,
    );
  }

  if (axis.kind === "written") {
    console.log(
      `\n${axis.name} is a written axis, so these four are the same music with a stub each.\n` +
        `  Write the varying part in each file's \`composition\`, set a real \`variant\`\n` +
        `  and \`approach\`, then drop \`"draft": true\`. Nothing renders while it is set.`,
    );
    return;
  }
  console.log(`\nNext: npm run study:render -- --set ${concept.slug}/${set}`);
  console.log(`Then: npm run dev, open /studies.html, and thumb them.`);
}

function printConcepts(): void {
  console.log("Concept shelf — what a study can be about:\n");
  for (const group of CONCEPT_GROUPS) {
    const mine = CONCEPTS.filter((c) => c.group === group);
    if (mine.length === 0) continue;
    console.log(`  ${group}`);
    for (const c of mine) {
      console.log(`    ${c.slug.padEnd(26)} ${c.blurb}`);
      console.log(`    ${"".padEnd(26)} axes: ${c.axes.join(", ")}`);
    }
    console.log("");
  }
}

function printAxes(): void {
  console.log("Axis shelf — what a set of attempts may differ on:\n");
  for (const entry of STUDY_AXES) {
    console.log(`  ${entry.name.padEnd(16)} ${entry.kind.padEnd(8)} ${entry.blurb}`);
    if (entry.values) console.log(`  ${"".padEnd(16)} ${"".padEnd(8)} values: ${entry.values.join(", ")}`);
  }
  console.log("\n  knob    — the composer turns it; the attempts differ for real and render now.");
  console.log("  written — a judgement no field encodes; the attempts are scaffolded for you to write.\n");
}
