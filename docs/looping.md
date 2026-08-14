---
title: Looping music for games
purpose: How to write and export a track that repeats for minutes without fatiguing or clicking at the seam.
audience: [claude, human]
updated: 2026-08-13
read_order: 3
see_also: [../readme.md, ../claude.md, palette-authoring.md]
---

# Looping music for games

A song and a game loop are different jobs. A song gets to end. A loop is heard
twenty times in a five-minute fight, and the two things that ruin it are the
**seam** (an audible gap or click on the wrap) and **fatigue** (the ear learns
the whole thing and starts predicting).

## The shape

```jsonc
{
  "loop": { "startBar": 8, "endBar": 72 }  // endBar exclusive
}
```

Bars before `startBar` are a one-shot **intro**; `[startBar, endBar)` is the
**body** that repeats. Both bars must be whole numbers — the wrap is cut on a
sample boundary, and a fractional bar would drift the grid every lap.

## Three rules for the seam

1. **End on the V, not the i.** The last bar of the body should want the first
   one back. Land on the dominant and the wrap *becomes* the V→i resolution — the
   loop point turns into the best moment in the piece instead of a scar. A final
   cadence is the worst possible loop point.
2. **Never stop at the seam.** No rest, no held whole note, no ritard in the last
   bar. Keep the engine (gallop, ostinato, drums) running right through it. A
   chromatic approach note on the last sixteenth, aimed at the *loop start's*
   root, sells the join — `build-song.ts` wires this automatically.
3. **Keep the body self-contained.** Nothing in the body may depend on a note
   that started during the intro, because on lap two that note never happened.
   The loop exporter enforces this by rendering from the loop point, so anything
   left over from the intro simply isn't there.

## Why exported loops need tail-wrapping

Even a perfectly written body doesn't loop if you just cut the file at the loop
point: reverb tails, release envelopes and ringing notes spill past the end into
silence. Repeat that file and every lap chops the decay and restarts dry — a
click or a "breath", once per lap, forever.

`renderLoopToWav` renders the body **plus four seconds**, then folds that
overhang back onto the head of the buffer ([`src/utils/loop.ts`](../src/utils/loop.ts)),
which is exactly what the previous lap's tail would have been doing if the music
had really been playing all along. The file's end runs into its own beginning.
Folding adds signal, so the result is peak-limited by a uniform gain rather than
clamped — a loop is heard too often to hide clipping distortion.

Live playback gets the same effect for free: Tone's transport loop lets notes
ring past `loopEnd` while the body restarts.

## Fighting fatigue

Length and contrast, not cleverness. A 16-bar loop is a tic within two minutes;
64 bars at 150 BPM is ~102 seconds, which is roughly the shortest body that
survives a long fight. Give the ear a new event every ~15 seconds by varying
sections rather than notes:

- restate the riff with a melody over it, not a different riff
- change the **harmonic rhythm** (two bars per chord instead of one) — it reads
  as heavier without new material
- **drop everything out** for a section. The breakdown is what makes the return
  hit, and it is the single biggest anti-fatigue tool
- rebuild, then come back harder

## Workflow

Long loops are thousands of mostly-mechanical notes, so they're generated from a
**plan** rather than hand-authored:

```bash
npm run song:build -- --plan plans/high-noon-warpath.json
npm run composition:validate -- --file compositions/high-noon-warpath.json
npm run dev   # Play (Loop checked) → Export Loop
```

A plan is sections — an id, a `style`, a chord per bar, and any melody — and
[`scripts/build-song.ts`](../scripts/build-song.ts) expands it with the tested
builders in [`src/engine/riff.ts`](../src/engine/riff.ts). Edit the plan, rebuild,
re-audition; don't edit generated note arrays by hand.

Styles available: `standoff` (sparse intro), `riff` (gallop + power chords),
`riff`-with-`lead`, `motor` (straight eighths pedalling the root — the desert/stoner
engine; `"subdivision": 4` makes it a sixteenth chug), `kit` (drums alone, for a
drum intro or a break), `breakdown` (engine drops out), `rebuild` (eighths →
gallop), `climb` (tremolo lift), `turnaround` (riff + low stabs, for the last
section).

`riff` and `motor` are the two engines and they are opposites: a gallop leans
forward and wants the next chord, a motor refuses to move and gets its weight
from repetition. Don't mix them inside one piece — pick the one the genre wants.

## Exports

| Button | File | Use |
|---|---|---|
| Export WAV | `<name>.wav` | Intro + body once, with a decay tail. Auditioning. |
| Export Loop | `<name>.loop.wav` | Body only, tail-wrapped. **This is the game asset** — set it to repeat with no crossfade and no gap. |

Ship the intro as a separate one-shot if the engine supports intro→loop
chaining; otherwise the loop file alone is fine to start on.
