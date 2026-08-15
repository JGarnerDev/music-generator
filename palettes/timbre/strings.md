---
kind: timbre
slug: strings
title: String Section
tags: [strings, orchestra, section, violin, cello, ensemble, bowed, legato, swell, cinematic, sustain, symphonic, arco]
instruments: [pad, piano]
signal: [compression, hall-reverb, widen]
character: many bows not quite together — swelling, wide, never quite still
---

# String Section

A section, not a violin. What makes strings sound like strings is that sixteen
players are *almost* in tune and *almost* together: the small errors are the
sound, and a single perfectly-tuned sustained note is a synth pad no matter what
plays it.

## Sound

- **Source:** the `pad` voice for the bed, `piano` doubling the top line where a
  melody is needed. The engine's section support
  ([`src/engine/section.ts`](../../src/engine/section.ts)) exists for exactly
  this — several detuned players rather than one voice.
- **Signal chain:** compression to hold the swells → a hall (close-miked strings
  sound like a rehearsal) → widening.
- **Character:** slow attack, and *no* two notes with the same attack. The
  crescendo is the articulation: a string line that stays at one dynamic sounds
  synthetic within two bars.

## When to reach for it

[`cinematic`](../genre/cinematic.md), [`epic`](../emotion/epic.md),
[`solemn`](../emotion/solemn.md), [`sad`](../emotion/sad.md). The fastest way to
make a piece sound scored rather than programmed, and for that reason the easiest
to overuse.

## How to voice it

Wide, and in this order: bass at the bottom with a big gap above it, close
harmony in the middle, the melody clear at the top. Two lines a second apart in
the low register turn to mud — the same interval an octave higher is the sound
everyone actually wants.
