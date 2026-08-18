---
title: String bends
purpose: How to bend a note's pitch while it sounds — the schema, the three curves, the one-note-at-a-time rule, and which voices can do it.
audience: [claude, human]
updated: 2026-08-17
read_order: 6
see_also: [../readme.md, ../claude.md, voices.md, variety.md]
---

# String bends

A `bend` on a note says *where its pitch travels while it sounds*. It is the
gesture a written pitch cannot hold: the blues whole-step push, the sitar's
meend sliding between two notes of a raga, a note that arrives flat and is
pulled up into tune.

```json
{ "time": "1:0:0", "pitch": "E4", "duration": "2n", "velocity": 0.78,
  "bend": { "semitones": 2, "at": 0.12, "over": 0.28, "release": true } }
```

That is E4 held for a beat and a half of its length, pushed up a whole tone to
F#4, held there, then let back down onto E4 before it stops.

## Bend or vibrato?

Both move pitch, and they are not alternatives — a real bend usually has vibrato
on top of it. They differ in **who they belong to**:

| | Belongs to | Happens | Written in |
|---|---|---|---|
| `vibrato` | the **voice** | continuously, on every note it plays | `voices/<instrument>/<slug>.json` |
| `bend` | the **note** | once, in one direction, because you chose it there | the composition |

If every note of a part should waver, that is the voice's vibrato and it is a
[voices](./voices.md) question. If *this* note goes somewhere, it is a bend.

## The fields

| Field | Default | What it does |
|---|---|---|
| `semitones` | required | Where it lands, relative to the written pitch. Negative bends down. Max ±12. |
| `at` | `0.15` | Fraction of the note held at the written pitch before the bend starts. |
| `over` | `0.3` | Fraction of the note the travel itself takes. |
| `release` | `false` | Come back to the written pitch before the note ends. |
| `curve` | `"guitar"` | Shape of the travel — see below. |

`at` and `over` are **fractions of the note's own length**, not seconds, so the
same bend written on a quarter note and on a whole note is the same *gesture* at
two speeds. They have to fit: `at + over` (or `at + 2 × over` with a release)
must be ≤ 1, and validation says so rather than letting the render squeeze it.

**`at` is not decoration.** A bend that starts at the attack (`at: 0`) is heard
as a slur *into* the note, not a bend *of* it — a different gesture with a
different meaning. The default holds the written pitch long enough for the ear
to learn it, which is the only reason the arrival lands.

## The three curves

Where the *fast part* of the travel is, which is what makes it read as an
instrument rather than as automation.

- **`guitar`** — fast off the mark, easing into the target. A finger pushes hard
  and slows as it arrives; the settle is the part that sounds human.
- **`meend`** — slow at both ends, all the speed in the middle. The sitar's
  glide is the phrase rather than an ornament on it. Usually wider than a guitar
  would go: 3 to 5 semitones is normal, where a guitar lives at 1 to 2.
- **`linear`** — a constant rate. Mechanical on purpose. For a bend that is an
  effect — a tape stop, a drone detuning — not a player.

## The rule: one bent note at a time, per track

A track that bends builds **one extra monophonic voice**, and every bent note on
that track is played by it. So **two bent notes on one track may not overlap**,
and `composition:validate` rejects it.

What that rule does *not* cover is the useful half: unbent notes on the same
track go to the ordinary polyphonic synth and are untouched. A bent line over
held chords on one track is fine. Two bends at once are not — write the second
one on its own track, which is also how it would be played.

## Which voices can bend

Any voice with a `synth` block, which is nearly all of them. Two cannot:

- **`drums`** — a kit piece is a name, not a pitch. Rejected at validation.
- **Section voices** (`voices/*` with a `section` block, e.g. `pad/string-bed`,
  `lead/string-section`) — a desk of six players is not one bending hand. The
  render warns and plays the note straight. Write the bent line on its own track
  with a solo voice.

Everything else works, including voices with an amp: the bending voice is summed
in *before* the vibrato/body/amp chain, so a bent note is the same instrument as
the phrase around it.

Reach for `pluck/sitar-jawari` for meend and `lead/desert-twang` or
`lead/brown-lead` for guitar bends; `npm run voice:find` for the rest.

## What it costs

One extra synth voice per bending track — the price of one more note of
polyphony, and only tracks that actually bend pay it. Unmeasured against a
before/after, but the bench says render cost is voice count, so a track going
from six voices to seven is the scale of it. Nothing about the pipeline in
[rendering](./rendering.md) changes: a bend is scheduled automation on a signal,
not a new kind of audio.

## Checking one landed

You cannot hear the render, so the bend is worth measuring the first time a
piece leans on one. Render a WAV (`npm run render -- --file <path> --wav
--audition --force`) and pitch-track the note: `220 Hz → 294 Hz` is a five
semitone meend that arrived. A bend that reads flat at the written pitch is
usually a section voice silently declining it — check the render's warnings.

## Where the code is

| Path | Role |
|---|---|
| [`src/engine/bend.ts`](../src/engine/bend.ts) | The curves and the automation points. Pure, tested. |
| [`src/engine/composition.ts`](../src/engine/composition.ts) | `Note.bend`, and the overlap rule. |
| [`src/app/instruments.ts`](../src/app/instruments.ts) | `BendVoice` — why it is a second synth and not the track's. |
| [`src/app/graph.ts`](../src/app/graph.ts) | Routing bent notes to it. |
| `compositions/segments/string-bend-probe.json` | Every curve, in one short piece. |
