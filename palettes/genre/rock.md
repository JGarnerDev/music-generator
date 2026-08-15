---
kind: genre
slug: rock
title: Rock
tags: [rock, guitar, band, backbeat, riff, driving, loud, electric, straight, anthemic]
tempo: [88, 160]
mode: either
progressions:
  - [I, bVII, IV, I]
  - [i, bVII, IV, i]
  - [I, V, vi, IV]
groove:
  patterns:
    kick:  "X.....x.X......."
    snare: "....X.......X..."
    hat:   "x.x.x.x.x.x.x.x."
    crash: "X..............................."
  fill:
    snare:  "........x.x.xxX."
    tom-lo: "X.......X......."
  fillEvery: 8
instruments: [bass, pluck, piano]
---

# Rock

The broad *groove/harmony* layer a whole family of subtypes narrows: guitar,
bass and drums, a backbeat, and riffs that repeat. Useful on its own for
plain-spoken band music; when you want something more specific, reach for a
subtype ([`desert-rock`](./desert-rock.md)) — it layers this file first and
overrides only what it needs. Pair with an emotion for key and feeling.

## Groove

- **Tempo:** 88–160 BPM. The wide range is deliberate — subtypes narrow it.
- **Feel:** straight 8ths, no swing, backbeat on 2 and 4. The pulse is stated
  plainly rather than implied; syncopation is an accent, not the grid.
- **Harmony:** three or four chords, held for a full bar or two. `mode: either`
  — the guitar voices roots and 5ths, so the melody decides major or minor.
  `bVII` is the signature borrowed chord in either mode (the flat-seven lean is
  what separates rock harmony from pop's diatonic I–V–vi–IV, which is also
  here). Cadences resolve; ambiguity is not the idiom.

## Voicing

- **Pluck:** the riff and the chords — the centre of the arrangement.
- **Bass:** roots, locked to the kick, moving to the 5th or a passing tone at
  the bar turn.
- **Piano:** optional, doubling the chords for weight, never carrying the part.

## Subtypes

Add one with `--parent rock` and state only the deltas; anything left out is
inherited from here. `npm run palette:tree -- --kind genre` lists what exists.
