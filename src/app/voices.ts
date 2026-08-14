/**
 * The voice registry, browser side: every preset under `voices/`, bundled by
 * Vite, resolved to the one a track should play.
 *
 * Globbed rather than imported one by one so adding `voices/lead/molten.json`
 * makes that voice playable after a reload, with nothing to register — the same
 * trick the composition library uses. The organising rules (folder = instrument,
 * how a default is chosen) are pure and tested in
 * [`@engine/voice-library`](../engine/voice-library.ts); this module is only the
 * wiring that hands them Vite's glob record.
 */
import type { InstrumentName } from "@engine/composition";
import { buildVoiceLibrary, resolveVoice, type VoiceEntry } from "@engine/voice-library";
import type { VoicePreset } from "@engine/voice";

const bundled = import.meta.glob<unknown>("../../voices/**/*.json", {
  eager: true,
  import: "default",
});

/** Every voice on disk, valid or not — invalid ones carry their issues. */
export const VOICE_LIBRARY: VoiceEntry[] = buildVoiceLibrary(bundled);

/**
 * The preset a track plays: the voice it names, else the instrument's default.
 *
 * Throws rather than substituting a built-in when nothing resolves. A wrong
 * sound that renders anyway is the expensive failure here — you find it after
 * twelve minutes of rendering, by ear, and then have to work out which of seven
 * tracks it was.
 */
export function voiceFor(instrument: InstrumentName, slug?: string): VoicePreset {
  const entry = resolveVoice(VOICE_LIBRARY, instrument, slug);
  if (entry) return entry.preset;

  const named = slug ? `voice "${slug}" for ${instrument}` : `default voice for ${instrument}`;
  const available = VOICE_LIBRARY.filter((e) => e.instrument === instrument);
  const detail =
    available.length === 0
      ? `nothing in voices/${instrument}/ yet`
      : `available: ${available.map((e) => (e.issues.length ? `${e.slug} (invalid)` : e.slug)).join(", ")}`;
  throw new Error(`No ${named} — ${detail}.`);
}
