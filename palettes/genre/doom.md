---
kind: genre
slug: doom
title: Doom / Sludge
tags: [doom, sludge, slow, heavy, sabbath, riff, downtuned, crushing, funeral, stoner, massive, dirge, plodding]

tempo: [48, 78]
mode: minor
progressions:
  - [i, i, bII, i]
  - [i, VI, i, i]
  - [i, iv, i, i]
  - [i, "#iv", i, i]
groove:
  patterns:
    kick:  "X.......X......."
    snare: "........X......."
    crash: "X..............................."
    ride:  "x...x...x...x..."
  fill:
    tom-lo: "........x...x.X."
    crash:  "..............X."
  fillEvery: 8
instruments: [pluck, bass, pad, piano]
---

# Doom / Sludge

Metal played at half the speed, and the slowness is not a lack of energy but the
source of the weight. The snare lands once a bar instead of twice, which halves
the apparent tempo again — at 60 BPM notated this feels like 30.

## Groove

- **Tempo:** 48–78 BPM. Slower than anything else here except a funeral.
- **Half-time backbeat.** Snare on beat 3 only. This one change is most of the
  genre; a normal backbeat at this tempo just sounds like a slow rock song.
- **The `half-time-chug` figure**, or `straight-eighths` for the stoner end. Two
  held power chords a bar and nothing between them.
- **The tritone.** `[i, "#iv", i, i]` — quote the sharp, or YAML reads it as a
  comment and the file fails to parse. That interval is the oldest heavy sound
  there is and this genre never stopped using it.
- **Downtune.** Use the `subterranean` register; the riff should be near the
  bottom of the bass's range.

Layer with [`angry`](../emotion/angry.md), [`solemn`](../emotion/solemn.md) for
funeral doom, and [`desert-fuzz`](../timbre/desert-fuzz.md) or
[`brown-sound`](../timbre/brown-sound.md).
