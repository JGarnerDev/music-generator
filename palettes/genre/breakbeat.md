---
kind: genre
slug: breakbeat
title: Breakbeat
tags: [breakbeat, funky-drummer, big-beat, chemical, sampled, swung, groove, nineties, block-rockin, loop, dusty]

tempo: [125, 140]
mode: either
progressions:
  - [i, VII, i, VII]
  - [I, IV, I, IV]
  - [i, i, IV, IV]
groove:
  swing: 0.2
  patterns:
    kick:  "X.....x...X.....X.......X..x...."
    snare: "....X.......X.......X.......X..."
    hat:   "x.oxx.oxx.oxx.ox"
  fill:
    snare: "....x.o.x.o.xxX."
    kick:  "X.......X.x....."
  fillEvery: 8
instruments: [bass, epiano, pluck, piano]
---

# Breakbeat

The funk break — a syncopated kick against a straight backbeat — taken at a
tempo between hip-hop and house. What separates it from a rock beat is that the
**kick is a melody**: it moves around the bar, lands off the beat, and leaves the
downbeat alone as often as not.

## Groove

- **Tempo:** 125–140 BPM.
- **A little swing (0.15–0.25).** Enough that the sixteenths lope; not enough to
  read as a shuffle. This is the setting that most rewards getting `swingUnit`
  right — the hat here plays sixteenths, so leave it at the default `16n`.
- **The snare stays put.** Backbeat on 2 and 4, unmoved, all bar. Everything else
  syncopates against it, and it is the fixed point that makes the syncopation
  legible.
- **Two-bar kick.** As above — one bar of kick under a one-bar snare is where the
  genre turns generic.

Pairs with [`happy`](../emotion/happy.md), [`tense`](../emotion/tense.md), and
[`brown-sound`](../timbre/brown-sound.md) or
[`desert-fuzz`](../timbre/desert-fuzz.md) for the big-beat end.
