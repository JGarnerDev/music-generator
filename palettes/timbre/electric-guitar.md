---
kind: timbre
slug: electric-guitar
title: Electric Guitar
tags: [guitar, electric, amp, pickup, driven, band, rock, string, plectrum]
instruments: [pluck]
signal: [pickup, amp-cabinet]
character: magnetic pickup into a driven speaker cabinet — mid-forward and mono
---

# Electric Guitar

The broad *sound* a family of amp tones narrows: a magnetic pickup into a driven
speaker cabinet. Not a mood and not a groove — pair it with an emotion for the
notes and a genre for the feel. On its own it is a serviceable plain electric
tone; for something specific reach for a subtype
([`brown-sound`](./brown-sound.md), [`desert-fuzz`](./desert-fuzz.md)), which
layers this file first and then overrides.

## Sound

- **Source:** the pluck voice for rhythm parts, the **lead** voice for a top
  line. They are one instrument played two ways and the engine keeps them apart:
  `pluck` decays fast, sits wide and stays low in the mix, while `lead` is
  compressed into sustain, mid-forward, near-centre and louder. Putting a solo on
  `pluck` is what makes it sound puny — it is fighting the rhythm part in the
  same band and losing. Chords are three or four notes, not six — the engine has
  no strum, so voice them tight and let the amp stage thicken them.
- **Signal chain:** pickup (narrow, mid-forward, no deep low end and no air —
  the band-limiting happens before anything else) → speaker cabinet, which
  rolls off everything above roughly 5 kHz. Every subtype's drive stage sits
  between those two.
- **Character:** mid-forward and mono-leaning. It cuts by occupying the middle
  of the spectrum, not by being wide or bright.

## What subtypes decide

The drive stage and the ambience — how the amp is pushed, and how much room is
allowed around it. That is the whole difference between the children here, so a
new subtype needs little more than a `signal:` chain and a `character:` line.
