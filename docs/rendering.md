---
title: Rendering audio
purpose: How compositions become files the app plays, why rendering lives in a CLI and not the browser, and which designs were tried and rejected.
audience: [claude, human]
updated: 2026-08-14
read_order: 4
see_also: [../readme.md, ../claude.md, looping.md]
---

# Rendering audio

**The app plays files. It synthesises nothing.** A composition you have not
rendered is a composition the user cannot hear.

```bash
npm run render -- --all                                   # everything
npm run render -- --file compositions/loops/vulture-mile.json
npm run render -- --all --force                           # re-render existing
```

Output lands in `public/audio/`:

| File | What |
|---|---|
| `<name>.mp3` | Intro + body once, with a decay tail. |
| `<name>.loop.mp3` | Body only, tail-wrapped — only for pieces with a `loop` window. See [looping](./looping.md). |
| `manifest.json` | What exists, how long, when rendered. The app fetches this on load. |

MP3s are **committed**. They are ~2 MB where the WAV is ~20 MB, and git keeps
every version you ever render. `--wav` writes full-quality WAVs beside them
(gitignored) — that is what ships into a game.

## Flags

| Flag | Why you'd reach for it |
|---|---|
| `--file <path>` / `--all` | One piece, or the library. One is required. |
| `--force` | Re-render pieces that already have audio. **Needed after every edit** — a rendered file has no idea the notes moved. |
| `--audition` | ~2.3× faster at reduced quality (22 kHz, thinner guitar voices). For iterating, not for what you keep. |
| `--wav` | Also write full-quality WAVs. |
| `--jobs <n>` | Pieces in parallel. Defaults to half your cores. |
| `--bitrate <kbps>` | MP3 bitrate, default 160. |

## Why a headless browser

Web Audio is the synth engine, and **Tone.js cannot run in node.** It goes
through `standardized-audio-context`, which needs a real `window`; rendering
against `node-web-audio-api` with shims hangs rather than failing cleanly
(tried, 2026-08-14). So `scripts/render.ts` starts Vite, opens `render.html` in
a headless Chromium via Playwright, and calls into `src/dev/render-page.ts`.
The graph is the same one the app has always used, so what the CLI writes and
what the browser would have produced are the same audio.

Three things about that pipeline are non-obvious and were each learned the hard
way:

- **HMR must be off** (`server: { hmr: false }`). Editing any source file
  mid-run reloads the page under a render in progress and kills it with
  `Execution context was destroyed`.
- **PCM comes back in slices**, through a `page.exposeBinding` callback, not as
  a return value. A few minutes of stereo float audio is tens of megabytes and
  serialising that in one piece is slow and fragile.
- **The manifest is written in a `finally`** and merged against what is actually
  on disk. A full library is tens of minutes of rendering; a crash must not
  erase the record of what already succeeded. Re-running skips finished work.

## Speed, measured

Render cost is dominated by **native DSP**, not by scheduling — and inside that,
by the guitars. Numbers for `six-gun-shredout`, from `bench.html`:

| Variant | ×realtime |
|---|---|
| Full graph | 0.9 |
| Without reverb | 0.9 — *reverb is not the cost* |
| Without drums | 0.9 — *nor is the kit* |
| Without the two guitar chains | 4.8 |
| 22 kHz | 1.8 |
| Single oscillator per voice | 1.1 |
| Without preamp oversampling | 0.9 — *free quality, keep it on* |

Headless Chromium is ~4× slower again (0.2× realtime), which is why `--jobs`
exists: `six-gun-shredout` alone takes ~12 minutes, the whole library ~12
minutes wall-clock across 6 jobs.

**Measure before optimising this.** Three confident guesses about where the time
went were all wrong; `bench.html` (`npm run dev` → `/bench.html`) settled it in
minutes each time. It profiles by phase (JS scheduling vs native DSP) and strips
the graph down part by part.

## Rejected designs

Each of these looked reasonable and shipped before failing. Do not reintroduce
them.

1. **Synthesise live in the browser.** A realtime graph must fill every audio
   buffer before its deadline; two guitar amps plus per-note voice allocation
   plus main-thread scheduling miss it. Stutter and silent holes, worse the
   better the arrangement got.
2. **Render the whole piece, then play the buffer.** No stutter, but tens of
   seconds of waiting before every first listen.
3. **Stream the render — play chunk 1 while chunk 2 renders.** Fast to start,
   and it made audio quality depend on winning a race against the playhead,
   which it lost on exactly the dense material that needed it most. A worse
   failure than the wait it fixed.
4. **A "Bake" button in the app.** Correct mechanism, wrong place: a build step
   does not belong in the UI. Rendering is a codebase chore; the website should
   be ready on load.

Two traps that bit along the way and are still live if you touch this code:

- **`Tone.Offline` yields on a `setTimeout` once per second of rendered audio**
  (`OfflineContext.js`). A hidden tab throttles timers to 1/second, and to
  ~1/minute after five minutes — a render in a background tab crawls or never
  finishes. Rendering `false` (synchronous) instead freezes the page and starves
  the event loop Playwright needs. `src/app/render.ts` documents the tradeoff.
- **`Tone.Reverb` generates its impulse response asynchronously, from its
  constructor, in a nested offline context, seeded from `Math.random`** — so it
  can be empty when the render starts and it differs run to run. Replaced with
  `Tone.Convolver` fed a seeded IR from [`src/utils/impulse.ts`](../src/utils/impulse.ts),
  which also makes renders reproducible.

## Where the code is

| Path | Role |
|---|---|
| `scripts/render.ts` | The composition CLI: which files, what to write, manifest. |
| `src/dev/render-harness.ts` | Vite + Playwright + the job queue. Shared with `render-voices.ts`. |
| `scripts/render-voices.ts` | The same pipeline for voice probes → `public/audio/voices/`. See [voices](./voices.md). |
| `src/dev/render-page.ts` + `render.html` | The page the browser runs. Dev-only, never bundled. |
| `src/app/render.ts` | Offline render → PCM. The only place audio is synthesised. |
| `src/app/graph.ts`, `instruments.ts` | The Tone graph. Runs only under the render script now. Instrument tone comes from `voices/` — see [voices](./voices.md). |
| `src/app/quality.ts` | Export vs audition profiles, with the measurements behind each knob. |
| `src/engine/manifest.ts` | Manifest shape, indexing, merge — tested. |
| `src/utils/mp3.ts` | Float PCM → MP3 (`@breezystack/lamejs`; the published `lamejs` is broken) — tested. |
| `src/app/playback.ts` | Load a URL, play it. ~60 lines. |
| `bench.html` + `src/dev/bench.ts` | Render profiler. Reach for this before optimising. |
