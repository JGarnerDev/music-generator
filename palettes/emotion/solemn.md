---
kind: emotion
slug: solemn
title: Solemn / Sacred
tags: [solemn, sacred, funeral, ritual, ceremony, church, temple, holy, reverent, oath, vigil, requiem, procession, mourning, grave, monastery, hymn]
tonality:
  tonic: G
  scale: dorian
progressions:
  - [i, VII, i, i]
  - [i, IV, i, VII]
  - [i, v, VI, VII]
  - [VII, i, VII, i]
tempo: [50, 72]
instruments: [pad, piano, epiano]
---

# Solemn / Sacred

Weight and ceremony. A funeral, an oath, a temple, the moment a king is crowned
or buried. Not [`epic`](./epic.md), which is about scale and excitement — this is
about *gravity*, and it does not want to be exciting.

## Direction

- **Tonality:** **dorian**, not aeolian. The natural sixth is what makes plainsong
  and church modes sound ancient rather than merely sad, and a minor palette that
  reaches for the major IV (`[i, IV, i, VII]`) has an entirely different colour
  from one that reaches for iv. The bVII rather than a leading tone: a
  harmonic-minor V here sounds like opera, not liturgy.
- **Tempo:** 50–72 BPM, and metrically square — this music is walked to. Consider
  `meter: [3, 4]` for a processional, or 6/8 with `six-eight-stab` for a slow
  march.
- **Voicing:** open fifths and octaves, moving in **parallel** rather than by
  voice-leading. Parallel fifths are the rule here, not a mistake: they are the
  sound of organum, and they instantly read as sacred.
- **Melody:** stepwise, narrow, in long even note values. No syncopation
  anywhere — a rhythm that pushes is a rhythm with a body in it, and this is
  ritual.
- **Dynamics:** 0.35–0.7, even within a phrase and terraced between them. Loud
  and soft as blocks, the way an organ has stops rather than a swell pedal.

## Lo-fi treatment

- Long reverb, and a lot of it — this is the one palette where a cathedral-length
  tail is not too much. Layer [`palettes/space/cathedral`](../space/cathedral.md).
- Keep the top end. Unlike most palettes here, this one wants air: a dark
  low-passed choir sounds like a rumour of a choir.

## Layer it with

- [`cinematic`](../genre/cinematic.md) for a score reading, with the tolling
  low tom the genre already carries.
- [`ambient`](../genre/ambient.md) for a vigil that goes on for minutes.
- A kit is usually wrong. If you want one, it is a single low drum on the
  downbeat and nothing else.
