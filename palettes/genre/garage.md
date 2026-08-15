---
kind: genre
slug: garage
title: UK Garage / 2-Step
tags: [garage, 2-step, ukg, shuffled, swung, london, skippy, syncopated, vocal, bass, nineties, sparse]

tempo: [128, 138]
mode: either
progressions:
  - [i, VII, VI, VII]
  - [I, vi, IV, V]
  - [i, i, VI, VI]
groove:
  swing: 0.55
  patterns:
    kick:  "X.......X..x...."
    snare: "....X.......X..."
    hat:   "x.x.x.x.x.x.x.x."
    rim:   "..........x....."
    shaker: "..x...x...x...x."
  fill:
    snare: "....x...x.x.xxX."
    hat:   "x.x.x.x.x.x.x.x."
  fillEvery: 8
instruments: [bass, epiano, pad, pluck]
---

# UK Garage / 2-Step

House tempo, but the kick refuses the four-on-the-floor: it plays 1 and a
syncopated push before 3, so the bar **skips** rather than marches. Add heavy
sixteenth swing and you have 2-step.

## Groove

- **Tempo:** 128–138 BPM — the same band as house, which is the joke: it is the
  same speed and feels nothing like it.
- **Swing is not optional, and it is `16n`.** 0.5–0.6 here, which would be
  extreme anywhere else in this folder. Set `swingUnit` wrong and this palette
  plays dead straight and sounds like broken house — the silent failure
  [`docs/grooves.md`](../../docs/grooves.md) warns about.
- **Gaps.** The kick leaves beats 2 and 4 alone; the snare has them. Nothing plays
  on every beat, and the space is the genre.
- **Bass is short and syncopated**, following the kick's skip rather than the bar.

## Layer it with

[`hopeful`](../emotion/hopeful.md) or [`romantic`](../emotion/romantic.md) for
the soulful end; [`rhodes`](../timbre/rhodes.md) for the chords, which are
almost always electric piano.
