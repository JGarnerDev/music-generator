/**
 * Scaffold a new palette markdown file with valid frontmatter.
 *   npm run palette:new -- --slug spooky --title "Spooky / Dread" \
 *     --tags haunted,tense,horror --tonic D --scale phrygian --tempo 70,96
 * Named flags only (repo convention: no positional arguments).
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";

const program = new Command();
program
  .name("new-palette")
  .description("Create a palettes/<slug>.md scaffold with frontmatter")
  .requiredOption("--slug <slug>", "kebab-case id, e.g. spaghetti-western")
  .requiredOption("--title <title>", "human title")
  .requiredOption("--tags <csv>", "comma-separated search tags")
  .option("--tonic <note>", "tonic note", "A")
  .option("--scale <scale>", "scale name", "minor")
  .option("--tempo <min,max>", "tempo range", "70,90")
  .option("--force", "overwrite if the file already exists", false)
  .parse(process.argv);

const opts = program.opts<{
  slug: string;
  title: string;
  tags: string;
  tonic: string;
  scale: string;
  tempo: string;
  force: boolean;
}>();

const tags = opts.tags.split(",").map((t) => t.trim()).filter(Boolean);
const tempo = opts.tempo.split(",").map((t) => Number(t.trim()));
if (tempo.length !== 2 || tempo.some((n) => !Number.isFinite(n) || n <= 0)) {
  console.error(`--tempo must be "min,max" positive numbers, got "${opts.tempo}"`);
  process.exit(2);
}

const dir = resolve(process.cwd(), "palettes");
mkdirSync(dir, { recursive: true });
const out = resolve(dir, `${opts.slug}.md`);
if (existsSync(out) && !opts.force) {
  console.error(`${out} already exists. Pass --force to overwrite.`);
  process.exit(1);
}

const md = `---
slug: ${opts.slug}
title: ${opts.title}
tags: [${tags.join(", ")}]
tonality:
  tonic: ${opts.tonic}
  scale: ${opts.scale}
progressions:
  - [i, VI, III, VII]
tempo: [${tempo[0]}, ${tempo[1]}]
instruments: [piano, pad]
---

# ${opts.title}

<!-- Prose guidance for Claude: when to reach for this palette, and how to voice it. -->

## Direction

- **Tonality:** ${opts.tonic} ${opts.scale}.
- **Tempo:** ${tempo[0]}–${tempo[1]} BPM.
- **Voicing:** TODO.
- **Melody:** TODO.

## Lo-fi treatment

- TODO.
`;

writeFileSync(out, md, "utf8");
console.log(`Created ${out}`);
