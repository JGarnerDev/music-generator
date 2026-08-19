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
3. Read [`docs/taste.md`](./docs/taste.md) — the rules derived from studies the
   user has actually thumbed up or down. It outranks your instincts and the
   palette's defaults, because it is the only file here that records *this*
   listener rather than a genre. Then decide **what makes this one worth hearing
   twice** before writing bars —
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

**A note can bend.** `"bend": { "semitones": 2 }` on a note travels its pitch
while it sounds — `curve` is `guitar` (fast, settling), `meend` (slow, wide,
sitar) or `linear`; `release` brings it back. This is the *note's* gesture; a
voice's `vibrato` is the *instrument's* and happens on every note. Reach for it
on a lead line or a sitar phrase rather than adding chromatic grace notes, which
read as a trill. One bent note at a time per track — unbent notes on that track
are unaffected — and section voices decline it. [`docs/bends.md`](./docs/bends.md).

**A sitar is not a guitar with a different tone.** If a part is for
`pluck/sitar-jawari`, read [`docs/sitar.md`](./docs/sitar.md) before writing
notes. The tone is already right; what makes it *not* a sitar is a moving
harmony underneath, a scale used identically in both directions, and no chikari.

**If the question is *how to approach* something** — "how should a guitar solo
go", "what makes a hook land" — that is not a piece, it is a **study**. Fan out
four attempts that differ on exactly one axis and let the user thumb them:

```bash
npm run study:new -- --concepts        # the concept shelf (~35, grouped)
npm run study:new -- --concept chorus-lift --axis register --mood "<scene>"
npm run study:render -- --set chorus-lift/<set>
```

Then `/studies.html`. Verdicts land in the generated `studies/ledger.md`; you
turn recurring tags into rules in [`docs/taste.md`](./docs/taste.md) by hand,
and then **tear the study down** — `npm run study:clean -- --set <concept>/<set>
--yes`. A study is scratch: it exists to produce one rule, and a set left in the
bench with its finding already written invites a second verdict on a settled
question. So `taste.md` never names a study, a set, an id or a file — the files
will not exist. It has to read as a rule on its own.

Concepts and verdict tags are **fixed shelves in `src/engine/study.ts`** — a
concept invented for one study is a data point that can never be counted with
another, so extend the shelf there rather than by creating a folder. Written
axes (`phrasing`, `contour`, `note-choice`, …) come out scaffolded and
`"draft": true`: the composer cannot fan those out, so you compose the varying
part yourself before they render. Rules and the whole loop:
[`docs/studies.md`](./docs/studies.md).

**If the user hands you a recording** — "I want the hook to sound like this" —
that is not a composing problem, it is a transcription. You cannot hear it, so
the CLI's printed summary is the only thing you will ever know about the take:

```bash
npm run transcribe -- --file recordings/<take>.wav --tempo 90 --key Am
npm run transcribe -- --file recordings/<take>.wav --tempo 90 --key Am \
  --emit <slug> --confirm      # write a leitmotif, render it, A/B it against the take
```

Ask the user for the tempo and the key rather than guessing; grid fit cannot tell
a tempo from its double. Use `--mode shape` when the take demonstrates a gesture
you will rewrite in another key, `literal` when it *is* the part. **Every
correction takes `--requantize`** — the model runs once per take and everything
after is re-derived in seconds. Never re-run it just to try another tempo. Full
loop, flags and the four things it cannot do: [`docs/transcribe.md`](./docs/transcribe.md).

**If the user is prepping a D&D night** — "make me a playlist for session 14",
"what should play when the ambush starts" — the deliverable is a **session
plan**, not a pile of loose pieces. File each piece with `"campaign": "<slug>"`,
then write the running order:

```bash
npm run session:new -- --name "Session 14" --campaign redwater --cues loops/tavern-raid,leitmotifs/lioness-motif
```

Cues are library ids (`<kind>/<slug>`) and may name pieces you have not composed
yet — the board shows those as missing cues, which is the to-do list. **Render
every cue before you hand it over**: the board plays files, so an unrendered cue
is silence at the table. Then tell the user to open `/session.html`.
[`docs/sessions.md`](./docs/sessions.md).

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
