---
title: Writing for sitar
purpose: Why a sitar voice playing a Western line still sounds like a guitar, and the raga grammar that fixes it. Read before writing any sitar part.
audience: [claude, human]
updated: 2026-08-17
read_order: 8
see_also: [bends.md, taste.md, voices.md, hooks.md]
status: living
---

# Writing for sitar

`pluck/sitar-jawari` is a convincing sitar *tone*. That is not the same as a
sitar *part*, and the gap is not subtle: a sitar playing a Western melody sounds
like a sitar patch. Everything below is about the notes, not the sound.

The first three sitar pieces here failed on this. They were tonal Western lines —
arcs with a late peak, chord changes underneath, a scale used identically in both
directions — with a sitar timbre on top. The tone was right and nothing else was.

## The five things that actually do it

Ranked by how much each one costs to fix and how much it buys.

### 1. The harmony must not move

**This is the big one.** Hindustani classical music has no chord progression. A
tanpura sounds Sa and Pa — the tonic and the fifth — and never changes for the
length of the piece. Every melodic note is heard against that fixed pair, and
that unchanging reference is *why* a raga's colour is audible at all.

A chord change under a sitar relocates the ear's tonal centre, and the instant
that happens the line is heard as Western music being played on an exotic
instrument. One bVI at the peak — good advice everywhere else in
[`hooks.md`](./hooks.md) — is the single most damaging thing you can put under a
sitar.

*Here:* a `pad` holding root+fifth for the whole piece, plus a quiet plucked
tanpura cycle (Pa, Sa, Sa, low Sa, one per beat, forever) on its own `pluck`
track. No progression, no bass movement, no passing chords.

### 2. The scale is different going up and coming down

A raga is not a mode. Its ascending form (**aroha**) and descending form
(**avaroha**) are usually *different sets of notes*, and that asymmetry is most
of what distinguishes one raga from another. Using one symmetric scale in both
directions is the tell that a mode was picked off a list.

Raga **Khamaj**, the one nearest to mixolydian, taken with Sa = A:

| | Degrees | On A |
|---|---|---|
| Aroha (up) | S G M P D N Ṡ | A C# D E F# **G#** A′ |
| Avaroha (down) | Ṡ Ṉ D P M G R S | A′ **G** F# E D C# **B** A |

Two rules fall out, and they are the whole raga:

- **Re (B) is omitted ascending** and present descending. Going up, A leaps
  straight to C#.
- **Ni is sharp going up (G#) and flat coming down (G).** The same degree, two
  different notes, decided by direction.

Write the line so those hold and it sounds like Khamaj. Write A mixolydian in
both directions and it sounds like a guitar solo.

### 3. An ascending meend is how you skip a note

The connection between the two rules above and [`bends.md`](./bends.md) is the
useful discovery here. A meend is played by pulling the string sideways across
the fret — up to **seven semitones on one pluck** — so a sitar's ascending
motion is frequently *one stroke that travels*, not several strokes.

And a note travelled through is not a note played. **Sa → Ga as a +4 meend
naturally omits Re**, which is exactly what the aroha demands. So:

- **Ascending: bend.** One pluck, a wide `meend` curve, landing on the next
  aroha degree. The omitted note is glided over rather than avoided.
- **Descending: pluck.** Discrete notes, which is where the omitted degrees come
  back in.

That one asymmetry — glide up, articulate down — does more for the impression
than any amount of ornament.

### 4. Chikari: the rhythmic drone strum

The sitar has high drone strings tuned to Sa and Pa, struck between melodic
phrases. The shimmering "ting-ting" cascade in the gaps is a primary identity
marker, and it is **completely absent** from a part written as a melody line.

*Here:* a second `pluck` sitar track playing high Sa and Pa — an octave or two
above the melody — on the offbeats while the melody rests. In **jhala**, the
closing section, that strum goes to sixteenths and becomes the drive of the
piece, with melody notes threaded between the strums.

### 5. Phrases resolve *to* beat one, not away from it

The rhythmic cycle is a **tala**; teental is 16 beats — four bars of 4/4 — and
its first beat is **sam**, the point everything lands on. A phrase is built to
arrive at sam, approached by a cadential run in the bar before it (the
**mukhda**). Western phrasing starts on the downbeat and unwinds; this aims at
one.

*Here:* write in four-bar groups and make the last beats of bar 4, 8 and 12 a
descending run into the note that lands on the next bar's beat one.

## Two more, cheaper

**Orbit the vadi.** Each raga has a king note (**vadi**) and a second
(**samvadi**) — Khamaj's are Ga and Ni. The line returns to the vadi
constantly and rests on it. This replaces the Western "one peak at 70%" arc
from [`hooks.md`](./hooks.md), which is a different tradition's shape.

**Quote the pakad.** Every raga has a signature phrase that identifies it in a
couple of seconds. Khamaj's is **Ṉ D M P D M G** — on A: G F# D E F# D C#.
State it, and restate it. It is the raga's hook and it already exists; there is
nothing to invent.

## Ornaments beyond the bend

Only reach for these once the five above are done — they are decoration on a
structure, and they cannot rescue a part that has chord changes under it.

| Ornament | What it is | Here |
|---|---|---|
| **meend** | The glide. Up to 7 semitones on one pluck. | `"bend": { "curve": "meend" }` |
| **andolan** | A slow oscillation on one held note. | A slow narrow bend with `release: true` |
| **kan** | A grace note leaning into the main note. | A very short quiet note before it |
| **murki** | A fast cluster of 2–3 neighbouring notes around one. | Short grace notes — the one place `claude.md`'s "don't write trills" does not apply |
| **krintan** | A descending note sounded by a left-hand flick, *not* re-plucked. | The next note at much lower velocity |
| **gamak** | Heavy wide oscillation, forceful. | Wide bend with `release`, repeated |

## Where this fights the taste rules

[`taste.md`](./taste.md) says bend a **half step**, and never more. That rule was
derived from a study fanned out on **electric guitar**, and a whole tone lost
there. Sitar idiom wants the opposite: meend is the connective tissue and it is
routinely 3–5 semitones.

Both can be true — a guitar bend and a sitar meend are different gestures on
different instruments — but nothing here has tested it. **Treat wide meend as
deliberately overriding the width rule, say so when you do, and get it judged.**
`bend-width` × `gesture` on a sitar rather than a guitar is the study that
settles it.

## What the engine cannot do yet

**A bend has one destination.** `bend` travels to a single target and can return
(`release`). A real meend often visits several stops on one pluck — Sa up to Ga,
down to Re, back to Sa, all without re-articulating. That needs `bend` to take a
list of stops rather than one `semitones`, and it is the largest remaining gap
between what this repo can write and what a sitar does.

Approximate it today by following a bent note with a much quieter unbent one,
which reads as a flick rather than a fresh pluck.

## Sources

- [Sitar techniques — meend, chikari, jhala](https://www.studysmarter.co.uk/explanations/music/musical-instruments/sitar/)
- [Ornamentation in Indian classical music](https://raag-hindustani.com/Embellishment.html)
- [Advanced ornamentation: soot, krintan, murki](https://www.octavesonline.com/post/advanced-ornamentations-soot-krintan-and-murki-on-sitar)
- [Raga Khamaj — aroha, avaroha, pakad, vadi](https://en.wikipedia.org/wiki/Khamaj)
- [Attributes of a raga](https://panditarvindparikh.org/articles/talim-related/attributes-of-raga/)
- [Teental and sam](https://en.wikipedia.org/wiki/Teental)
