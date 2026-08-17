---
title: Recordings — capture rules
purpose: How to record a guitar take so the transcriber can read it. Read before hitting record, not after.
audience: [human, claude]
updated: 2026-08-17
see_also: [docs/transcribe.md, readme.md]
status: living
---

# Recordings

**WAV only.** There is no mp3, m4a, FLAC or AIFF reader here — a phone voice memo
has to be converted before it can be transcribed:

```bash
ffmpeg -i take.m4a -c:a pcm_s16le recordings/limping-waltz-hook.wav
```

Inside the WAV, anything a recorder normally writes decodes: PCM at 8, 16, 24 or
32-bit, or float at 32 or 64-bit, any sample rate, any channel count. Compressed
WAVs (ADPCM, µ-law) do not — re-export as plain PCM with the same command.

Drop guitar takes here as `<idea-slug>.wav`, then:

```bash
npm run transcribe -- --file recordings/<idea-slug>.wav --tempo 90 --key Am
```

**Claude cannot hear audio.** The transcription is the interface — the WAV is
raw material that gets converted to note events and a text summary, and only the
summary reaches the composer. So the take's job is not to sound good; its job is
to be *legible*. A scrappy clean take beats a beautiful drenched one.

The audio is gitignored (large, personal, not the source of truth). The
`.notes.json` beside it is committed — that is the artifact that survives, and it
keeps the detector's raw output as well as the quantized notes, so
`--requantize` can try another tempo or grid **without re-running the model**:

```bash
npm run transcribe -- --file recordings/<idea-slug>.wav --tempo 120 --requantize
```

Reach for that rather than a second full pass. The model runs at about half
realtime, so a 30-second take costs a minute; requantizing costs nothing.

**Check it by ear.** Adding `--emit <slug> --confirm` writes the transcription as
a playable piece, renders it, and puts your recording in the bench beside it as
`<slug>.take.mp3` — two rows a click apart under `npm run dev`. Play them against
each other and say what is wrong; the printed checklist maps each way it can
sound wrong to the flag that fixes it. That loop is the reliability, not the
detector.

## The rules that matter most

1. **One idea, 4–16 bars.** A hook, not a performance. Long takes cost real time
   to transcribe (~2s of compute per second of audio) and give the composer more
   than it can use.
2. **Play to a click, with a one-bar count-in.** This is the single biggest
   accuracy win. Note timing is quantized against the tempo you pass, and human
   rubato read against a grid turns into wrong rhythms rather than expressive
   ones. Then pass that same tempo as `--tempo`.
3. **No reverb, delay, or heavy distortion.** Effects tails read as sustained
   notes and smear the onsets that mark where a note begins. Record dry; the mix
   happens later in the render, not in the take.
4. **One note at a time.** Monophonic melody is the reliable case. Chords are
   detected but voicings come back mushy — if you want a chord *progression*, say
   it in words, and play the *melody*.
5. **Mute what you're not playing.** Open strings ringing in sympathy read as
   extra notes the composer will faithfully reproduce.
6. **Leave ~0.5s of silence at head and tail.** Gives onset detection a clean
   floor to measure against.

## Nice to have

- **DI beats a mic**, but a phone mic in a quiet room is fine. What kills a take
  is background noise and mains hum, not cheap gear.
- **Any sample rate and bit depth** — 44.1k/48k, 16/24-bit, mono or stereo. The
  script downmixes and resamples to the mono 22050 Hz the detector wants.
- **Don't over-compress or normalize.** Note amplitude becomes velocity; squashing
  the dynamics throws away the accents that make the phrase yours.
- **Say the key** with `--key` if you know it. It lets the summary come back in
  scale degrees, which is what makes the idea transposable into whatever key the
  piece ends up in.

## Naming

`<idea-slug>.wav` — name it after the idea, not the take (`limping-waltz-hook.wav`,
not `take3.wav`). Re-recording the same idea overwrites; the transcription is
regenerated anyway.
