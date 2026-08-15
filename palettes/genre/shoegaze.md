---
kind: genre
slug: shoegaze
title: Shoegaze
tags: [shoegaze, wall-of-sound, reverb, dreamy, blurred, guitars, my-bloody-valentine, washed, feedback, hazy, drone, ethereal]

tempo: [86, 132]
mode: either
progressions:
  - [I, I, IV, IV]
  - [i, VI, i, VI]
  - [I, iii, IV, I]
  - [i, i, VII, VII]
groove:
  patterns:
    kick:  "X.......X..x...."
    snare: "....X.......X..."
    hat:   "x.x.x.x.x.x.x.x."
    crash: "X..............................."
  fill:
    tom-mid: "........x.x....."
    tom-lo:  "..........x.xxX."
  fillEvery: 8
instruments: [pluck, pad, bass, epiano]
---

# Shoegaze

Melody buried under guitar. The defining decision is one of **mix, not
composition**: a perfectly ordinary pop song with the vocal at the level of the
rhythm guitar and everything drenched in modulated reverb. What arrives is
harmony as weather.

## Groove

- **Tempo:** 86–132 BPM, but the drums are simple and slightly buried — this is
  not a rhythm-led genre and a crisp kit breaks the spell.
- **Two chords, held long.** `[I, I, IV, IV]` for eight bars. The interest is in
  the detuning, not the changes.
- **Detune everything.** Two guitars a few cents apart, pitch drifting — the
  `saw-detune` and `chorus` signal tokens, plus a big reverb.
- **Bury the melody.** In this repo that means dropping the melody track's gain to
  around 0.4 and pushing the pad and rhythm parts up, which is the reverse of the
  usual staging and is the point.

Layer with [`nostalgic`](../emotion/nostalgic.md),
[`sad`](../emotion/sad.md) or [`calm`](../emotion/calm.md), and with
[`electric-guitar`](../timbre/electric-guitar.md).
