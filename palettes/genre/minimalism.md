---
kind: genre
slug: minimalism
title: Minimalism
tags: [minimalism, reich, glass, phasing, repetition, cell, pulse, process, hypnotic, interlocking, systems, marimba]

tempo: [96, 144]
mode: either
progressions:
  - [i, i, i, i]
  - [I, I, V, V]
  - [i, VII, i, VII]
instruments: [pluck, piano, epiano, pad]
---

# Minimalism

A short cell, repeated, changing by one element at a time. There is deliberately
**no `groove` block here**: the pulse comes from the pitched parts themselves,
and adding a kit turns the process into an accompaniment.

## How it works

- **One cell.** Four to eight notes, one bar or less, repeated exactly.
- **Phasing.** Two copies of the cell at *slightly different lengths* — one seven
  steps, one eight — so they rotate against each other and every repeat is a new
  vertical combination. The engine does this for free: lanes and patterns cycle
  independently over the bar, so a seven-character pattern against a sixteen-step
  bar phases exactly as it should. This is the one place in the repo where a
  pattern length that isn't a whole bar is *correct* rather than a typo — write
  it in a part's `pattern`, not a groove lane, since `validateGroove` rejects it
  there for good reason.
- **Additive process.** Add one note to the cell each repeat, or take one away.
  The listener hears the rule, and that is the pleasure.
- **Harmony is static or moves once.** A single chord change after thirty-two
  bars is an enormous event in this idiom.

## Voicing

Bright, short, identical attacks — marimba, plucked strings, staccato piano.
Blend and reverb are the enemy: each note has to be separately audible for the
pattern to be legible.

Layer with [`calm`](../emotion/calm.md), [`hopeful`](../emotion/hopeful.md) or
[`tense`](../emotion/tense.md) (a fast minimal cell is genuinely unsettling).
