---
title: Approved voices
purpose: Index of the instrument sounds we kept — read this before choosing voices for a new piece.
audience: [claude, human]
updated: 2026-08-24
generated_by: npm run voice:approve
---

# Approved voices

Generated — edit the JSON under `voices/`, then re-approve. Each row is a
sound that was auditioned in the voices bench and signed off, so it can be
named by any track: `{ "instrument": "lead", "voice": "<slug>" }`.

**This is the index, not the design record.** Why a voice is built the way it
is — which numbers matter, what happens either side of them — is the `notes`
field of its JSON. Read that for the *one* voice you are forking; read this
table to choose.

## piano

Struck keys. Carries a melody or a chord bed without asking for attention.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`piano/felt-hammer`](./piano/felt-hammer.json) | piano felt soft intimate close ballad lonely | Felt strip over the strings: 12 ms attack, no hammer hill, mechanism noise at 900 Hz. The intimate close piano for ballads and lonely cues. |
| [`piano/music-box`](./piano/music-box.json) | music-box bell metal toy childlike eerie lullaby nostalgic | Inharmonic FM at 3.5:1, zero sustain, no low end at all. Lullabies, doll's houses and villains, never an ordinary piano part. |
| [`piano/salon-grand`](./piano/salon-grand.json) | piano grand pedal sustain bloom nocturne romantic dreamy chopin salon expressive wide | Pedalled salon grand: 3 ms strike, 4.2 s release, hammer hill back at 3.1 kHz. The nocturne piano, for arpeggios that ring into each other. |
| [`piano/salon-unison`](./piano/salon-unison.json) | piano grand pedal sustain unison strings beating nocturne romantic dreamy chopin acoustic organic | Three strings, one hammer. |
| [`piano/soft-triangle`](./piano/soft-triangle.json) **default** | warm neutral lo-fi | Triangle wave, quick attack, long release, so a chord bed blooms rather than clatters. The house piano, not a real one. |

## epiano

Electric piano — FM bell in the attack, warm body. The lo-fi default.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`epiano/clav-comb`](./epiano/clav-comb.json) | clavinet funk percussive bite short groove rhythm | Subtractive rather than FM, and the shortest release on the shelf. The only keys voice that is a rhythm instrument: funk and clav parts. |
| [`epiano/drawbar-organ`](./epiano/drawbar-organ.json) | organ hammond drawbar leslie chorale gospel soul comping | Tonewheel organ, no amp: an attack plus unity sustain. The only keyboard that states a chord on the beat and holds it, where a pad swells. |
| [`epiano/fm-rhodes`](./epiano/fm-rhodes.json) **default** | warm bell lo-fi | Two-operator FM Rhodes — bell in the attack over a body that decays out of the way. The lo-fi electric piano. |
| [`epiano/wurlitzer-reed`](./epiano/wurlitzer-reed.json) | wurlitzer reed bark hollow soul blues lofi | The reed instead of fm-rhodes's tine: harmonicity 1, index 11, scooped middle. Soul and blues, where the Rhodes is too polite. |

## pad

Slow, wide, sustained. Atmosphere and glue, never the top line.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`pad/mens-choir`](./pad/mens-choir.json) | choir voices wordless spaghetti-western section ah | Wordless men's chorus on one open 'ah' — wide detune, collective drift. Chants under a western; holds harmony, never the tune. |
| [`pad/sine-halo`](./pad/sine-halo.json) **default** | soft atmosphere slow | Pure sine, 0.8 s in and 3 s out. Glue that can never accidentally sound like a hit — the neutral pad. |
| [`pad/string-bed`](./pad/string-bed.json) | strings section bowed sustained spaghetti-western tremolo-bed harmony | Sustained bowed strings with a real violin body notch. The settled held chord a piece can sit on for eight bars. |
| [`pad/string-tremolo`](./pad/string-tremolo.json) | strings section bowed tremolando shimmer tension spaghetti-western | Re-bowed shimmer at 7.5 strokes a second. The bar before something happens — string-bed for when it must not settle. |

## bass

The low end. Owns everything under the guitars; defines the groove with the kick.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`bass/cello-arco`](./bass/cello-arco.json) | cello bass bowed arco chamber cinematic acoustic solemn | Bowed low strings, the one bass that sustains. Chamber and funeral lines that sing rather than walk; too slow to articulate sixteenths. |
| [`bass/jones-jazz`](./bass/jones-jazz.json) | bass fingerstyle smooth round jazz-bass 60s rock | Clean fingered Jazz Bass on flatwounds — smooth, round, no grit. The 60s/70s rock low end when fuzz would be the wrong record. |
| [`bass/machine-fuzz`](./bass/machine-fuzz.json) | bass fuzz garage dance-punk riff | Bass through a guitar rig, doing the whole guitar section's job. Garage and dance-punk, where the riff is the bass. |
| [`bass/moog-sub`](./bass/moog-sub.json) | bass sub synth house techno trap electronic round | Machine sub, resonant ladder filter and no body at all. The house/techno/trap low end, and the only bass safe at fast tempos. |
| [`bass/saw-round`](./bass/saw-round.json) **default** | round neutral lo-fi | Plain sawtooth, soft attack, sits under everything without arguing. The neutral default — reach past it when the genre wants character. |
| [`bass/tuba-oompah`](./bass/tuba-oompah.json) | tuba brass bass breath folk klezmer marching acoustic | Brass bass played by a lung: the note arrives late and stops dead. Oompah, klezmer, marching and village-band low end. |
| [`bass/upright-pizz`](./bass/upright-pizz.json) | bass upright double-bass pizzicato gut spaghetti-western acoustic | Plucked double bass, gut and air, no amp. The low end for acoustic and western cues where an electric bass is the wrong century. |

## pluck

Rhythm guitar: tight, fast-decaying, wide, low in the mix.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`pluck/archtop-comp`](./pluck/archtop-comp.json) | guitar archtop hollow-body jazz flatwound comping lofi clean | Hollow-body archtop on flatwounds: triangle-soft, no top end, no grit. Jazz and lo-fi comping behind a soloist. |
| [`pluck/brown-rhythm`](./pluck/brown-rhythm.json) **default** | guitar rhythm chug brown-sound | Two detuned saws into a mid-forward rig with the lows kept out of the drive. The default chug: low, wide, under the lead. |
| [`pluck/chainsaw-chug`](./pluck/chainsaw-chug.json) | guitar rhythm chug fuzz chainsaw | Square oscillators with the low strings let into the drive. The rhythm half of the chainsaw rig, under lead/doom-fuzz. |
| [`pluck/mandolin-tremolo`](./pluck/mandolin-tremolo.json) | mandolin tremolo folk bluegrass celtic italian acoustic shimmer | Mandolin on a fast tremolo, a plucked voice that can hold a note. Folk, bluegrass and Celtic, where string-tremolo is too big. |
| [`pluck/nylon-arpeggio`](./pluck/nylon-arpeggio.json) | guitar nylon classical spanish spaghetti-western arpeggio fingerstyle | Nylon-string classical guitar, no amp. The fingerpicked arpeggio bed for a western or Spanish cue while the twang rests. |
| [`pluck/sitar-jawari`](./pluck/sitar-jawari.json) | sitar plucked buzz drone raga indian | A plucked string whose brightness never collapses — jawari buzz, no amp. Drone and raga colour, unlike any guitar here. |
| [`pluck/steel-strum`](./pluck/steel-strum.json) | guitar steel-string acoustic dreadnought folk strum country flatpick | Steel-string dreadnought strummed: rings twice as long as the nylon, with the bridge hill it lacks. Folk, country, singer-songwriter. |
| [`pluck/synth-arp`](./pluck/synth-arp.json) | synth arp sequenced house techno electronic sixteenths acid | Sequenced arp, amp deleted: 80 ms release keeps sixteenths separate, Q4 resonance sings over each step. House and techno. |

## lead

Top line guitar: compressed into sustain, mid-forward, centred, loud.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`lead/analog-square`](./lead/analog-square.json) | synth lead square analog acid house techno electronic | Square synth lead with no body, breath or vibrato at all. The machine top line for the club kits; every other lead is a player in a room. |
| [`lead/brown-lead`](./lead/brown-lead.json) **default** | guitar lead sustain brown-sound | Compressed brown-sound solo tone: held notes sing instead of decaying, mid-forward and centred. The default rock lead. |
| [`lead/deguello-trumpet`](./lead/deguello-trumpet.json) | trumpet brass mariachi spaghetti-western solo blare | Lone mariachi trumpet that gets brighter as it gets louder. The funeral-march top line over a western cue. |
| [`lead/desert-twang`](./lead/desert-twang.json) | guitar lead twang surf spaghetti-western clean slapback | Bright clean single-coil twang drowning in slapback. The hard-picked surf/western hook — brown-lead inverted. |
| [`lead/doom-fuzz`](./lead/doom-fuzz.json) | guitar lead fuzz doom sustain | Chainsaw fuzz where one note reads as a power chord. Doom and stoner leads; sits over pluck/chainsaw-chug. |
| [`lead/harmonica-reed`](./lead/harmonica-reed.json) | harmonica harp reed spaghetti-western wail dust | Wailing cupped harmonica, rasp under 3 kHz. One held note over an empty station — the western that answers a man. |
| [`lead/lone-whistle`](./lead/lone-whistle.json) | whistle human spaghetti-western lonely solo sine | A man whistling the tune — near-pure sine, no instrument at all. The loneliest top line in the palette. |
| [`lead/lord-organ`](./lead/lord-organ.json) | organ hammond drawbar leslie hard-rock overdrive 70s | Tonewheel organ through a cranked Marshall — Jon Lord. Distorted, stereo Leslie, loud enough to solo; drawbar-organ is the clean bed. |
| [`lead/soprano-wordless`](./lead/soprano-wordless.json) | voice soprano wordless spaghetti-western ecstasy soaring | Soaring wordless soprano built on formants. The line that turns a western cue into ecstasy; nothing goes above it. |
| [`lead/string-section`](./lead/string-section.json) | strings violins section bowed unison spaghetti-western tutti | Six violins taking the tune in unison — the tutti line when a cue stops being a whistle and becomes a film. Expensive. |
| [`lead/violin-arco`](./lead/violin-arco.json) | violin strings bowed arco solo singing | Solo bowed violin, no amp, sustain from the bow rather than a compressor. The singing top line when a guitar would be wrong. |
| [`lead/wood-flute`](./lead/wood-flute.json) | flute wind wooden breath folk pastoral acoustic | Whistle purity with a chest at 520 Hz and loud wide air. The pastoral wind top line — two hands, unlike the harmonica or the whistle. |

## drums

The kit — levels, tuning and decay per piece.

| voice | tags | when to pick it |
| --- | --- | --- |
| [`drums/brush-kit`](./drums/brush-kit.json) | kit brushes jazz blues lofi quiet ride cross-stick | Brushes and cross-stick, ride louder than the kick. The quiet kit for jazz, blues and downtime — where a struck snare would read as combat. |
| [`drums/club-kit`](./drums/club-kit.json) | kit house techno disco garage four-on-the-floor electronic offbeat | Four-to-the-floor: short clicky kick, loud offbeat open hat, clap on 2 and 4. House, techno and disco, where 808 boom would be mud. |
| [`drums/frontier-kit`](./drums/frontier-kit.json) | kit western spaghetti-western gunshot whipcrack anvil timpani | Spaghetti-western percussion, barely a kit: snare is a gunshot, hat a whipcrack, tom an anvil. Picked for the setting, not the groove. |
| [`drums/house-kit`](./drums/house-kit.json) **default** | kit neutral lo-fi | Pitched membrane thumps plus filtered noise bursts, levels baked in. The neutral kit for anything not chasing a specific record. |
| [`drums/machine-808`](./drums/machine-808.json) | kit 808 machine trap hiphop electronic boom clap | Drum machine, not a room: a one-second pitched kick that carries the bass line, clap over snare. Trap and hiphop. |
| [`drums/slab-kit`](./drums/slab-kit.json) | kit rock metal backbeat room ride | Rock backbeat kit — short clicky kick, cracking snare, a ride that stays countable under distortion. When the drums carry the groove. |
| [`drums/taiko-kit`](./drums/taiko-kit.json) | kit orchestral taiko timpani gran-cassa cinematic epic battle | Orchestral percussion: gran cassa, tuned taiko toms louder than the snare, tam-tam, and no hi-hat to speak of. Cinematic and battle. |

## Lineage

Who was forked from whom. Read the parent's `notes` before forking a child.

```
piano/soft-triangle
  piano/felt-hammer
    piano/salon-grand
      piano/salon-unison
  piano/music-box
epiano/fm-rhodes
  epiano/clav-comb
    epiano/drawbar-organ
  epiano/wurlitzer-reed
pad/sine-halo
  pad/mens-choir
    pad/string-bed
      pad/string-tremolo
bass/saw-round
  bass/machine-fuzz
    bass/jones-jazz
      bass/upright-pizz
        bass/cello-arco
        bass/tuba-oompah
  bass/moog-sub
pluck/brown-rhythm
  pluck/chainsaw-chug
  pluck/nylon-arpeggio
    pluck/archtop-comp
    pluck/mandolin-tremolo
    pluck/steel-strum
  pluck/sitar-jawari
  pluck/synth-arp
lead/brown-lead
  lead/desert-twang
  lead/doom-fuzz
  lead/lord-organ
  lead/violin-arco
    lead/deguello-trumpet
    lead/harmonica-reed
    lead/lone-whistle
      lead/analog-square
      lead/wood-flute
    lead/soprano-wordless
    lead/string-section
drums/house-kit
  drums/brush-kit
  drums/club-kit
  drums/frontier-kit
  drums/machine-808
  drums/slab-kit
  drums/taiko-kit
```
