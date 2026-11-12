---
title: Clashes — why a note sounds sour when nothing is out of tune
purpose: The causes of "that note sounds slightly off" in a rendered piece, which the engine now handles and which are still the composer's job, and the checks to run before rendering. Read before writing a melody over distorted parts or a twin lead.
audience: [claude, human]
updated: 2026-11-12
read_order: 10
see_also: [hooks.md, looping.md, voices.md, taste.md, ../src/engine/clash.ts, ../src/engine/choke.ts, ../src/engine/harmony.ts]
status: living
---

# Clashes

A listener who says a note is "slightly out of tune" is almost never hearing a
tuning problem — every pitch here is exact. They are hearing one of four
things, found by taking apart a boss loop where a single guitar and a
harmonised pair kept producing painful notes. Ranked by how loud the effect
was:

| # | Cause | Who handles it now |
|---|---|---|
| 1 | Two notes ringing into **one** distortion stage | the renderer — `choke` |
| 2 | A twin line kept in the **key** while the **chord** moved outside it | `harmonize`, given the chords |
| 3 | A **held tune note** a semitone off the chord's root or fifth | you — `song:build` reports it |
| 4 | **Aliasing** from the drive on high notes | the renderer — oversampling |

Ruled out on the same piece, so not worth chasing first: onset timing between
the twins (under 3 ms), tape wobble (off unless a palette asks), and oscillator
detune (an audition render has none — it collapses fat stacks).

## 1. Distortion multiplies overlap into a grind

A drive stage multiplies everything it is fed against everything else. One note
through the guitar rig leaves its inharmonic products around −35 dB —
inaudible. A whole step with the previous note's release still ringing puts
them at **−7 dB**, nearly as loud as the notes: a cloud of difference tones
belonging to neither, which the ear files as "out of tune". Fifths and octaves
survive because their products land on the same harmonic series — which is the
whole reason a metal rhythm part is power chords.

A synth release rings out regardless of the next note; a guitarist's doesn't.
So every **amped** voice now **chokes**: a new onset shortens the previous
note's tail to end where it begins (`src/engine/choke.ts`; notes struck together
are a chord and never choke each other). A note followed by silence keeps its
full ring-out. `"choke": false` on a voice opts out — for let-ring arpeggios —
and `"choke": true` opts a clean voice in.

**What it means when writing:** a dyad or a third *inside one distorted track*
is still a grind, choke or not, because both notes are struck together. Harmony
between guitars belongs on **two tracks** — `twinLead` — each through its own
amp, never as stacked notes on one.

## 2. The key is not the harmony

A twin line a diatonic third away is right while the chord is diatonic. In a
minor key two common chords are not: the **major V** (raises the 7th) and a
**borrowed major IV** (raises the 6th). Kept strictly in the key, the second
guitar plays the unraised degree against the chord that raised it — D♭ against
a C major chord in F minor, a flat nine — and a lead's raised note snaps the
wrong way, leaving the two guitars a whole step apart.

Even on diatonic chords one third in each triad rubs: under the tonic in F
minor, the third below F is D♭, a semitone over the C the power chord is
sounding. Real twin-guitar parts step around it by ear.

`harmonize` now does that when it is given the chords (`song:build` always
gives them): it takes the chord's version of the altered degree, and where the
diatonic partner would still sit a semitone from the chord's root or fifth, it
moves to the nearest chord tone a third to a sixth away — usually the fourth or
fifth below. Thirds stay thirds wherever they don't rub, so the pair still reads
as harmonised leads.

**When writing `harmony` by hand** (counterpoint), the same rules are yours:
check every held partner note against the chord's root and fifth.

## 3. Held tune notes against the chord

The rhythm guitar and the bass sound a chord's **root and fifth** — loud,
sustained and distorted. A melody note a semitone from either, held for an
eighth or longer, is a minor second or a flat nine against them. The usual
offenders, all from writing a scale walk over a chord without checking it:

- the **7th over the VI**: C held over D♭ in F minor (a major seventh)
- the **♭6 over the i**: D♭ held over Fm, a semitone above the fifth
- the **♯11 over the VI**: G held over D♭, a semitone under its fifth

Passing sixteenths get away with all of these. Held notes don't. The fix is
nearly always the **chord**, not the tune — the tune is the hook, and there is
usually a chord that contains the held note: put B♭m under a C-to-D♭ walk
(the C becomes a ninth), E♭ under a G. Reharmonising keeps the melody the user
liked and removes the rub.

**`song:build` prints every one** after the defaults report:

```
Clashes: 11 held note(s) will sound sour (docs/clashes.md):
  the-strike       14:2   C5 over Db — a semitone from the chord's root (Db)
```

The goal is `Clashes: none` over a **distorted** rhythm section — there a rub is
a grind. Over a **clean** one (no `amp` on the plan's `pluck` or `bass`) the
report says so: a major seventh or a sharp eleven over a strum is usually
colour, and only the rubs you didn't mean need fixing. Either way, a rub you
meant can stay — say so in the section's `note` so the next reader knows it
was a choice. An octave-doubled note is reported once.
The report also flags the two lead lines a second, tritone or major seventh
apart while both sound. A segment written by hand rather than from a plan gets
no report, so apply the three bullets above yourself.

## 4. Aliasing on high, driven notes

Distortion makes harmonics far above the sample rate, and unless the waveshaper
is oversampled they fold back as inharmonic partials — heard as a sour top
note. Both drive stages of the guitar rig are now oversampled. It is about 6 dB
worse in an `--audition` render (22.05 kHz) than in the export, and worst
above C6: if a high lead note sounds off **only in the audition**, render the
full quality before rewriting anything.

## Checklist

Before rendering anything with distorted guitars or a twin lead:

1. `song:build` says `Clashes: none`, or every listed rub is a stated choice.
2. A non-diatonic chord (major V, borrowed IV) has the tune using *its* altered
   degree — E♮ over C in F minor, D♮ over B♭.
3. Harmony between guitars is on two tracks (`twinLead`), not stacked notes on
   one distorted track.
4. If a single high note sounds off only in the audition, judge it on the full
   render first.
