---
kind: genre
slug: post-rock
title: Post-Rock
tags: [post-rock, build, crescendo, instrumental, tremolo, cinematic, explosions, mogwai, swell, patient, cathartic, wall]

tempo: [68, 116]
mode: either
progressions:
  - [I, V, vi, IV]
  - [i, VI, III, VII]
  - [I, I, IV, IV]
  - [vi, IV, I, V]
groove:
  patterns:
    kick:  "X.......X..x...."
    snare: "....X.......X..."
    ride:  "x.x.x.x.x.x.x.x."
    crash: "X..............................."
  fill:
    tom-mid: "........x.x....."
    tom-lo:  "..........x.xxX."
    crash:   "..............X."
  fillEvery: 8
instruments: [pluck, pad, bass, piano]
---

# Post-Rock

One idea, repeated for four minutes, getting louder. The form *is* the content:
a two-chord figure played quietly on a clean guitar, then again with a second
guitar, then again with drums, then again with everything, and the payoff is
purely dynamic rather than harmonic.

## Groove

- **Tempo:** 68–116 BPM, unhurried.
- **Harmony barely moves and never resolves.** Two or four chords, no cadence, no
  key change. `[I, I, IV, IV]` for eight bars is a legitimate section.
- **Tremolo picking** is the signature texture — see `tremoloLine` in
  [`riff.ts`](../../src/engine/riff.ts). Sixteenths on one note, high, with
  delay.
- **The drums arrive late.** Write the first section with `drums: false` in a
  plan; the entry of the kit is the biggest event in the piece.

## Arrangement

This genre wants a plan, not a segment — the whole point is a four-minute build
and a segment cannot contain one. See
[`docs/looping.md`](../../docs/looping.md), and use section `intensity` as the
build.

Layer with [`hopeful`](../emotion/hopeful.md), [`sad`](../emotion/sad.md) or
[`lonely`](../emotion/lonely.md).
