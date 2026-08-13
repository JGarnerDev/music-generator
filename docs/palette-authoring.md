---
title: Palette Authoring
purpose: The palette taxonomy (kinds), the hard schema for each, and how to add one. Read before writing or editing a palettes/*.md.
audience: [claude, human]
updated: 2026-08-12
read_order: 4
see_also: [readme.md, ../src/engine/palette.ts]
status: living
---

# Palette Authoring

Palettes map human intent → musical direction. They live under `palettes/<kind>/`
and are validated by a hard schema — a zod discriminated union on `kind` in
[`src/engine/palette.ts`](../src/engine/palette.ts). That file is the source of
truth; this doc is the human-readable companion. Invalid frontmatter fails loudly
at load with a path'd message.

## Kinds

Palettes compose in layers — an **emotion** supplies key + feeling, a **genre**
supplies groove + harmonic vocabulary, a **timbre** supplies the actual sound.
"Samurai duel" = `tense` × a cinematic genre × a metallic timbre, blended (see
[Blending](#blending)), not a new stored file.

| kind | folder | answers | carries |
|---|---|---|---|
| `emotion` | `palettes/emotion/` | *how should it feel?* | tonality, progressions, tempo, instruments |
| `genre` | `palettes/genre/` | *what's the groove?* | tempo, mode lean, optional progressions, instruments |
| `timbre` | `palettes/timbre/` | *what does it sound like?* | instrument voices, signal/fx chain, character — **no harmony** |

**Kinds are open-ended.** These three have strict schemas; any *other* subfolder
(`palettes/era/`, `palettes/space/`, …) is a new descriptive layer and validates
against a permissive **generic** schema — the base fields plus any optional
structured hints it wants (`tempo`, `instruments`, `signal`, …). Add a folder + a
file with prose; no code change. Promote a kind to a strict schema (in
`SCHEMAS`) once its shape settles.

## Schema per kind

All kinds share `kind`, `slug`, `title`, `tags` (non-empty). Then:

**emotion** — the composable primitive (only kind `compose` accepts):
```yaml
kind: emotion
slug: sad
title: Sad / Bittersweet
tags: [sad, grief, ...]        # what a user might type
tonality: { tonic: A, scale: minor }   # scale must be major|minor (theory resolves diatonically)
progressions:                  # roman numerals, diatonic; accidentals are ignored on resolve
  - [i, VI, III, VII]
tempo: [60, 78]                # [min, max] BPM
instruments: [piano, pad]      # optional; must map to engine InstrumentName
```

**genre** — groove + harmony vocabulary, no fixed tonic:
```yaml
kind: genre
slug: jazz
title: Jazz
tags: [jazz, swing, ...]
tempo: [80, 132]
mode: either                   # optional: major | minor | either — the harmonic lean
progressions:                  # optional signature progressions
  - [ii, V, I]
instruments: [epiano, bass]    # optional
```

**timbre** — pure sound, no tonality/progressions/tempo:
```yaml
kind: timbre
slug: analog-synth
title: Analog Synth
tags: [synth, analog, ...]
instruments: [pad, pluck]      # optional: voices this timbre maps to
signal: [saw-detune, lowpass-sweep, chorus, tape-echo]  # optional: fx chain, in order
character: warm detuned saws through a resonant low-pass  # optional one-liner
```

## Blending

The resolver ([`src/engine/blend.ts`](../src/engine/blend.ts)) layers palettes into
one `MusicalDirection` the composer renders. `compose` exposes it via `--with`:

```bash
npm run compose -- --mood "smoky duel" --palette tense --with jazz,brown-sound
```

Rules (small on purpose, all unit-tested):

- **Emotion — exactly one.** It is the only kind with tonality, so it fixes tonic +
  scale. Zero or two emotions is an error (ambiguous key).
- **Tempo** — intersect every layer's range; if two layers don't overlap, the
  later (more specific) layer wins.
- **Progressions** — a non-emotion layer's progressions (a genre's harmonic
  vocabulary) override the emotion's; otherwise the emotion's are used.
- **Instruments** — merge every layer's list in order, keep known voices, dedupe;
  pick a sustained `padVoice` + a `leadVoice` (piano > epiano > pluck) for the two
  tracks.
- **Signal** — concat every layer's fx chain, then nudge the lo-fi settings
  (drive → darker + wobble; tape/chorus → wobble; reverb/echo → wetter) so a
  timbre audibly changes the render.

## Adding one

- Scaffold: `npm run palette:new -- --kind <kind> --slug <slug> --title "<t>" --tags a,b,c`
  (emotion also takes `--tonic --scale --tempo`). Writes `palettes/<kind>/<slug>.md`.
- Write the prose body: *when to reach for it* and *how to voice it*. Keep it short.
- **Rules:** emotion `scale` is still major or minor (the engine has no modes yet —
  see progress.md). Progressions, though, are read as written: **numeral case and
  accidentals are instructions, not decoration.**
  - Uppercase = major triad, lowercase = minor. `[i, iv, i, V]` gets the major V of
    a harmonic-minor cadence; write `v` if you want the natural-minor one.
  - An uppercase numeral on a degree that isn't diatonically major **borrows** —
    `VII` in a major key resolves to the Aeolian `bVII` (C major → Bb), and `iv`
    in major gives the borrowed minor iv. Write the accidental explicitly
    (`bII`, `#iv`) whenever you want to be unambiguous; it is honoured.
  - Bare lowercase on a diminished degree stays diminished, so a minor `ii-V-i`
    keeps its half-diminished colour.
  - This means a minor-idiom progression stays minor even when it lands on a
    major emotion. That is deliberate — see `resolveNumeral` in
    [`src/engine/theory.ts`](../src/engine/theory.ts) — but the melody is still
    drawn from the emotion's scale, so a mode-crossed blend can rub. Prefer
    pairing a genre with an emotion whose scale matches its `mode`.
- Timbre never carries harmony; that belongs to emotion/genre.
