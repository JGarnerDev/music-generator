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
   `emotion` (mood + tonality), `genre` (groove), `timbre` (sound); see
   [`docs/palette-authoring.md`](./docs/palette-authoring.md). Layer an emotion
   with a genre/timbre for specific vibes rather than inventing new stored files.
3. Write a **short** `compositions/segments/<name>.json` (the moving core, not a
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
`voices/<instrument>/<slug>.json`. Read [`voices/archive.md`](./voices/archive.md)
when picking, and name one on a track with `"voice": "<slug>"`; omitting it gets
the instrument's default. If the user wants a *different sound* rather than
different notes, that is the voice loop — fork, render the probe, audition at
`/voices.html`, approve — and it is [`docs/voices.md`](./docs/voices.md), not an
edit to `src/app/instruments.ts`. Approved voices are forked, never edited.

**If it's for a game** (anything that plays under a scene on repeat), it needs a
loop, not a song: write a `plans/<name>.json` and
`npm run song:build -- --plan plans/<name>.json` instead of hand-writing notes,
and read [`docs/looping.md`](./docs/looping.md) first — the seam rules are not
guessable.

## Before you finish

- `npm test` and `npm run typecheck` pass.
- New pure logic has a test. New md has frontmatter. New chore has a script.
