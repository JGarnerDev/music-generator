---
kind: timbre
slug: tape
title: Tape / Vinyl
tags: [tape, vinyl, cassette, crackle, wow, flutter, dusty, warm, worn, analog, hiss, nostalgic, saturated, old]
instruments: [epiano, piano, pad]
signal: [tape-saturation, wow-flutter, lowpass, vinyl-crackle, hiss]
character: worn cassette warmth — pitch drifting, highs gone, dust on the needle
---

# Tape / Vinyl

A *sound* — the medium, not the music. The defining timbre of this repo's lo-fi
identity: it makes a clean render sound *found* rather than made. A timbre only;
pair with any emotion for the notes, and with `lofi` for the groove.

## Sound

- **Source:** whatever the emotion/genre picked — this layer processes, it does
  not choose voices. It flatters sustained, mid-heavy sources (Rhodes, felt
  piano, pad) and fights bright plucks, so darken those first.
- **Signal chain:** tape saturation (soft-knee compression + gentle harmonic
  distortion) → wow & flutter (slow ~0.5 Hz pitch drift plus faster ~6 Hz
  flutter, both subtle — a few cents, never seasick) → low-pass at 2–3 kHz with
  a matching high-pass around 80 Hz, so the band narrows at *both* ends → vinyl
  crackle and tape hiss underneath, constant and quiet.
- **Character:** worn and warm. Transients are softened, highs are simply gone
  rather than EQ'd down, and pitch is never quite stable. Mono-leaning, with the
  crackle stereo-wide so the music sits inside a room tone.
- **Dose:** the noise floor should be felt, not heard — audible in the gaps,
  invisible under the notes. If you notice the crackle before the melody, halve
  it. Wobble on a fast/percussive cue reads as broken, not vintage; keep this
  layer for tempos under ~110 BPM.
