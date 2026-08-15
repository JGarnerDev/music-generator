---
kind: genre
slug: techno
title: Techno
tags: [techno, detroit, industrial, machine, relentless, dark, hypnotic, berlin, warehouse, driving, minimal, cold, loop]

tempo: [126, 145]
mode: minor
progressions:
  - [i, i, i, i]
  - [i, i, VI, VI]
  - [i, VII, i, VII]
groove:
  patterns:
    kick:  "X...X...X...X..."
    hat:   "x.x.x.x.x.x.x.x."
    rim:   "..............x."
    clap:  "............X..."
  fill:
    rim:   "x.x.x.x.xxxxxxX."
    kick:  "X...X...X......."
  fillEvery: 16
instruments: [pad, bass, pluck]
---

# Techno

House's colder relative, and the difference is not the kick pattern — it is that
techno has **no chord changes and no vocal**, so nothing ever arrives. The
interest is entirely in timbre moving over a fixed pulse, which is why a
`[i, i, i, i]` progression is listed here without irony.

## Groove

- **Tempo:** 126–145 BPM. Faster than house and it feels faster still, because
  nothing in the harmony gives the ear anywhere to rest.
- **Straight, always.** No swing at all. The machine-ness is the aesthetic; this
  is a genre where humanizing the parts actively makes it worse.
- **Sixteenth hats, offbeat rim.** A single rim or clave on an odd sixteenth
  (step 14 here) is what stops the loop being symmetrical, and moving it is most
  of what "the groove changes" means in this music.
- **Minor and modal, or no harmony at all.** A drone with a filter opening across
  sixteen bars is a legitimate arrangement.

## Arrangement

Long. Sixteen bars between events, and the events are filter sweeps and
elements entering, not new tunes. Use `fillEvery: 16` rather than 8 — a fill
every eight bars is a pop structure and gives the game away.

Pairs with [`tense`](../emotion/tense.md) or
[`angry`](../emotion/angry.md), and with
[`analog-synth`](../timbre/analog-synth.md) for the filter movement it lives on.
