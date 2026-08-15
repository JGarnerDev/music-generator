---
kind: genre
slug: waltz
title: Waltz
tags: [waltz, 3-4, ballroom, viennese, triple, dance, oom-pah-pah, spinning, courtly, carousel, sway, elegant]

meter: [3, 4]
tempo: [84, 168]
mode: either
progressions:
  - [i, i, V, i]
  - [I, I, V, I]
  - [i, iv, V, i]
  - [I, vi, ii, V]
groove:
  patterns:
    kick:  "X..........."
    snare: "....x...x..."
    hat:   "....x...x..."
    rim:   "............"
  fill:
    snare: "....x...x.X."
    tom-lo: "X..........."
  fillEvery: 8
instruments: [piano, pad, pluck, bass]
---

# Waltz

Three beats to the bar, with the weight entirely on the first. **Oom-pah-pah**:
bass note on 1, chords on 2 and 3, and the lift between them is the dance.

## Groove

- **Twelve steps to the bar.** Every lane above is 12 characters — a 16-step lane
  fails validation here, which is what `meter: [3, 4]` is for.
- **Tempo:** 84–168 BPM, counted in three. A Viennese waltz is at the top of that
  and rushes beat two deliberately; a slow waltz at the bottom is a lament.
- **The figures:** `waltz-oom-pah` for the classic bass, `waltz-drive` when all
  three beats are struck evenly — which turns a dance into a menace and is worth
  reaching for.
- **Harmony is simple and cadential.** One chord per bar, V–i at every phrase end.
  Complexity fights the dance.

Layer with [`romantic`](../emotion/romantic.md) for a ballroom,
[`whimsical`](../emotion/whimsical.md) or
[`mysterious`](../emotion/mysterious.md) with
[`music-box`](../timbre/music-box.md) for something sinister and toy-like.
