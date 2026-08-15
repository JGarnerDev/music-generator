---
kind: genre
slug: desert-rock
title: Desert Rock
tags: [desert, stoner, fuzz, riff, hypnotic, trance, robotic, driving, arid, heat, highway, swagger, groove, drone, heavy, repetitive]
parent: rock
tempo: [92, 150]
progressions:
  - [i, i, i, i]
  - [i, i, bII, i]
  - [i, i, "#iv", i]
groove:
  patterns:
    kick:  "X..x....X..x...."
    snare: "........X......."
    hat:   "x.x.x.x.x.x.x.x."
  fill:
    snare:  "........x.x.xxX."
    tom-lo: "X.......X......."
  fillEvery: 8
---

# Desert Rock

A subtype of [`rock`](./rock.md) — that file layers first and supplies the
backbeat, the voicing and `mode: either`; this one states only what differs.
Heavy like [`metal`](./metal.md) but built on the opposite principle: metal moves
(i–VII–VI descends, accents push), desert rock **refuses to move**. One riff,
repeated past the point of politeness, until repetition stops reading as a loop
and starts reading as a trance. Pair with an emotion for key and feeling (`angry`
× this = swagger with the lid off; `tense` × this = heat-haze menace; `battle` ×
this = a chase down a straight road). Add
[`desert-fuzz`](../timbre/desert-fuzz.md) for the tone.

## Deltas from rock

- **Tempo:** narrowed to 92–150 BPM. Mid = a hypnotic cruise; high = manic,
  wheels-off.
- **Feel:** machine-locked, and **no fills**. Rock states the backbeat; this
  refuses to decorate it. Even 8ths or 16ths that never let up — the drums are a
  motor, not a performance. Any change that does happen lands hard *because*
  nothing else did.
- **Harmony:** replaces rock's three-or-four-chord vocabulary entirely.
  - **The riff is the harmony.** `[i, i, i, i]` is a real, first-choice
    progression here, not a placeholder — a whole phrase on one chord, with the
    riff's own contour supplying the movement. Reach for it before the others.
  - **Chromatic, not diatonic.** When the root does move it leans a semitone or
    a tritone away and comes straight back: `bII` for the flattened, sun-baked
    lean, `#iv` for the tritone slide. Both are written explicitly and are
    honoured as written. No `bVII` — rock's borrowed chord resolves, and
    resolution sounds purposeful, which is wrong for this.
  - **Pedal the tonic.** Bass holds while upper voices move; drone underneath is
    what makes long repetition bearable.
- **Space:** dense and mid-heavy, no gaps. The opposite of
  [`spaghetti-western`](./spaghetti-western.md)'s wide silences.
- **Voicing:** rock's roles, tightened. Bass locks to the riff in unison an
  octave down rather than walking to the 5th — that doubling is most of the
  weight. Piano is low unison stabs on riff accents only, never a sustained bed.
  Keep everything in a narrow low-mid band; width comes from doubling, not range.
- **Mode:** inherited `either`, and load-bearing here. Roots + 5ths with the 3rd
  omitted leave the riff mode-neutral so the **melody decides** — a major, almost
  sweet lead over a low chromatic riff is the defining tension of the style. Pair
  with a major emotion for that, a minor one for uniformly grim.

## Caveat

The resolver picks the lead by preference (piano > epiano > pluck), so blending
with an emotion that lists `piano` — `angry` does — puts piano on the melody
track even though the riff belongs on the pluck. Either hand-edit the
composition's track instrument afterwards, or pick an emotion whose instruments
omit piano.
