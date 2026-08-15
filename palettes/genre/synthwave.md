---
kind: genre
slug: synthwave
title: Synthwave
tags: [synthwave, outrun, retrowave, neon, arpeggio, gated, eighties, drive, night, chrome, vaporwave, cyber, retro]

tempo: [96, 122]
mode: minor
progressions:
  - [i, VI, III, VII]
  - [i, VII, VI, VII]
  - [vi, IV, I, V]
  - [i, i, VI, VII]
groove:
  patterns:
    kick:     "X...X...X...X..."
    snare:    "....X.......X..."
    hat:      "x.x.x.x.x.x.x.x."
    open-hat: "..............x."
    clap:     "....X.......X..."
  fill:
    tom-mid:  "........x.x....."
    tom-lo:   "..........x.xxX."
    clap:     "..............X."
  fillEvery: 8
instruments: [pad, bass, pluck, epiano]
---

# Synthwave

The eighties as remembered rather than as they were. A four-on-the-floor kick, a
gated snare, a sixteenth-note arpeggio running underneath everything, and a minor
progression that never resolves.

## Groove

- **Tempo:** 96–122 BPM. Slower than house; this is driving music, not dancing
  music.
- **The arpeggio is the engine.** Sixteenth notes on a saw pluck, cycling through
  the chord tones, running the whole track. The composer's arp layer does this —
  see `arpLine` in [`parts.ts`](../../src/engine/parts.ts).
- **Snare and clap together**, both gated. See
  [`eighties`](../era/eighties.md) for the production, which is most of the
  identity here.
- **Minor, and modal.** `[i, VI, III, VII]` is the aeolian cycle every track in
  the genre uses; there is no V and no cadence.

Layer with [`tense`](../emotion/tense.md) for a chase,
[`hopeful`](../emotion/hopeful.md) for a montage,
[`analog-synth`](../timbre/analog-synth.md) always.
