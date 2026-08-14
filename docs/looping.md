---
title: Looping music for games
purpose: How to write and export a track that repeats for minutes without fatiguing or clicking at the seam.
audience: [claude, human]
updated: 2026-08-14
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

The loop render takes the body **plus four seconds**, then folds that
overhang back onto the head of the buffer ([`src/utils/loop.ts`](../src/utils/loop.ts)),
which is exactly what the previous lap's tail would have been doing if the music
had really been playing all along. The file's end runs into its own beginning.
Folding adds signal, so the result is peak-limited by a uniform gain rather than
clamped — a loop is heard too often to hide clipping distortion.

That fold is why a loop is a *file*, not a live transport loop: the wrapped
audio already contains what the previous lap was still ringing.

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
npm run render -- --file compositions/high-noon-warpath.json
npm run dev   # Play with Loop checked
```

Play with **Loop** checked plays `<name>.loop.mp3` — the tail-wrapped body, on
repeat — so the intro is skipped and the seam you hear is the seam the game
gets. Nothing is rendered in the browser: if you changed the notes, run
`npm run render` again or you are auditioning the old take.

Sounds are named in the plan, not in the built file: `"voices": { "pad":
"mens-choir", "lead": "string-section" }` sets each track's `voice` (see
[voices](voices.md)). A slug that doesn't exist fails the build. Patching
`voice` into the generated composition instead would be erased by the next
rebuild, same as editing the notes.

Four plan-level fields decide what the piece *is* before a single note is placed.
Leave them all out and you get the house sound, which is exactly how three loops
became one song:

```jsonc
{
  "register": ["C1", "B1"],                 // where the bass sits. Wider than an
                                            // octave and the progression keeps its
                                            // real shape; default G1–D2 folds every
                                            // root into 8 semitones and hides the key
  "gains": { "pad": 0.2, "pluck": 0.7 },    // per-track, over the builder's staging
                                            // ("pluck" is the rhythm guitar)
  "voices": { "drums": "frontier-kit" },    // the kit is a voice like any other
  "groove": { "patterns": { "kick": "…" } } // the beat
}
```

A plan is sections — an id, a `style`, a chord per bar, and any melody — and
[`scripts/build-song.ts`](../scripts/build-song.ts) expands it with the tested
builders in [`src/engine/riff.ts`](../src/engine/riff.ts). Edit the plan, rebuild,
re-audition; don't edit generated note arrays by hand.

Styles available: `standoff` (sparse intro), `riff` (the engine at full force —
figure in the bass, doubled as power chords), `riff`-with-`lead`, `motor` (same
parts, quieter pad, and a straight subdivision by default — the desert/stoner
engine), `kit` (drums alone, for a drum intro or a break), `breakdown` (engine
drops out), `rebuild` (eighths → full figure), `climb` (tremolo lift),
`turnaround` (riff + low stabs, for the last section).

`riff` and `motor` are the two dynamics: `riff` is the loud one, `motor` sits its
pad down and its ghosts up because fuzz and sustained voices fight. What they
*play* is the figure below.

## Figures — the knob that stops every piece being the same song

A style says how loud and how full; a **figure** says the actual rhythmic cell.
Three of this repo's four loops were once one song because the cell was a module
constant: every riff bar in every piece was the same sixteenth gallop on a
different root. It is now a per-section choice, so vary it *between sections* as
well as between plans:

```jsonc
{ "id": "riff-a", "style": "riff", "figure": "3+3+2", "chords": ["Dm", "Dm", "Bb", "C"] }
```

```bash
npm run figures                              # the whole shelf, with step strings
npm run figures -- --query "lopsided punk"   # scene words, like voice:find
```

| Figure | Feel |
|---|---|
| `gallop` | Leans forward, wants the next chord. Metal, chase. **The default — which is the reason to pick something else.** |
| `straight-eighths` | Pedals and refuses to move. Desert/stoner rock, krautrock. |
| `sixteenth-chug` | The motor doubled. Heavier with no new note. |
| `3+3+2` | Tresillo. Accent lands off the beat every half bar — lopsided, djent. |
| `pushed-eighths` | Weight on the off-beat, downbeats ghosted. Punk, ska, nervy. |
| `half-time-chug` | Two held chords a bar. Halves the apparent tempo without touching BPM. |
| `four-on-floor-stab` | Short quarter stabs with the gaps left open, so the kit has room. |
| `triplet-canter` | Long-short on an eighth-triplet grid. Cavalry, western chase, NWOBHM. |

The cell is written in the same step notation as a groove (`X` accent · `x`
softer · `o` ghost · `.` rest, one char per step), and a section can write one
inline instead of naming one — same object shape, for a cell only this piece
wants. Note lengths are *derived from the gap to the next hit*, so a figure is
legato by construction and can't be typed wrong. Definitions and the reasoning:
[`src/engine/figure.ts`](../src/engine/figure.ts).

`"subdivision": 4` on a `motor` section is still there as shorthand for
`"figure": "sixteenth-chug"`.

## Phrase length and where the chords change

`chords` is one entry per bar, so **the section is as long as the array** — six
bars, ten, or a two-bar tag. Eight everywhere, changing on every barline, is a
meter the ear predicts two bars ahead.

An **array entry splits that bar evenly**, which is how a chord change lands off
the barline:

```jsonc
"chords": ["Dm", "Dm", ["Bb", "C"], "Dm", "Dm", "Gm"]   // 6 bars, one half-bar change
```

Everything follows it: the figure picks the root per hit, the pad restates on the
change, and no note is allowed to ring through it. Four entries in a bar change
chord on every beat. The approach note into the next bar leaves the bar's *last*
chord, not its first.

## Exports

`npm run render` writes both, per piece:

| File | Use |
|---|---|
| `<name>.mp3` | Intro + body once, with a decay tail. Auditioning. |
| `<name>.loop.mp3` | Body only, tail-wrapped. Repeat it with no crossfade and no gap. |

Add `--wav` for full-quality `<name>.loop.wav` — **that** is the game asset;
the committed MP3s are for auditioning in the bench.

Ship the intro as a separate one-shot if the engine supports intro→loop
chaining; otherwise the loop file alone is fine to start on.
