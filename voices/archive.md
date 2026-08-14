---
title: Approved voices
purpose: The instrument sounds we listened to and kept — read this before choosing voices for a new piece.
audience: [claude, human]
updated: 2026-08-14
generated_by: npm run voice:approve
---

# Approved voices

Generated — edit the JSON under `voices/`, then re-approve. Each entry is a
sound that was auditioned in the voices bench and signed off, so it can be
named by any track: `{ "instrument": "lead", "voice": "<slug>" }`.

## piano

Struck keys. Carries a melody or a chord bed without asking for attention.

### Soft triangle — `piano/soft-triangle`

**default** · `warm` `neutral` `lo-fi`

The house piano since the first render: a triangle wave with a quick attack and a long release, so a chord bed blooms rather than clatters. Not a real piano and not trying to be one — it sits under a melody without ever claiming the front of the mix.

approved 2026-08-14 · [`voices/piano/soft-triangle.json`](./piano/soft-triangle.json)

## epiano

Electric piano — FM bell in the attack, warm body. The lo-fi default.

### FM Rhodes — `epiano/fm-rhodes`

**default** · `warm` `bell` `lo-fi`

Two-operator FM at a 2:1 ratio — the bell in the attack that reads as an electric piano, over a body that decays away fast enough to leave room. The modulation index is the character knob: past about 8 it stops being a Rhodes and starts being a bell.

approved 2026-08-14 · [`voices/epiano/fm-rhodes.json`](./epiano/fm-rhodes.json)

## pad

Slow, wide, sustained. Atmosphere and glue, never the top line.

### Sine halo — `pad/sine-halo`

**default** · `soft` `atmosphere` `slow`

Pure sine, 0.8 s to arrive and 3 s to leave. The slow attack is the instrument: it means a pad can never accidentally sound like a hit, so it glues an arrangement without ever competing for the front of it. The long release is what makes a chord change a swell instead of a cut.

approved 2026-08-14 · [`voices/pad/sine-halo.json`](./pad/sine-halo.json)

## bass

The low end. Owns everything under the guitars; defines the groove with the kick.

### Round saw — `bass/saw-round`

**default** · `round` `neutral` `lo-fi`

A plain sawtooth with a 20 ms attack — soft enough that the pick noise never fights the kick, quick enough that a walking line still has note starts you can hear. Sustains at 0.4, so a held root drops back under whatever is on top of it instead of pinning the mix.

approved 2026-08-14 · [`voices/bass/saw-round.json`](./bass/saw-round.json)

## pluck

Rhythm guitar: tight, fast-decaying, wide, low in the mix.

### Brown rhythm — `pluck/brown-rhythm`

**default** · `guitar` `rhythm` `chug` `brown-sound`

The rhythm half of the brown-sound rig. Two detuned saws into a mild preamp, a mid-forward tone stack and a hard cab roll-off at 4.4 kHz; the high-pass at 170 Hz goes in *before* the drive so low strings never intermodulate into mud, and the bass owns everything under it. Compression stays gentle (2.5:1) on purpose — a chug that compresses is a chug that lost its attack. Wide (0.6 Haas) and low in the mix, because the lead lives in the centre.

approved 2026-08-14 · [`voices/pluck/brown-rhythm.json`](./pluck/brown-rhythm.json)

### Chainsaw chug — `pluck/chainsaw-chug`

`guitar` `rhythm` `chug` `fuzz` `chainsaw`

The rhythm half of the chainsaw rig — what a track plays under `lead/doom-fuzz`, sharing its identity rather than its settings. What carries over is the identity: fat square oscillators instead of saws, the low end allowed into the drive (160 Hz rather than the brown rig's 170), and the same +6.5 dB HM-2 bump at 2.8 kHz under a 4.3 kHz cab, so the two guitars rasp in the same band and read as one rig. What does not carry over is length. Doom sustain belongs to the lead; a 1.4 s release on a palm mute is one long chord, so the envelope stays short (0.3 decay, 0.6 sustain) and the filter shuts in 140 ms — each chug has to be a separate event or the gallop turns to porridge. Four oscillators at 34 cents, not the lead's five at 44: beating that reads as serration on a held note reads as a wobble when it repeats sixteen times a bar. Sag stays gentle at 3:1 for the usual rhythm reason — a chug that compresses is a chug that lost its attack — but its threshold sits low (-14 dB) so a quiet chug is saturated too: a fixed input gain is what makes soft notes come out clean and keyboard-like. Everything that could read as a synth is deliberately removed rather than covered up. The filter barely sweeps — 900 Hz, two octaves, linear — because an audible sweep from a dark base *is* the synth-zap gesture, and a guitar is already bright at the pick rather than arriving there. Q is 0.5, since audible resonance is the loudest tell that a filter is in the signal at all. The envelope is decay-dominant (0.22 decay to a 0.35 sustain): a square wave holding a flat level is an organ, while a plucked string spends its energy and dies. Wide (0.62) and quiet (0.3 sum), because the centre belongs to the lead.

approved 2026-08-14 · forked from `pluck/brown-rhythm` · [`voices/pluck/chainsaw-chug.json`](./pluck/chainsaw-chug.json)

## lead

Top line guitar: compressed into sustain, mid-forward, centred, loud.

### Brown lead — `lead/brown-lead`

**default** · `guitar` `lead` `sustain` `brown-sound`

The lead half of the brown-sound rig, and not the rhythm tone turned up — turning the rhythm up is exactly what makes a solo sound puny and loud at once. Four things separate it: 6:1 compression at -26 dB so a held note stops decaying and starts singing; a higher high-pass and presence bump at 3.1 kHz so it climbs out above the chug instead of fighting it in the low mids; near-centre width (0.22), because the centre is the loudest place in a stereo mix; and roughly double the output sum.

approved 2026-08-14 · [`voices/lead/brown-lead.json`](./lead/brown-lead.json)

### Doom fuzz — `lead/doom-fuzz`

`guitar` `lead` `fuzz` `doom` `sustain`

Chainsaw doom fuzz — Fuzz/Ty Segall and Mastodon, where even a single note reads as a huge power chord, with the HM-2 rasp on top. It inverts the brown-sound rig's central rule rather than turning it up: the high-pass sits at 150 Hz instead of 260 so the low strings *do* hit the drive and intermodulate, because that woolly low-mid smear is the sound rather than a mistake to be engineered out. The oscillator is a fat square, not a saw — fuzz is a squaring transfer curve, and starting from odd harmonics beats manufacturing them downstream. The rip is two things and neither is gain: five oscillators at 44 cents, whose beating is the serration you hear as a chainsaw, and a +7 dB bump at 2.7 kHz under a 4.3 kHz cab, which is the band an HM-2 lives in. Sag is 9:1 rather than a limiter, because squashing the attack is exactly what files the teeth off — the note still blooms and never decays, but the pick arrives first. Wider than a brown lead (0.4) because size is the point, but not rhythm-wide: it is still a top line. Output sums low (0.42), since all that gain arrives as level.

approved 2026-08-14 · forked from `lead/brown-lead` · [`voices/lead/doom-fuzz.json`](./lead/doom-fuzz.json)

## drums

The kit — levels, tuning and decay per piece.

### House kit — `drums/house-kit`

**default** · `kit` `neutral` `lo-fi`

The kit every piece has used so far. Membrane pieces are pitched thumps — tuning is the only thing separating a kick from a floor tom — and everything else is a filtered noise burst where cutoff plus decay is the whole character. Levels live here rather than in the pattern: how loud a hat sits under a kick is a property of the kit, not of the groove. The snare is a burst plus a short membrane hit at 45% of its level, because the rattle alone reads as a hi-hat pitched down.

approved 2026-08-14 · [`voices/drums/house-kit.json`](./drums/house-kit.json)
