---
title: Variety — why pieces come out the same, and the knobs that fix it
purpose: The composition knowledge worth keeping from the first library. Read before writing a plan or a segment.
audience: [claude, human]
updated: 2026-08-15
read_order: 7
see_also: [looping.md, grooves.md, voices.md, ../progress.md]
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

## The mapping — not written yet

The end state is that the *user's prompt* selects the knobs: scene words →
figure, tempo band, register, mode, section arc, kit. Today Claude picks them by
feel, which is why the rules above exist as a checklist instead of as code.
Writing that mapping down (here or as a palette field) is a P1 item in
[`progress.md`](../progress.md).

## Known gaps in the engine

Carried here so they aren't rediscovered:

- **`npm run compose` reaches none of this.** Figures, register and split-bar
  harmony live in `figure.ts`/`build-song.ts`, so they exist for plan-built
  **loops** only. Segments go through `composer.ts` + `parts.ts`, which never
  import `figure.ts` — the fast path for scoring a scene on the fly still has one
  rhythm vocabulary.
- **Harmony is stuck on the Andalusian minor.** i–VII–VI–V with a harmonic-minor
  V was the only progression the first library ever used. Dorian, a Phrygian bII
  drone, pedal-point harmony and major-key westerns are all unexplored, and
  phrygian-dominant — the mode this genre most wants — is unsupported
  (`MODE_FAMILY` is the seven church modes only).
- **A genre palette's `mode` is read by nothing.** Declared inertly everywhere.
- **No fills.** A groove states one bar and repeats it; nothing marks the end of
  an eight-bar phrase, which is most of why a long loop reads as a machine.
- **No micro-timing humanize.** Every note lands exactly on its (possibly swung)
  grid position, and two notes on the same accent character are bit-identical in
  velocity.
