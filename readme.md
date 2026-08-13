---
title: music-generator
purpose: Router and first-principles for the project. Read this before diving into code.
audience: [claude, human]
updated: 2026-08-12
read_order: 1
see_also: [claude.md, docs/vision.md, docs/palette-authoring.md, palettes/emotion/sad.md]
---

# music-generator

Conversational, code-driven **lo-fi music**. Describe a mood, a scene, a poem —
Claude composes a short, moving sample; you play it in the browser and export a
**WAV**. Built for two jobs: scoring a D&D scene on the fly, and turning loose
musical ideas into something you're pumped about.

> **How to read this repo:** every markdown file starts with frontmatter. Read
> the frontmatter first to decide if you need the body. This README is the
> router; follow the pointers instead of loading everything.

## First principles

1. **Sample first, then iterate.** Make the best, most moving few bars and check
   in. Don't render a whole song up front.
2. **Be proactive, then adjust.** Compose a concrete take from the request, then
   refine with the user — don't interview them first.
3. **Palettes carry the theory.** Human intent → musical direction lives in
   `/palettes/*.md`, not in Claude's head. Look palettes up; combine primitives
   ("spaghetti-western" = derived in conversation, not stored).
4. **Promote & test.** Reusable logic moves into `src/utils` or `src/engine` and
   gets a vitest. Pure logic is tested; audio glue is kept thin. See
   [Utils & testing culture](#utils--testing-culture).
5. **Script the repeatable.** Deterministic chores are npm scripts, not ad-hoc
   commands. Named flags only — **no positional arguments**.

## Where things live

| Path | What | Notes |
|---|---|---|
| `palettes/<kind>/*.md` | Intent → music: `emotion`, `genre`, `timbre` | Per-kind schema; see [palette-authoring](docs/palette-authoring.md) |
| `src/engine/` | Pure music brains | tonal, theory, arrange, validation — **tested** |
| `src/utils/` | Promoted general helpers | rng, timing, wav — **tested** |
| `src/app/` | Browser player + WAV export | Tone.js glue, thin, not unit-tested |
| `compositions/*.json` | Song specs (the Claude↔app contract) | Shape in `src/engine/composition.ts` |
| `plans/*.json` | Section plans for long/looping pieces | Expanded by `npm run song:build`; see [looping](docs/looping.md) |
| `scripts/*.ts` | Deterministic CLI chores | commander, named flags |
| `exports/` | Rendered WAVs | Gitignored (ephemeral) |
| `assets/samples/` | SoundFont/sample packs | Gitignored (large binaries) |

## Workflow

```bash
npm install
npm run dev        # local workshop bench → Play / Stop / Export WAV
npm test           # vitest (engine + utils)
npm run typecheck  # tsc --noEmit
```

- **Compose:** write/adjust a `compositions/<name>.json` using a palette's
  tonality + progressions. Validate it:
  `npm run composition:validate -- --file compositions/<name>.json`. Or generate
  one: `npm run compose -- --mood "<scene>" [--palette <emotion>] [--with <genre,timbre,…>]`
  — layers blend via [`blend.ts`](docs/palette-authoring.md#blending).
- **Audition & export:** `npm run dev`, hit Play, then Export WAV.
- **Loop it (game music):** give the piece a `loop: {startBar, endBar}` and hit
  Export Loop for a seamless, tail-wrapped body. Long loops are built from a
  section plan: `npm run song:build -- --plan plans/<name>.json`. Rules for the
  seam and for fighting fatigue: [looping](docs/looping.md).
- **New palette:** `npm run palette:new -- --kind emotion|genre|timbre --slug <slug> --title "<t>" --tags a,b,c`
  (writes `palettes/<kind>/<slug>.md`). See [palette-authoring](docs/palette-authoring.md).

## Utils & testing culture

- Born inline, **promoted on second use**. When a helper in the app or a script
  proves reusable, move it to `src/utils` (general) or `src/engine`
  (music-specific) and add a `*.test.ts` next to it.
- **Pure functions are the tested surface.** Anything that can be pure, is —
  that's why timing, arrangement, theory, validation, rng and wav encoding live
  outside the audio graph. Audio (`src/app`) stays thin so little is untested.
- Tests live beside source (`foo.ts` + `foo.test.ts`) and run in Node.

## Deeper docs

- [`docs/vision.md`](docs/vision.md) — why the project exists: use cases,
  desired outcomes, design philosophy behind these principles.
- [`docs/looping.md`](docs/looping.md) — writing music that repeats for minutes:
  seam rules, tail-wrapped exports, section plans.

Progressive disclosure — split a section into its own frontmatter'd doc once it
outgrows a screen here. Planned: `docs/composition-spec.md`,
`docs/palette-authoring.md`, `docs/lofi-chain.md`. Not written until needed.
