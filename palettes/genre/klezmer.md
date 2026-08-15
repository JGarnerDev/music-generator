---
kind: genre
slug: klezmer
title: Klezmer
tags: [klezmer, jewish, freygish, phrygian-dominant, clarinet, wedding, eastern-european, ornament, doina, bulgar, wailing, celebration]

tempo: [92, 168]
mode: phrygian-dominant
progressions:
  - [I, II, I, VII]
  - [i, V, i, i]
  - [I, IV, I, VII]
  - [I, VII, I, I]
groove:
  patterns:
    kick:  "X..x..X...x....."
    snare: "....X.......X..."
    rim:   "..x...x...x...x."
    hat:   "x.x.x.x.x.x.x.x."
  fill:
    snare: "....x.x.x.x.xxX."
    tom-lo: "X.......x......."
  fillEvery: 8
instruments: [pluck, epiano, bass, piano]
---

# Klezmer

**Freygish** — the phrygian dominant mode: a major third sitting a semitone above
a flat second. That interval, an augmented second between the b2 and the major
3rd, is the sound, and it is the reason this palette needed
`mode: phrygian-dominant` to exist at all
([`src/engine/theory.ts`](../../src/engine/theory.ts)).

## Harmony

Because the mode's tonic triad is **major**, the numerals are written in the
major idiom even though nothing about the music sounds cheerful. The second
degree is already flat in the scale, so write `II` and not `bII` — writing the
accidental flattens an already-flat degree and gives you a wrong chord.

`[I, II, I, VII]` is the canonical freygish cycle: tonic, the flat-two major
above it, back, then the flat-seven.

**You need an emotion in this mode to hear it.** The emotion is the sole source
of tonality, so layering this genre onto a plain major or minor emotion resolves
these numerals against *that* scale and the augmented second — the only thing
that makes it klezmer — never sounds. The blend says so out loud when it happens.
No shipped emotion is in freygish yet; write a one-file emotion with
`scale: phrygian-dominant` (`npm run palette:new -- --kind emotion --slug fervent
--scale phrygian-dominant …`) and layer that.

## Groove

- **Tempo:** 92–168 BPM. A bulgar is fast and a doina has no pulse at all —
  for the latter, drop the groove entirely and write rubato.
- **The clarinet is the voice**, and it is *ornamented* past the point of comfort:
  grace notes, slides into every long note, a laugh at the top of a phrase.
- **The bass and rhythm alternate** — bass on 1 and 3, chord chop on 2 and 4.

Layer with [`happy`](../emotion/happy.md) (a wedding),
[`sad`](../emotion/sad.md) (the same wedding), or
[`whimsical`](../emotion/whimsical.md). The mode does the work; the emotion
decides how fast.
