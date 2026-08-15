---
title: Knobs — the prompt→music mapping
purpose: How a user's scene words choose the figure, register, tempo and harmony placement, and how to override them. Read with variety.md.
audience: [claude, human]
updated: 2026-08-15
read_order: 8
see_also: [variety.md, looping.md, grooves.md, ../src/engine/knobs.ts]
status: living
---

# Knobs

[`variety.md`](./variety.md) established *which* knobs matter and why their
defaults are a trap. It could not make anyone turn them: choosing happened by
feel, once, in conversation, and by the fourth loop the feel had a house style.

This is that checklist as code. The user's own words pick the knobs, so the same
scene gets the same answer and a *different* scene reliably gets a different one.
The mapping lives in [`src/engine/knobs.ts`](../src/engine/knobs.ts) — a table a
human can argue with, not a model.

## What gets chosen

| Knob | From | Notes |
|---|---|---|
| `figures` | scene words | One cell per section, and they must differ — "vary between sections, not just between pieces". |
| `register` | scene words | Named band the bass roots fold into. All at least an octave, so a key keeps its shape. |
| `tempo` | scene words | `slow`/`mid`/`fast` *within* the palette's own range, never outside it. |
| `splitBars` | scene words + dice | Whether a bar of the restatement changes chord half way through. |

`compose` prints all four every run, with the words that chose them:

```
Knobs:
  figures  sixteenth-chug → gallop  (Flat-out sixteenths)
  register high (C2–C3)
  tempo    fast of the palette's range
  harmony  moves inside the bar
  from     chase
```

A knob nobody can see is a knob nobody turns, which is why it prints even when
nothing matched — in that case it says so rather than quietly taking a default:

```
  from     (no scene word matched — chosen at random, not defaulted)
```

That distinction matters. The failure mode this whole system exists to prevent
is not randomness, it is *sameness*: an unmatched scene draws from the whole
shelf rather than landing on one house cell every time.

## Overriding

```bash
npm run compose -- --mood "a rooftop chase" --palette tense --with metal \
    --figure 3+3+2,half-time-chug --register subterranean --tempo fast
```

`--figure` takes one name (that cell throughout) or two (statement, then
restatement). Naming a cell also outranks the **kick lock** — see below.

## The rules the mapping encodes

- **Matching is on stems.** "chasing" and "chased" both hit `chase`. Substring
  matching was tried and is wrong in both directions: it misses "chasing" (which
  does not contain "chase") and it matches "sleeping" against `deep`, dropping a
  lullaby an octave for no reason.
- **A word contributes candidates, it does not dictate.** The whole phrase's
  suggestions are pooled and the seeded rng picks among them, so two chases can
  still differ from each other while a chase and a funeral cannot collide.
- **Sections get different cells.** If the scene suggested only one, the second
  section draws from the shelf rather than repeating it.
- **The meter narrows the shelf** to cells that state a whole bar of it, so a
  waltz scene can never be handed a sixteen-step gallop.

## The kick lock

With a kit present, the statement's bass plays the **kick's own pattern** rather
than a shelf figure. A bass on its own rhythm against a busy kick reads as two
records playing, and that tightness is worth keeping.

A scene word naming a cell overrides it; so does `--figure`. Either way the
restatement takes a shelf figure, so there is always a change to hear.

## Checking against the shelf

Before a new piece lands, `compose` compares it to everything in
`compositions/` and reports anything in the same key and tempo band:

```
Already on the shelf in this key and tempo band:
  · loops/high-noon-warpath — D minor @ 152 BPM (shares key, tempo, meter)
  Change something, or mean it: --seed, --figure, --register, a different palette.
```

It reports rather than blocks — a campaign wanting three pieces in one key is a
legitimate thing to want. But same key + same tempo band is exactly the signal
that went unnoticed until three rendered loops turned out to be one song.

## Adding a scene word

Edit `SCENE_WORDS` in [`knobs.ts`](../src/engine/knobs.ts). A word belongs there
when it changes what the music *does* — its gait, its weight, its register — not
merely how it feels. `sad` is the emotion palette's job and is deliberately
absent.
