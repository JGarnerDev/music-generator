---
kind: genre
slug: house
title: House
tags: [house, four-on-the-floor, club, dance, chicago, deep, groove, piano-house, pump, warehouse, night, uplifting]

tempo: [118, 128]
mode: either
progressions:
  - [i, VII, VI, VII]
  - [I, vi, IV, V]
  - [i, i, IV, IV]
groove:
  patterns:
    kick:     "X...X...X...X..."
    clap:     "....X.......X..."
    open-hat: "..x...x...x...x."
    shaker:   "x.x.x.x.x.x.x.x."
  fill:
    clap:     "........x.x.xxX."
    open-hat: "..x...x...x.x.x."
  fillEvery: 8
instruments: [epiano, pad, bass, piano]
---

# House

The four-on-the-floor kick with an open hat on every upbeat. Those two lanes
*are* house: the kick states the pulse and the hat states the space between it,
and a listener's body reads the pair as forward motion in a way neither does
alone.

## Groove

- **Tempo:** 118–128 BPM, and it does not vary. The genre is built for mixing
  records together, so the tempo is a fixed grid rather than an expressive
  choice.
- **The hat is the swing.** Dead straight kick, open hat on the "and" of every
  beat. If you add swing, keep it under 0.15 — past that it becomes garage.
- **Harmony barely moves.** Two chords, often one bar each, sometimes one chord
  for eight bars with the interest entirely in the arrangement. `mode: either`:
  minor is deep/warehouse house, major is the piano-house/uplifting end.
- **The bass is a pulse, not a line.** Root on every kick, or a simple octave
  bounce. Melodic bass belongs to disco.

## Arrangement

Subtraction and addition, in eight- or sixteen-bar blocks: drop the kick for
eight bars, bring it back. The `fillEvery: 8` here is doing that job in
miniature — but a real house arrangement wants a plan
([`docs/looping.md`](../../docs/looping.md)), not a segment.

Pairs with [`hopeful`](../emotion/hopeful.md) for the uplifting end and
[`tense`](../emotion/tense.md) for the dark one.
