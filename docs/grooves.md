---
title: Grooves — the drum notation
purpose: How a genre palette writes its beat, and how that beat reaches the speakers.
audience: [claude, human]
updated: 2026-08-13
read_order: 6
see_also: [palette-authoring.md, looping.md, ../readme.md]
---

# Grooves

A genre is its beat more than it is its chords. House, reggae and funk can share
a progression and stay unmistakable, so the pattern lives in the genre palette
next to the tempo — not in code, and not in prose the composer can't read.

## The notation

One character per sixteenth, sixteen per bar, one lane per kit piece:

```yaml
groove:
  swing: 0.45
  swingUnit: 8n
  patterns:
    kick:  "X.....x.........X.....x.....x..."
    snare: "........X.............o.X......."
    hat:   "x.o.x.o.x.o.x.o."
```

| Char | Means | Velocity |
|---|---|---|
| `X` | accent | 0.95 |
| `x` | normal hit | 0.7 |
| `o` | ghost note | 0.35 |
| `.` | rest | — |

**Lanes cycle independently.** The kick above is two bars, the hat is one; the
hat simply restates itself twice per kick cycle. That's how a drum machine
behaves and it's the cheapest way to get a pattern that doesn't feel stamped.
A lane's length must be a whole number of bars — a 15-character lane is a typo,
not a polymeter, and it would rotate against the bar line forever.

**Kit pieces:** `kick` `snare` `rim` `clap` `hat` `open-hat` `ride` `crash`
`tom-lo` `tom-mid` `tom-hi` `shaker`. The list is
`DRUM_PIECES` in [`src/engine/composition.ts`](../src/engine/composition.ts) —
a drum note's `pitch` is a piece name, because for percussion "which note" means
"which drum".

## Swing

`swing` runs 0 (dead straight) to 1 (a full triplet shuffle); the off-beats land
late by that fraction of the way to the triplet.

`swingUnit` decides *which* off-beats move — and getting it wrong fails
**silently**:

- `8n` swings the eighths: the jazz ride, the boom-bap hat. Use it when the lane
  plays on even steps (`x.x.x.x.` …).
- `16n` (the default) swings the sixteenths: the tighter funk/garage feel.

A hat playing straight eighths under `16n` swing has no note on a swung step at
all, so it plays perfectly straight and the palette looks like it did nothing.

## How it reaches the speakers

1. `blend` resolves the groove — **the last layer that states one wins**, taken
   whole. Grooves are never merged lane-by-lane: half of one genre's kick against
   another's hats is not a third genre, it's mush. A subtype like `desert-rock`
   overrides its parent's beat by stating its own, or inherits it by staying
   quiet.
2. `composeFromBlend` renders it across the progression into a `drums` track and
   crashes on the final tonic bar. An emotion palette states no groove, so
   `--palette sad` alone stays a bare piano piece; `--with lofi` arrives with a
   kit.
3. **The groove also decides how the harmony is played.** The bass takes the
   kick lane as its own pattern (via `parts.ts:bassPatternFromKick`), so bass and
   kick land together — most of what "tight" means. The kick+snare density then
   picks the chord rhythm: a busy kit gets pushed off-beat stabs, a moderate one
   gets backbeat comping, no kit at all gets sustained chords. And the swing is
   shared, because a bass on its own grid under a shuffled kit flams on every
   off-beat. This is why `--with funk` changes the chords' *feel* without funk
   having to describe it twice.
4. [`src/app/drums.ts`](../src/app/drums.ts) plays it. Per-piece levels live
   there, not in the pattern: a groove says *where* the hits are and how they're
   accented, while how loud a hat sits under a kick is a property of the kit.

## Authoring one

Write the beat you'd count out loud, then check three things:

- **Does the accent land where the genre's weight lands?** Reggae's one drop puts
  kick *and* rim on beat 3 and leaves beat 1 empty; that hole is the genre.
- **Are there ghost notes?** `o` between the backbeats is most of what separates
  a played groove from a programmed one.
- **Is `swingUnit` matched to the lane that carries the pulse?** See above.

Not every genre wants a kit. `ambient` deliberately has no `groove:` — silence
where the drums would be is a musical decision, and an empty block would be a
worse one.
