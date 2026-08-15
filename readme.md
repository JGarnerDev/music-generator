---
title: music-generator
purpose: Router and first-principles for the project. Read this before diving into code.
audience: [claude, human]
updated: 2026-08-14
read_order: 1
see_also: [claude.md, docs/vision.md, docs/rendering.md, docs/palette-authoring.md]
---

# music-generator

Conversational, code-driven **lo-fi music**. Describe a mood, a scene, a poem —
Claude composes a short, moving sample, renders it to a file, and you play it in
the browser. Built for two jobs: scoring a D&D scene on the fly, and turning
loose musical ideas into something you're pumped about.

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
| `palettes/<kind>/*.md` | Intent → music: `emotion`, `genre`, `timbre`, `space`, `era` | Per-kind schema; see [palette-authoring](docs/palette-authoring.md) |
| `src/engine/` | Pure music brains | tonal, theory, arrange, validation — **tested** |
| `src/utils/` | Promoted general helpers | rng, timing, wav, mp3, loop seams — **tested** |
| `src/app/` | Browser player + the audio graph | Tone.js glue, thin, not unit-tested. The graph runs only under `npm run render`; the app itself just plays files |
| `compositions/<kind>/*.json` | Song specs (the Claude↔app contract) | Kind = folder = tab: `leitmotifs`, `segments`, `loops`, `songs`. See [library](docs/library.md); shape in `src/engine/composition.ts` |
| `voices/<instrument>/*.json` | Instrument sounds, several per instrument | Folder = instrument. Approved ones get a row in [`voices/archive.md`](voices/archive.md); the `notes` inside each file are its design record. Process in [voices](docs/voices.md) |
| `plans/*.json` | Section plans for long/looping pieces | Expanded by `npm run song:build`; see [looping](docs/looping.md) |
| `scripts/*.ts` | Deterministic CLI chores | commander, named flags. `render.ts` is the big one: see [rendering](docs/rendering.md) |
| `src/dev/` | Dev-server middleware, render harness, render profiler | Never in the built bundle |
| `public/audio/` | Rendered MP3s + `manifest.json` — what the bench plays | Committed; written by `npm run render` |
| `assets/samples/` | SoundFont/sample packs | Gitignored (large binaries) |

## Workflow

```bash
npm install
npm run dev        # local workshop bench → Play / Stop / Download
npm run render -- --all   # render every composition to public/audio/
npm test           # vitest (engine + utils)
npm run typecheck  # tsc --noEmit
```

- **Compose:** write/adjust a `compositions/<kind>/<name>.json` using a palette's
  tonality + progressions. Validate it:
  `npm run composition:validate -- --file compositions/<kind>/<name>.json`. Or generate
  one: `npm run compose -- --mood "<scene>" [--palette <emotion>] [--with <genre,timbre,…>] [--kind <kind>]`
  — layers blend via [`blend.ts`](docs/palette-authoring.md#blending). The beat
  rides along with the genre: an emotion alone is drumless, `--with lofi` arrives
  with a kit. See [grooves](docs/grooves.md).
  - Your scene words pick the **knobs** — rhythmic figure, register, tempo within
    the palette's band, whether the harmony moves inside the bar — and `compose`
    prints which words chose what. Override with `--figure` / `--register` /
    `--tempo`; ask for a longer piece with `--form song`, which adds an intro and
    a B section with its own harmony. See [knobs](docs/knobs.md).
- **Quote a theme:** `npm run motif:quote -- --into <composition> --motif <slug>
  --at-bar <n>` writes a leitmotif into another piece, transposed into its key.
  See [library](docs/library.md).
- **File it:** kind is the folder, and the bench tabs mirror it. Sweep or
  promote with `npm run compositions:organize` — see [library](docs/library.md),
  which also covers **leitmotifs** (themes other pieces quote via `motifs`).
- **Render, then audition:** `npm run render -- --all` writes an MP3 per piece
  into `public/audio/` (plus a `.loop` file for anything with a loop window).
  Then `npm run dev` and hit Play — the app only ever *plays files*, so playback
  can't stutter however dense the arrangement, and everything is ready the
  moment the page loads. **Changed the notes? `npm run render -- --file <path>
  --force`** — the audio has no idea the composition moved. Full flags, speed
  numbers, and the designs that failed first: [rendering](docs/rendering.md).
- **Loop it (game music):** give the piece a `loop: {startBar, endBar}` and the
  render writes a seamless, tail-wrapped `<name>.loop.mp3` beside the full take.
  Long loops are built from a section plan:
  `npm run song:build -- --plan plans/<name>.json`. Rules for the seam and for
  fighting fatigue: [looping](docs/looping.md).
- **Pick a sound:** `npm run voice:find -- --query "<scene>"` searches the shelf
  by scene words, instrument or tag and prints a row each — id, tags, and when
  to reach for it. `--brief <instrument>/<slug>` prints one voice's fork chain
  and design notes instead. Whole shelf at once:
  [`voices/archive.md`](voices/archive.md).
- **Design a sound:** instrument tone lives in `voices/<instrument>/<slug>.json`,
  not in the code, so it can be settled once instead of re-argued inside every
  song. Fork one (`npm run voice:new -- --instrument bass --slug sub-drone`),
  render its probe (`npm run voice:render -- --voice bass/sub-drone`), audition
  it at `/voices.html` with Play/Pause, then
  `npm run voice:approve -- --voice bass/sub-drone --summary "<one line>"`. A
  track picks one with `"voice": "<slug>"`; approved sounds get a row in
  [`voices/archive.md`](voices/archive.md) — `--summary` is that row, and the
  long why-it-works goes in `--notes`, which the index deliberately leaves in
  the file. Full loop: [voices](docs/voices.md).
- **New palette:** `npm run palette:new -- --kind emotion|genre|timbre --slug <slug> --title "<t>" --tags a,b,c`
  (writes `palettes/<kind>/<slug>.md`). Add `--parent <slug>` for a **subtype**
  (`desert-rock` → `rock`): it states only its deltas and inherits the rest.
  `npm run palette:tree` prints the hierarchy. See
  [palette-authoring](docs/palette-authoring.md).

## Utils & testing culture

- Born inline, **promoted on second use**. When a helper in the app or a script
  proves reusable, move it to `src/utils` (general) or `src/engine`
  (music-specific) and add a `*.test.ts` next to it.
- **Pure functions are the tested surface.** Anything that can be pure, is —
  that's why timing, arrangement, theory, validation, rng, seam-wrapping and
  audio encoding live outside the audio graph. Audio (`src/app`) stays thin so
  little is untested.
- Tests live beside source (`foo.ts` + `foo.test.ts`) and run in Node.

## Deeper docs

- [`docs/vision.md`](docs/vision.md) — why the project exists: use cases,
  desired outcomes, design philosophy behind these principles.
- [`docs/rendering.md`](docs/rendering.md) — how compositions become audio
  files, why rendering is a CLI chore and not a button, and what not to try
  again.
- [`docs/voices.md`](docs/voices.md) — designing instrument sounds: the
  fork → render → audition → approve loop, the probe études, and how a song
  names a voice.
- [`docs/looping.md`](docs/looping.md) — writing music that repeats for minutes:
  seam rules, tail-wrapped exports, section plans.
- [`docs/library.md`](docs/library.md) — how `compositions/` is filed by kind,
  and how leitmotifs are written once and quoted by other pieces.
- [`docs/grooves.md`](docs/grooves.md) — the drum step notation a genre palette
  carries, the kit pieces, and the swing rule that fails silently.
- [`docs/variety.md`](docs/variety.md) — why the first four loops came out as one
  song, the knobs that prevent it, and the rules for choosing them. Read before
  writing a plan or a segment.
- [`docs/knobs.md`](docs/knobs.md) — how scene words choose those knobs, how to
  override them, and how a new piece is checked against the shelf.
- [`docs/hooks.md`](docs/hooks.md) — the other half: what makes a piece worth
  hearing twice, genre-independent. Contour, withholding, negative space, one
  surprise. Read with variety.md before writing bars.

Progressive disclosure — split a section into its own frontmatter'd doc once it
outgrows a screen here. Planned: `docs/composition-spec.md`,
`docs/lofi-chain.md`. Not written until needed.
