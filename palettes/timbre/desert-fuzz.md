---
kind: timbre
slug: desert-fuzz
title: Desert Fuzz
tags: [fuzz, guitar, stoner, desert, buzzy, thin, dry, raw, solid-state, transistor, bite, cutting, gritty, harsh, small-amp]
parent: electric-guitar
instruments: [pluck, bass]
signal: [fuzz, solid-state-clip, band-limit, hard-double-track, dry]
character: small-amp transistor fuzz — thin, dry and buzzing, huge only by doubling
---

# Desert Fuzz

A subtype of [`electric-guitar`](./electric-guitar.md) — a small, cheap,
overdriven amp recorded close and dry. That file layers first and supplies the
pickup and cabinet; this one supplies the drive stage and the (absent) ambience.
A timbre only: pair it with an emotion for the notes and
[`desert-rock`](../genre/desert-rock.md) for the feel.

Read it against [`brown-sound`](./brown-sound.md), which is its opposite in every
respect. Brown is a big valve amp: warm, woody, mid-forward, sustain that blooms
into a plate. This is a small solid-state one: thin, buzzing, brittle at the top,
and it **stops when you stop**. Brown sounds expensive. This sounds found.

## Sound

- **Source:** a fuzzed pluck voice, doubled — and bass through the same treatment
  in unison, which is where the size actually comes from. One track of this is
  small on purpose; two hard-panned tracks of it are enormous.
- **Signal chain:** fuzz into a transistor stage clipped square (harsh odd
  harmonics, not the soft round saturation of a driven valve) → band-limit at
  *both* ends, so there is no deep low end and no air, only an aggressive
  midrange → hard double-track → dry. Order matters: clip before band-limiting,
  so the limiting tames the fizz rather than the fuzz feeding on a full-range
  signal.
- **Character:** buzzy, raw, unflattering. Notes are all attack and no bloom.
  Chords sound like one thick voice rather than separate strings. It cuts because
  it is narrow, not because it is loud.
- **Dry on purpose.** The chain deliberately names no reverb, plate, or echo —
  those keywords are what the blend resolver reads to add ambience, so leaving
  them out keeps the render close and airless, which is the whole effect. Do not
  add them "for space"; the space in this style comes from the arrangement, not
  the room.

## Cautions

- It fights sustained voices — pads and Rhodes turn to mush under it. Apply to
  pluck and bass and let something else carry the harmony bed, or drop the pad.
- `fuzz` matches the resolver's grit rule, so the render darkens (lower low-pass)
  and picks up wobble automatically. That is intended; do not stack another
  drive-flavoured timbre on top or it goes to sludge.
- The baseline reverb stays at the lo-fi default — the resolver only ever raises
  it, never lowers it, so this timbre cannot force a fully dead room today. If a
  render sounds too washed, that is why.
