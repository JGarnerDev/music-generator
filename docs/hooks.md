---
title: Hooks — why a piece is worth hearing twice
purpose: The genre-independent checklist for what makes music catchy, and which knob in this repo turns each one. Read at step 3, before writing bars.
audience: [claude, human]
updated: 2026-08-15
read_order: 9
see_also: [variety.md, knobs.md, looping.md, grooves.md]
status: living
---

# Hooks

[`variety.md`](./variety.md) is about pieces coming out *the same as each other*.
This is the other failure: a piece that is distinct from everything on the shelf
and still not worth hearing twice. Variety is a floor. This is the ceiling.

Everything below is one mechanic at different time scales:

> **The ear predicts. Catchy is being right most of the time and wrong once.**

Confirm nothing and it's noise. Confirm everything and it's wallpaper. The craft
is choosing *what* to break and *when*.

## The checklist

Run it before writing bars, the same way variety.md's knobs are chosen before
writing bars. Each item names the thing to decide and the field that decides it.

### 1. One cell, not a melody

A hook is 2–4 bars and identifiable in three seconds. It carries **one**
signature — an interval, a rhythm, or a rest. "Run to the Hills" is a rhythm.
"Ecstasy of Gold" is four notes moved up a step at a time, twenty times over.

*Here:* the section `figure` is the rhythmic half; a `melody` of 2–4 bars that
the piece **restates** is the pitched half. Rule 3 of variety.md is the same
rule from the other side — restate the riff with a melody over it, don't write
new material and call it an event.

Test: if you can't hum it back after one pass, it's a passage, not a hook.

### 2. State three, break the fourth

Repeat a phrase three times, alter the fourth — end it differently, add a bar,
drop a beat. It works at bar level inside a section and at section level across
the piece.

*Here:* `chords` is one entry per bar, so section length is the array's length.
Nothing forces 8. Write 6, or 10, or a 2-bar tag. The builder now nudges when
every section is 8 bars *and* when they are merely all the same length — both
are a meter the ear counts two bars ahead.

### 3. Contrast on three axes at once, not one

A new section that only changes instruments is the same section louder. Move at
least three of:

| Axis | Field |
|---|---|
| register | `register` **per section** — the chorus sits above the verse |
| rhythmic subdivision | `figure` (`gallop` → `straight-eighths` is a feel change, not a variation) |
| density / space | `drums: false`, `intensity`, `gains` |
| harmonic rate | split bars: `["Bb", "C"]` — the same progression twice as fast reads as acceleration |

`register` per section is the one that was missing until now, and it is the one
that matters most: inside eight semitones every root folds to the same place, so
a chorus could get busier and louder but never *lift*. See
[`variety.md`](./variety.md) for the band names.

### 4. One peak, placed late

Good melodies are an arc with a **single** highest note, hit once or twice,
around 70% of the way through. Verse lines are narrow and speech-like; chorus
lines are wide.

Sub-rule — **gap fill**: a large leap wants a step back in the *opposite*
direction. Leap up a sixth, then walk down. The ear demands the fill and notices
when it doesn't come.

*Here:* the written `melody` / `lead` arrays. Nothing checks this; it is the item
most often lost, because a top line written bar by bar tends to wander at one
altitude. Decide where the peak is before writing the notes.

### 5. Withhold something, then pay it off

Tension is a thing the ear wants and doesn't get yet:

- the **tonic** — circle it, resolve late (Ecstasy of Gold's whole architecture)
- the **downbeat** — push the chord an eighth early and the groove leans forward
- the **kit** — enter at bar 9, not bar 1 (`drums: false` on the opener)
- the **high note** — save it for the last chorus

The payoff must arrive. Withholding with no resolution isn't tension, it's just
an absence.

### 6. Negative space is the arrangement

A hook needs silence around it. "Son of a Preacher Man" is literally voice →
guitar answer → voice, and the two never share a bar. The common failure here is
every track playing every bar, which makes nothing memorable however good the
parts are.

*Here:* `gains`, `intensity`, `drums: false`, and simply not writing notes.
`breakdown` and `kit` are whole styles built on this.

### 7. Groove identity is *consistent* asymmetry

One syncopation, repeated until it is the piece's fingerprint. The gallop is
Maiden's. Random syncopation isn't groove — the same displacement every bar is.

*Here:* the `figure` shelf and the groove's swing. Choose one cell per section
and let it be that section's whole identity, rather than decorating.

### 8. Harmonic gravity, plus exactly one surprise

Orbit a target chord, then place **one** borrowed or unexpected chord at the
emotional peak — a bVI, a Neapolitan, a secondary dominant. `black-hat-arrives`
does this with a Db in bar 3 of a C-minor reveal, and its plan `note` says so.

One. Two surprises are zero surprises.

### 9. Something changes every 8 bars

Even in a loop. Add a part, drop one, shift an octave, take a fill. Static is
wallpaper — and on a loop the listener hears it for minutes.

### 10. In a loop, the hook is the seam

A loop has no chorus, so its rewards are elsewhere: the wrap must feel like
motion rather than a reset, and the internal variation cycle should be *longer*
than the loop so repeats don't stack identically. Mechanics:
[`looping.md`](./looping.md).

## What the builder checks

`npm run song:build` nudges on the mechanical ones — figure sameness, phrase
length, register motion, chord placement, gains, humanize, kit, `melodyOn`. It is
a nudge, never an error, and it cannot see the ones that matter most.

**Nothing checks items 1, 4, 5, or 8.** A contour peak, a withheld resolution and
the one surprising chord are decisions, and the only place they get made is
before the bars are written. That is why this is a checklist and not a linter.
