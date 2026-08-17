---
title: Transcription — "make the hook sound like this"
purpose: Turning a recorded guitar take into notes Claude can read, quote and rewrite. The loop, the two modes, the flags, and what it cannot do.
audience: [claude, human]
updated: 2026-08-17
read_order: 5
see_also: [../readme.md, ../claude.md, ../recordings/readme.md, library.md, rendering.md]
---

# Transcription

The user plays a phrase on the guitar and wants *that* to be the hook. The
problem is that **Claude cannot hear audio** — not the recording, not the render.
So transcription is not a convenience here, it is the entire interface: whatever
the CLI prints is all I will ever know about what was played.

That fact decides the design. The output is text, it is short, and it is written
in **scale degrees and steps** rather than pitches and seconds, because degrees
survive being moved into another key and seconds do not.

```bash
npm run transcribe -- --file recordings/lioness-hook.wav --tempo 90 --key Am
```

## The loop

1. **Record.** One idea, 4–16 bars, to a click with a one-bar count-in. The
   capture rules are [`recordings/readme.md`](../recordings/readme.md) and they
   matter more than any flag on this page — a legible take is worth more than
   any amount of cleverness downstream.
2. **Transcribe.** The command above. It prints a summary and writes
   `<name>.notes.json` beside the WAV.
3. **Read the summary** (below). Decide whether this is a part to quote or a
   gesture to rewrite.
4. **Emit and confirm.** `--emit <slug> --confirm` writes a composition, renders
   it, and stands the original take next to it in the bench. The user plays both
   and says what is wrong.
5. **Fix and requantize.** Every correction is a flag away and costs seconds,
   not another transcription — see [cost](#cost).

## What the summary says

```
lioness-hook — 15 notes · 4 bars · A minor · 90 BPM · 4/4

  bar  1  |.   .   1   .   b3  .   5   .   b7  .   1^  .   .   .   .   .
  bar  2  |.   .   1   .   b3  .   5   .   b7  .   b3^ .   .   .   .   .
  bar  3  |.   .   .   .   .   .   .   .   .   .   .   .   .   .   .   .
  bar  4  |.   .   b6  .   .   5   4   .   b3  .   1   .   .   .   .   .

  rhythm    ..x-x-x-x-x----- | --x-x-x-x-x----- | ------.......... | ..x--xx-x-x-----
  degrees   1 b3 5 b7 1^ 1 b3 5 b7 b3^ b6 5 4 b3 1
  range     A3–C5 (15 semitones)
  contour   climbs and comes back down — peak b3^ in bar 2
  phrases   9 beats + 4.5 beats
  density   15 notes over 64 steps, 84% sounding
```

Every line answers a question [`hooks.md`](hooks.md) asks about any phrase, in
the order it asks them:

| Line | What it is for |
|---|---|
| the bar grid | where the notes are, by degree. `^`/`v` mark octaves from the phrase's home one |
| `rhythm` | `x` onset, `-` still sounding, `.` silence. Silence is half the idea |
| `contour` | one of six shapes, and where the peak lands — the sentence that decides whether the piece's own peak is being used or wasted |
| `phrases` | phrase lengths. Four + four + four is the squareness [`variety.md`](variety.md) warns about; 9 + 4.5 is a gift |
| `outside` | notes from outside the key — the blue notes. Keep them |
| `density` | how much of the grid is sounding. A sparse take is a groove, a dense one is a run |

It also says when a bar repeats the one before it, and when the phrasing is
square — both are facts about the *idea*, not about the recording.

## Two modes

**`--mode literal`** (default) — the notes as played. Use it when the recording
*is* the part and will be quoted: it becomes a leitmotif, and other pieces point
at it (see [`library.md`](library.md)).

**`--mode shape`** — intervals and rhythm only, no pitch and no tempo:

```
  intervals +3 +4 +3 +2 -12 +3 +4 +3 +5 -7 -1 -2 -2 -3
  lengths   2 2 2 2 8 2 2 2 2 12 3 1 2 2 10 steps
  span      15 semitones
  pickup    starts 2 steps into the bar — keep it there
```

Use it when the recording is a *demonstration* — "I want it to move like this" —
and the piece is in another key or another register. `--root <pitch>` roots the
shape wherever the piece needs it, and the pitches are snapped into `--key` on
the way out.

**That snapping is the point.** Exact semitone intervals move anywhere and stop
fitting: a phrase built on the minor third of A lands outside the scale in C, and
the chords underneath make it audible immediately. Snapping bends the odd note by
a semitone so every note is legal over the harmony, and it works off the
*unsnapped* running line so one bent note cannot drag the rest of the phrase off
pitch behind it. The cost is visible — a b6 with no home in dorian becomes the 5,
and two notes in a row become the same note — and that is the note to fix by hand.
The snapper only ever picks the nearest legal pitch; it never invents one.

## Confirming it

Nothing upstream knows whether the take was read correctly. The detector does not
know it invented a note, and neither do I. The user can tell in fifteen seconds:

```bash
npm run transcribe -- --file recordings/lioness-hook.wav --tempo 90 --key Am \
  --emit lioness-hook --confirm
```

That renders the transcription and puts the recording itself in the bench as
`<slug>.take.mp3`, so the two rows sit one click apart under `npm run dev`. The
printed checklist is indexed by **symptom** rather than by flag — the user knows
what it sounds like, not which knob owns it:

| It sounds like | The fix |
|---|---|
| notes it never played, mostly quiet ones | `--min-amplitude` up |
| notes it did play are missing | `--min-amplitude` down |
| rhythm lands on offbeats nobody played | a coarser `--grid` |
| a fast run got flattened into fewer notes | a finer `--grid` |
| two notes at once came out as one | `--polyphonic` |
| the notes are right but it drifts | `--tempo` — and try half and double it |
| everything a step off, or the wrong bar | a take problem: re-record with a count-in |

The emitted composition is deliberately bare — one track, one voice, no lo-fi
bed. A leitmotif is a phrase, not an arrangement, and this one also has to be
*checkable*: anything added is something the user has to listen past to hear
whether the notes are right. Arrange it after it has been confirmed.

## Cost

The detector is a neural model running on tfjs's pure-JS CPU backend at **~0.5x
realtime** — a 30-second take costs about a minute. Its raw output is saved into
the `.notes.json`, so:

**`--requantize` re-reads that instead of re-running the model.** Another tempo,
another grid, another amplitude threshold, another key, literal instead of shape
— all of it is instant. The model only ever runs once per take. Reach for it for
every correction; a confirm loop nobody wants to go round twice is not a confirm
loop.

## Flags

| Flag | |
|---|---|
| `--file <path>` | the recording (required) |
| `--tempo <bpm>` | pass it whenever you know it — see [what it cannot do](#what-it-cannot-do) |
| `--key <key>` | `Am`, `D dorian`, `Bb mixolydian`. Enables scale degrees |
| `--meter <n/d>` | default `4/4` |
| `--grid <1\|2\|4>` | steps per beat: quarters, eighths, sixteenths (default) |
| `--mode <literal\|shape>` | default `literal` |
| `--polyphonic` | keep overlapping notes instead of truncating each at the next onset |
| `--min-amplitude <0..1>` | default `0.2` |
| `--requantize` | reuse the saved detector output |
| `--emit <slug>` | also write a playable composition (needs `--key`) |
| `--kind <leitmotifs\|segments>` | which folder `--emit` writes to |
| `--instrument` / `--voice` / `--tag` | how the emitted track is staged |
| `--root <pitch>` | with `--mode shape`: re-root the shape here |
| `--confirm` | render it and put the take beside it in the bench |
| `--force` | overwrite an existing composition |
| `--out <path>` | where the transcription goes (default: beside the WAV) |

## What it cannot do

- **Tell a tempo from its double.** Every onset on a sixteenth at 90 is on an
  eighth at 180 with identical error, so a guess breaks ties toward 100 BPM. The
  same music, notated differently — harmless for transposition, wrong for a
  render that has to line up. **Play to a click and pass `--tempo`.**
- **Triplets and swing.** The grid is sixteenths. A shuffled take quantizes
  straight and loses its lilt. State the feel in words and let the render's
  `swing` put it back rather than guessing a tuplet from noisy onsets.
- **Name chords.** Simultaneous notes survive as simultaneous notes, but nothing
  here calls them a chord. Detected voicings are too mushy to trust, and a wrong
  chord symbol is worse than none.
- **Rescue a bad take.** Reverb, delay, heavy distortion and ringing open strings
  all read as extra notes. The take's job is not to sound good, it is to be
  *legible*.

## Where the code is

| | |
|---|---|
| [`src/engine/transcribe.ts`](../src/engine/transcribe.ts) | cleaning, grid fitting, quantizing, degrees, the emitted composition |
| [`src/engine/transcript.ts`](../src/engine/transcript.ts) | how a transcription reads: the grid, the contour, the confirm checklist |
| [`src/engine/shape.ts`](../src/engine/shape.ts) | intervals and rhythm without pitch or tempo, and rooting one back into a key |
| [`src/utils/wav.ts`](../src/utils/wav.ts), [`src/utils/resample.ts`](../src/utils/resample.ts) | decoding and 22050 Hz mono, because Node has no `AudioContext` |
| [`scripts/transcribe.ts`](../scripts/transcribe.ts) | the impure half: the model, the files, the render |

Everything musical is pure and tested; the script holds only what cannot be.
The cleaning pass in particular is worth reading before touching it — three
classes of detector artifact (chained ring tails, smeared attacks, ring scraps)
each have a rule, and each rule exists because a real take was read wrong without
it.
