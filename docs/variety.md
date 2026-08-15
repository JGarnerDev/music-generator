---
title: Variety — why pieces come out the same, and the knobs that fix it
purpose: The composition knowledge worth keeping from the first library. Read before writing a plan or a segment.
audience: [claude, human]
updated: 2026-08-15
read_order: 7
see_also: [knobs.md, looping.md, grooves.md, voices.md, ../progress.md]
---

# Variety

**The first library was cleared on 2026-08-14.** Four loop plans had been written
to find out what the tools could do, and the finding was worth more than the
pieces: three of the four were the same song. This doc is what survived them. It
is knowledge, not a backlog — the work it implies lives in
[`progress.md`](../progress.md).

## What actually happened

`high-noon-warpath`, `six-gun-shredout` and `black-hat-arrives` shared:

- one section arc — intro → riff → variation → halved harmonic rhythm →
  breakdown → rebuild → riff → climb → turnaround
- all-8-bar sections, every chord change on a barline
- 146–158 BPM
- a minor i–VII–VI–V with a harmonic-minor V
- one kit, one bass register, one rhythmic cell under all of it

`vulture-mile` was the only outlier and the only one that read as a different
piece. It differed by *choosing*: a straight-eighths motor instead of a gallop, a
tritone slide instead of the Andalusian descent, its own groove per section.

**The cause was not a lack of imagination. It was defaults.** Every knob below
has a default that is *fine*, and taking all of them lands you on the same piece
every time. At the time, the rhythmic cell wasn't even a knob — it was a module
constant, so every riff bar in every piece was one gallop on a different root.

## The knobs

All of these are plan fields today. `npm run song:build` prints which ones a plan
left alone — a nudge, never an error.

| Knob | Default | Why the default is a trap |
|---|---|---|
| `figure` (per section) | `gallop` | The rhythmic cell. `npm run figures` lists eight. Two pieces in the same key at the same tempo on the same figure *are* the same piece. |
| `register` | `G1`–`D2` | Eight semitones folds every key into the same eight notes, so a Dm descent and a Cm descent come out at the same pitches. Widen it and the progression keeps its real shape. |
| `gains` | the builder's house mix | The mix is an arrangement decision. A piece where the bass carries the riff and the guitar sits back is a different band from the house staging. |
| `voices.drums` | `house-kit` | Four kits now: `house-kit` (neutral), `frontier-kit` (western punctuation), `slab-kit` (rock backbeat), `brush-kit` (quiet, ride-led). |
| phrase length | 8 bars | `chords` is one entry per bar, so the section is as long as the array. Eight everywhere is a meter the ear predicts two bars ahead. |
| chord placement | on the barline | An array entry splits the bar: `["Bb", "C"]`. Everything follows it — the figure, the pad, the approach note. |
| `groove` (per section) | the plan's | Sections are where a listener hears the phrase change. A groove that never changes is a drum machine left running. |
| `melodyOn` | `piano` | Which instrument the written tune plays on. Left alone, every top line this repo has ever written is a keys voice — the whistle, the harmonica and the wordless soprano on the `lead` shelf have never carried a melody. |

Mechanics for each: [`looping.md`](./looping.md) and [`grooves.md`](./grooves.md).

## The rules

1. **Choose before you write bars.** Pick a figure per section, a register, a
   kit, gains, and at least one phrase that isn't 8 bars — *then* write notes.
   Reaching for them afterwards never happens.
2. **Vary between sections, not just between pieces.** A lap should change
   rhythmic cell at least twice. Contrast within the loop is what beats fatigue;
   see looping.md's "fighting fatigue".
3. **Restate the riff with a melody over it — never a different riff.** New
   material is not the same thing as a new event.
4. **Check the new piece against the shelf before writing it.** Same arc + same
   tempo band + same mode as something we already have is the signal to change
   something, and it is cheaper to notice now than after a twelve-minute render.
5. **A knob nobody turns is the same as no knob.** If the piece wants the house
   sound, that is allowed — but state it, so the next reader knows it was a
   choice.

## The mapping

The end state was that the *user's prompt* selects the knobs, rather than Claude
picking them by feel. That now exists: scene words → figure, tempo band,
register and harmony placement, printed on every run so the choice is
reviewable. See [`knobs.md`](./knobs.md) and
[`src/engine/knobs.ts`](../src/engine/knobs.ts).

The rules above are still the rules. What changed is that something now *applies*
them, and `compose` warns when a new piece lands in the same key and tempo band
as one already on the shelf — rule 4, enforced.

## What the engine gained since

The gaps this doc used to list have been closed; kept here in short form so the
reasoning isn't rediscovered.

- **`compose` reaches the knobs.** The fast path uses `figureLine` like a
  plan-built loop does, so it has the whole rhythm shelf, the register knob and
  split-bar harmony. With a kit present the statement still locks to the kick
  unless the scene asks otherwise — see [`knobs.md`](./knobs.md).
- **Harmony beyond the Andalusian minor.** All seven church modes plus harmonic
  minor, melodic minor, **phrygian-dominant**, lydian dominant and harmonic
  major. The mode list is hand-picked rather than "whatever tonal knows", because
  a mode with an augmented fourth between two degrees has a degree that is not a
  triad; `theory.test.ts` is the gate.
- **A genre's `mode` is read.** Not to set the key — the emotion is still the
  sole source of tonality — but to *warn*, both when it fights the emotion's
  scale and when it is simply being ignored.
- **Fills.** A groove states `fill` + `fillEvery` and the phrase-ending bar is
  replaced rather than layered over. See [`grooves.md`](./grooves.md).
- **Micro-timing humanize.** Seeded, pure, per part, with leans rather than only
  jitter — and clamped inside the bar, because everything upstream re-articulates
  on the barline. See [`src/engine/humanize.ts`](../src/engine/humanize.ts).
- **Meter beyond 4/4.** 3/4, 6/8 and 12/8 unlock the waltz, jig, shuffle and
  doo-wop figures, and the genres that need them.

## Two knobs that stayed defaults

Worth stating, because "a knob nobody turns is the same as no knob" applies to
these two most of all:

- **`--form song`** writes an intro and a B section with *different harmony*.
  The default `sample` still states a phrase and restates it, which is right for
  checking in — but a piece asked for as a piece should say so.
- **`humanize` in a plan** is off by default. It matters most on a long loop,
  where the sameness of every repeat is what the ear eventually hears.
