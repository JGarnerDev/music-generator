/**
 * Scaffold a new palette markdown file with valid, kind-appropriate frontmatter.
 *   npm run palette:new -- --kind emotion --slug spooky --title "Spooky / Dread" \
 *     --tags haunted,tense,horror --tonic D --scale minor --tempo 70,96
 *   npm run palette:new -- --kind genre --slug funk --title Funk --tags funk,groovy --tempo 96,116
 *   npm run palette:new -- --kind timbre --slug brown-sound --title "Brown Sound" --tags guitar,rock
 *   npm run palette:new -- --kind genre --slug desert-rock --title "Desert Rock" \
 *     --tags desert,fuzz --parent rock   # a subtype: states only its deltas
 * Writes palettes/<kind>/<slug>.md. Named flags only (repo convention: no positional args).
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { PALETTE_KINDS, MODE_NAMES, type PaletteKind } from "../src/engine/palette";

const program = new Command();
program
  .name("new-palette")
  .description("Create a palettes/<kind>/<slug>.md scaffold with frontmatter")
  .requiredOption("--slug <slug>", "kebab-case id, e.g. spaghetti-western")
  .requiredOption("--title <title>", "human title")
  .requiredOption("--tags <csv>", "comma-separated search tags")
  .option("--kind <kind>", `palette kind: ${PALETTE_KINDS.join(" | ")}`, "emotion")
  .option("--parent <slug>", "broader palette this one specializes (same kind), e.g. rock")
  .option("--tonic <note>", "tonic note (emotion only)", "A")
  .option("--scale <scale>", `mode (emotion only): ${MODE_NAMES.join(" | ")}`, "minor")
  .option("--tempo <min,max>", "tempo range (emotion/genre)", "70,90")
  .option("--force", "overwrite if the file already exists", false)
  .parse(process.argv);

const opts = program.opts<{
  slug: string;
  title: string;
  tags: string;
  kind: string;
  parent?: string;
  tonic: string;
  scale: string;
  tempo: string;
  force: boolean;
}>();

if (!(PALETTE_KINDS as readonly string[]).includes(opts.kind)) {
  console.error(`--kind must be one of: ${PALETTE_KINDS.join(", ")}. Got "${opts.kind}".`);
  process.exit(2);
}
const kind = opts.kind as PaletteKind;

if (opts.parent && kind === "emotion") {
  console.error(
    "--parent is not allowed on an emotion: the blend takes exactly one emotion, " +
      "so an inherited key would be ambiguous. Subtype a genre or timbre instead.",
  );
  process.exit(2);
}

if (kind === "emotion" && !(MODE_NAMES as readonly string[]).includes(opts.scale)) {
  console.error(`--scale must be one of: ${MODE_NAMES.join(", ")}. Got "${opts.scale}".`);
  process.exit(2);
}

const tags = opts.tags.split(",").map((t) => t.trim()).filter(Boolean);
const tempo = opts.tempo.split(",").map((t) => Number(t.trim()));
if (tempo.length !== 2 || tempo.some((n) => !Number.isFinite(n) || n <= 0)) {
  console.error(`--tempo must be "min,max" positive numbers, got "${opts.tempo}"`);
  process.exit(2);
}

const dir = resolve(process.cwd(), "palettes", kind);
mkdirSync(dir, { recursive: true });
const out = resolve(dir, `${opts.slug}.md`);
if (existsSync(out) && !opts.force) {
  console.error(`${out} already exists. Pass --force to overwrite.`);
  process.exit(1);
}

writeFileSync(out, scaffold(), "utf8");
console.log(`Created ${out}`);

/** Kind-appropriate frontmatter + prose skeleton. */
function scaffold(): string {
  const parent = opts.parent ? `\nparent: ${opts.parent}` : "";
  const head = `---\nkind: ${kind}\nslug: ${opts.slug}\ntitle: ${opts.title}\ntags: [${tags.join(", ")}]${parent}`;
  if (kind === "emotion") {
    return `${head}
tonality:
  tonic: ${opts.tonic}
  scale: ${opts.scale}
progressions:
  - [i, VI, III, VII]
tempo: [${tempo[0]}, ${tempo[1]}]
instruments: [piano, pad]
---

# ${opts.title}

<!-- When to reach for this mood, and how to voice it. -->

## Direction

- **Tonality:** ${opts.tonic} ${opts.scale}.
- **Tempo:** ${tempo[0]}–${tempo[1]} BPM.
- **Voicing:** TODO.
- **Melody:** TODO.

## Lo-fi treatment

- TODO.
`;
  }
  if (kind === "genre") {
    return `${head}
tempo: [${tempo[0]}, ${tempo[1]}]
mode: either
progressions:
  - [ii, V, I]
instruments: [piano, bass]
---

# ${opts.title}

<!-- The groove/feel of this genre. Harmony vocabulary + rhythm; no fixed key. -->

## Groove

- **Tempo:** ${tempo[0]}–${tempo[1]} BPM.
- **Feel:** TODO (swing, straight, shuffle, syncopation).
- **Harmony:** TODO (chord vocabulary, extensions, typical cadences).
- **Instrumentation:** TODO.
`;
  }
  // timbre — pure sound, no harmony/tempo.
  return `${head}
instruments: [pluck]
signal: [overdrive, chorus, tape-echo]
character: TODO one-line sonic descriptor
---

# ${opts.title}

<!-- A SOUND, not a mood. What it is and how to reproduce it. No key/tempo. -->

## Sound

- **Source:** TODO (which instrument voice/synth).
- **Signal chain:** TODO (drives, modulation, ambience — in order).
- **Character:** TODO (bright/dark, thin/thick, clean/dirty).
`;
}
