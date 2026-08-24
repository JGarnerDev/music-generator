---
kind: era
slug: romanticism
title: Romanticism
tags: [romantic, chopin, rachmaninoff, liszt, nocturne, piano, nineteenth-century, rubato, chromatic, salon, prelude, etude, virtuoso, parlour, pedal, expressive, longing]
mode: either
tempo: [48, 108]
instruments: [piano, pad]
progressions:
  - [i, VI, iv, V]
  - [i, "bII", V, i]
  - [i, iv, VII, III]
  - [i, V, VI, iv]
  - [I, IV, iv, I]
  - [I, vi, "bVI", V]
---

# Romanticism

The nineteenth-century piano: Chopin, Liszt, Rachmaninoff. Where
[`baroque`](./baroque.md) is a period that invented functional harmony and then
used nothing but, this is the period that kept the functions and spent a century
finding chromatic routes between them. A period lean, not a mood — layer it over
whichever emotion supplies the key.

## Harmony

- **The V is major, and the melody is not.** Write `V` uppercase in a minor
  progression and the numeral borrows the major dominant on its own — you do not
  need `harmonic-minor` as the scale, and you should not ask for it, because the
  melody keeps drawing from that scale and a raised 7th in the *tune* is not
  what this period sounds like. The leading tone belongs to the chord.
- **Go somewhere on the way home.** The cadence is not the event; the detour to
  it is. Two moves carry most of the style: the **Neapolitan** (`bII`, a major
  chord on the flat second, falling to V) and the **borrowed minor iv** in a
  major key (`[I, IV, iv, I]` — the single most Romantic bar in the repertoire,
  and it costs one chord).
- **Deceive at least once.** `V` to `VI` instead of `V` to `i`. Put it where the
  listener has been taught to expect the landing — the end of the second phrase,
  not the first — then land properly the next time round.
- **The bass falls by half steps.** A line descending `i` → `VII` → `VI` → `V`
  underneath a static harmony is the Rachmaninoff signature and works in any of
  these progressions: write the bass note first, then find the chord that holds
  it.

Read this against [`docs/taste.md`](../../docs/taste.md)'s tonic rule — you may
withhold the home chord as long as you like provided the last one is it. That
rule and this period agree, which is unusual and worth using.

## Texture

**Two textures, and a piece picks one.** The period fills the hands in two ways
and they are not variants of each other — they want different harmony, different
registers and different pieces.

*The spread arpeggio.* One per bar or per half bar, spanning a tenth or wider,
lowest note on the beat and the rest rising above it. Do not fill the gap between
the hands: this texture is a low bass, a hole, and a singing line, and the hole is
load-bearing. Chopin, and the cheaper of the two to write.

*The block chord.* Four or five voices moving together in both hands, with the
tune **inside** the chord rather than above it. Liszt and Rachmaninoff live here,
and for them it is not an accompaniment — the thickening *is* the form, because
what a restatement restates is the same theme carrying more voices. A chord is
simply notes sharing a `time` on one track, so nothing in the engine is in the
way. What is in the way is the budget below.

**The polyphony budget, which is the real constraint.**
[`salon-grand`](../../voices/piano/salon-grand.json) caps at 14 voices with a
4.2 s release, and a bar at 60 bpm is about 3 s — so a chord is still sounding
well into the next one, which is the whole point of the sound and also the whole
problem. Five notes every half bar leaves roughly fifteen alive, and past the cap
`PolySynth` steals the **oldest** voice: the bass, the note the ear was holding
the chord by. It does not sound like a limit being hit, it sounds like the piece
losing its bottom. Three fixes, cheapest first:

- **Split the hands across two `piano` tracks.** Each track builds its own synth,
  so the budget doubles to 28 for free, and the two hands get their own `gain` and
  `pan` besides.
- **Voice in four, not six.** Drop the fifth — root, third, seventh, ninth is both
  thinner and more Romantic than a doubled triad.
- **Write the pedal lift.** There is no pedal field; `duration` is the pedal. A
  chord written `"2n"` when the next lands a half note later never releases. Write
  `"4n."` and it clears with a hair of overlap, which is what a real foot does at
  a harmony change.

**Voice a chord from the bottom.** One bare low root, nothing else below C3 — a
third or a fifth down there plus a 4.2 s release is the mud everyone means when
they say a piano sounds synthetic — then stack the rest from about G3 up, close
position. And give the melody note of the chord `+0.15` velocity over the inner
voices: with no pedal and no una corda, that difference is the only thing making
the tune findable inside its own harmony.

**One melody, and it sings.** The right hand is a voice, so it needs breath: end
phrases, leave bars empty, do not run continuous sixteenths under your own tune.
Chopin's rubato figure — an odd number of melody notes stretched across a duple
bass, seven or eleven against four — is available here as irregular note times
rather than as tuplets. Write the melody's `time` values unevenly on purpose.

**Rubato is written, not played.** `bpm` is one number for the whole piece and
there is no tempo automation, so the flexibility has to be in the notes: push
the middle of a phrase a sixteenth late and pull it back before the barline, and
shorten the note *before* an arrival so the arrival sounds reached for. A piece
that sits exactly on the grid is a piano roll.

**Velocity is the only expression there is.** Ramp it across every phrase —
`0.35` rising to `0.8` at the peak and back to `0.4` — and never repeat a value
twice in a row. A constant velocity is the single loudest tell that nobody
played this, and it matters more here than in any other era on the shelf.

## The three levers

They are not interchangeable. Pick one per piece and commit.

| | texture | register | where the peak is |
|---|---|---|---|
| **Chopin** | arpeggio: one line, one spread left hand, nothing else | melody sits in the octave above middle C, bass low, gap between | early and small, then withdrawn |
| **Liszt** | chords, growing: the theme restated in octaves, then in four voices, then in both hands at once | extremes, deliberately: the top and bottom of the instrument in the same bar | late, enormous, and it is the point of the piece |
| **Rachmaninoff** | chords, thick from the first bar: four or five voices moving in parallel, the tune inside them | everything low and close together, bass heavy | late, and the arrival is a bass note landing, not a high note |

Chopin is the default for a D&D cue and the cheapest to write — one line and one
arpeggio is four notes a bar, and it fits the budget above without thinking about
it. Liszt needs a piece long enough to restate something three times, which is
the shortest form that shows a thickening at all: state it in one voice, then in
octaves, then in chords. Rachmaninoff is the expensive one and the reason the
budget is written down — thick from bar one means the polyphony question is live
in every bar rather than at the peak, so split the hands across two tracks before
writing anything, and write the pedal lifts as you go rather than discovering
them twelve minutes into a render.

## Rhythm

No kit, ever. The pulse lives in the left-hand arpeggio, which means the
arpeggio's shape is the groove and choosing it is not optional. Meter is a real
choice here: 4/4 for a nocturne, 3/4 for a waltz or mazurka, 6/8 for a
barcarolle — and 6/8 under a slow tempo is the one that sounds least like
everything else on this shelf.

## Instrumentation

`piano` with `"voice": "salon-grand"` — the pedalled grand, built for this: a
3 ms strike so the melody carries over its own accompaniment, and a 4.2 s
release so one arpeggio is still sounding when the next begins. That overlap
*is* the harmony. [`felt-piano`](../timbre/felt-piano.md) is the alternative
reading and a different piece: closer, smaller, and it cannot spread a tenth.

A `pad` underneath is optional and should be nearly inaudible when used —
`gain` around `0.15`, holding a root and fifth, never moving with the piano.
Anything more and the piano stops being the whole instrument, which it is.

## Doubling, and one open question

Double the melody at the octave when it needs weight.
[`docs/taste.md`](../../docs/taste.md) rules out the **sixth** for a second lead
— but a Romantic right hand doubles in sixths almost continuously, so this
palette and that rule disagree. The rule was measured on guitars, once. Until
someone runs `twin-leads` × `note-choice` on a piano, follow the rule and use
octaves; the disagreement is written here so the study has a reason to happen.

## Pairs with

[`nostalgic`](../emotion/nostalgic.md), [`lonely`](../emotion/lonely.md),
[`sad`](../emotion/sad.md), [`romantic`](../emotion/romantic.md),
[`calm`](../emotion/calm.md). For a D&D table this is travel, grief, a memory, a
room after the fight — never the fight.

Layer [`space/cathedral`](../space/cathedral.md) for a Liszt-scale piece and
nothing at all for a Chopin one: a nocturne in a big room stops being a person
at an instrument, which is the only thing it has.
