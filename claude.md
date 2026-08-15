---
title: CLAUDE.md
purpose: Operating instructions for Claude in this repo. Routes to readme.md.
audience: [claude]
updated: 2026-08-12
read_order: 0
see_also: [readme.md]
---

# CLAUDE.md

**Read [`readme.md`](./readme.md) first — it is the router.** This file only adds
Claude-specific working rules that don't belong in the human-facing README.

## Non-negotiables

- **Frontmatter first.** Every markdown file opens with frontmatter; read it
  before the body to stay context-efficient. Add frontmatter to any md you
  create.
- **No positional CLI args.** Scripts use named flags (commander). Match that
  when adding scripts.
- **Promote & test.** Reusable logic → `src/utils` (general) or `src/engine`
  (music). Add a `*.test.ts` beside it. Keep `src/app` (audio glue) thin.
- **Script the repeatable.** If you do a deterministic chore twice, make it an
  npm script under `scripts/`.
- **Keep this file and the README small.** When a topic outgrows a screen, split
  it into its own frontmatter'd doc and link it.

## How to compose (default loop)

1. Parse the user's mood/scene/genre into search terms.
2. Look up matching `palettes/<kind>/*.md` (tags/slug/title) — kinds are
   `emotion` (mood + tonality), `genre` (groove), `timbre` (sound), `space`
   (the room), `era` (the period); see
   [`docs/palette-authoring.md`](./docs/palette-authoring.md). Layer an emotion
   with a genre/timbre for specific vibes rather than inventing new stored files.
3. Decide **what makes this one worth hearing twice** before writing bars —
   where the peak is, what gets withheld, which sections move register, which
   phrase isn't 8 bars. That checklist is [`docs/hooks.md`](./docs/hooks.md);
   variety.md keeps pieces from resembling *each other*, hooks.md keeps a piece
   from being forgettable on its own. Then write a **short**
   `compositions/segments/<name>.json` (the moving core, not a
   full song) using the **emotion** palette's tonality + a progression. Shape:
   `src/engine/composition.ts`. (Only emotion palettes are directly composable;
   layer others with the blend resolver.) Fastest path:
   `npm run compose -- --mood "<scene>" --palette <emotion> --with <genre,timbre,…>`.
   Kind is the folder — `segments` by default, `--kind leitmotifs` for a short
   recurring theme other pieces will quote. See
   [`docs/library.md`](./docs/library.md).
4. Validate: `npm run composition:validate -- --file compositions/segments/<name>.json`.
5. **Render it** — `npm run render -- --file compositions/segments/<name>.json`.
   The app plays files and synthesises nothing, so a piece you don't render is a
   piece the user cannot hear. Every edit to the notes needs a re-render with
   `--force`. Slow: budget ~5x the length of the piece, or `--audition` while
   iterating. Read [`docs/rendering.md`](./docs/rendering.md) before changing
   anything about how audio is produced — four designs were tried and three
   failed, and the failures are not guessable.
6. Tell the user to `npm run dev` and hit Play — then ask for one adjustment. Be
   proactive first; refine after.

**Sounds are chosen, not invented per song.** Instrument tone lives in
`voices/<instrument>/<slug>.json`, and a track names one with
`"voice": "<slug>"`; omitting it gets the instrument's default.

Search, don't browse — the same scene words you parsed in step 1:

```bash
npm run voice:find -- --query "dusty spaghetti western standoff"
npm run voice:find -- --query "trumpet" --instrument lead
npm run voice:find -- --tags spaghetti-western     # every voice on that shelf
```

Each hit prints its id, tags and one line on when to pick it. Terms are
alternatives and more matches ranks higher, so a scene sentence works better
than a single keyword. Read [`voices/archive.md`](./voices/archive.md) when you
want the whole shelf at once — it is the same index, unfiltered, plus the fork
trees.

**Never read the voice JSONs to choose, and never open several to compare.** A
voice's `notes` field is the fork brief — a page of prose about why one number
is what it is — and reading a shortlist of them costs more context than the
piece costs to write. That is what `summary` and this search exist to prevent.

Forking is the one time you want the prose:
`npm run voice:find -- --brief <instrument>/<slug>` prints the fork chain and
the notes without the synth parameters around them. If the user wants a
*different sound* rather than different notes, that is the voice loop — fork,
render the probe, audition at `/voices.html`, approve — and it is
[`docs/voices.md`](./docs/voices.md), not an edit to `src/app/instruments.ts`.
Approved voices are forked, never edited, and an approval needs a `--summary`
so the new voice gets an archive row.

**If it's for a game** (anything that plays under a scene on repeat), it needs a
loop, not a song: write a `plans/<name>.json` and
`npm run song:build -- --plan plans/<name>.json` instead of hand-writing notes,
and read [`docs/looping.md`](./docs/looping.md) first — the seam rules are not
guessable.

**A plan that names no knobs is the last plan again.** Three loops here became
one song by taking every default. Choose, per piece, *before writing bars*: a
rhythm **figure** per section, a **register**, a **kit voice**, **gains**,
**humanize**, and at least one phrase that isn't 8 bars. The builder prints which
ones you left alone — a nudge, not an error, but "I meant it" is the only good
reason to ignore it. Why each default is a trap, and the rules for choosing:
[`docs/variety.md`](./docs/variety.md). A section states its own `register` when
it should sit *above* the one before it — that is the contour knob, and it is
the one a chorus needs.

For `compose` the scene words choose those knobs for you and it prints what they
picked; override with `--figure` / `--register` / `--tempo`, and reach for
`--form song` when the user asked for a piece rather than a sample. It also warns
when the new piece lands in the same key and tempo band as one already on the
shelf — that is rule 4 of variety.md, enforced. See
[`docs/knobs.md`](./docs/knobs.md).

## Before you finish

- `npm test` and `npm run typecheck` pass.
- New pure logic has a test. New md has frontmatter. New chore has a script.
