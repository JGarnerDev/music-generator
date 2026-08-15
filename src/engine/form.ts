/**
 * Form — what happens, in what order, before any note is written.
 *
 * The composer used to state a progression, state it again arranged up, and land
 * on a tonic. That is a *form* in the sense that it has a shape, but it is not an
 * arrangement: the second half differed from the first only in staging (an arp
 * appeared, the kit hit harder, the motif inverted) while the harmony underneath
 * was bar-for-bar identical. Repetition with a change in dynamics is a verse
 * played twice. Repetition with a change in **harmony** is a piece.
 *
 * So the layout is decided here, as data, before the parts are built:
 *
 * - `sample` — the fast path. A, then A restated. A few bars to check in with,
 *   which is this repo's first principle: make the moving core, then iterate.
 * - `song` — intro, A, **B**, A again. B is a different progression, not the
 *   same one louder, which is the whole point of the section existing.
 *
 * Every section carries what the composer needs to know about it, so rendering a
 * form is a loop rather than a set of special cases keyed off bar numbers.
 *
 * Pure and deterministic → unit tested.
 */
import { progressionChords, progressionsInIdiom } from "./theory";
import { pick, type Rng } from "@utils/random";

/** What a section is doing in the piece. */
export type SectionRole = "intro" | "A" | "B" | "restate";

/** The two shapes a compose call can ask for. */
export const FORM_NAMES = ["sample", "song"] as const;
export type FormName = (typeof FORM_NAMES)[number];

export function isFormName(value: unknown): value is FormName {
  return typeof value === "string" && (FORM_NAMES as readonly string[]).includes(value);
}

export interface FormSection {
  role: SectionRole;
  /** Chord symbol per bar. */
  chords: string[];
  /** First bar of the section on the piece's timeline. */
  startBar: number;
  /** Scales the kit and the parts here — an intro is not a chorus. */
  intensity: number;
  /** Whether the written top line plays over this section. */
  melody: boolean;
  /** Whether the section inverts the motif rather than stating it. */
  invert: boolean;
  /** Whether the broken-chord layer plays here. */
  arp: boolean;
  /** Which of the knobs' figures the bass plays. */
  figure: 0 | 1;
}

export interface FormOptions {
  /** Which shape to build. */
  form: FormName;
  /** Candidate roman-numeral progressions, from the blend. */
  progressions: string[][];
  tonic: string;
  scale: string;
  rng: Rng;
}

/**
 * Lay the piece out. The returned sections are contiguous from bar 0; the
 * caller adds the single resolution bar that follows the last one.
 */
export function buildForm(opts: FormOptions): FormSection[] {
  const { form, progressions, tonic, scale, rng } = opts;
  const candidates = progressionsInIdiom(progressions, scale);
  const primary = pick(rng, candidates);
  const a = progressionChords(tonic, primary, scale);

  if (form === "sample") {
    return place([
      section("A", a, { intensity: 0.85, melody: true, invert: false, arp: false, figure: 0 }),
      section("restate", a, { intensity: 1, melody: true, invert: true, arp: true, figure: 1 }),
    ]);
  }

  // The intro is the first half of A with nothing on top: the harmony arrives
  // before the tune does, so the tune has something to arrive *over*. Half a
  // phrase rather than a whole one, because an intro as long as the verse is a
  // verse.
  const intro = a.slice(0, Math.max(1, Math.floor(a.length / 2)));
  const b = progressionChords(tonic, contrastProgression(candidates, primary, rng), scale);

  return place([
    section("intro", intro, { intensity: 0.55, melody: false, invert: false, arp: false, figure: 0 }),
    section("A", a, { intensity: 0.85, melody: true, invert: false, arp: false, figure: 0 }),
    section("B", b, { intensity: 0.95, melody: true, invert: true, arp: true, figure: 1 }),
    section("restate", a, { intensity: 1, melody: true, invert: false, arp: true, figure: 0 }),
  ]);
}

/**
 * A progression for B that isn't A's.
 *
 * Preference is a genuinely different one from the palette's own vocabulary —
 * that is what the list is *for*, and a genre's second progression is a thing
 * its authors chose. Only when the palette offers exactly one does this rotate
 * it, starting the phrase on a later degree so the same four chords arrive in a
 * different order and land somewhere else. A rotation is a weaker contrast than
 * a real second progression, which is a reason to give a palette two.
 */
export function contrastProgression(
  candidates: string[][],
  primary: string[],
  rng: Rng,
): string[] {
  const others = candidates.filter((p) => p.join() !== primary.join());
  if (others.length > 0) return pick(rng, others);
  if (primary.length < 2) return primary;
  // Rotate by something that isn't a whole cycle and isn't zero. Half way round
  // for an even phrase, one short of it otherwise.
  const by = Math.max(1, Math.floor(primary.length / 2));
  return [...primary.slice(by), ...primary.slice(0, by)];
}

function section(
  role: SectionRole,
  chords: string[],
  rest: Omit<FormSection, "role" | "chords" | "startBar">,
): Omit<FormSection, "startBar"> {
  return { role, chords, ...rest };
}

/** Lay sections end to end, numbering their bars. */
function place(sections: Omit<FormSection, "startBar">[]): FormSection[] {
  let bar = 0;
  return sections.map((s) => {
    const placed = { ...s, startBar: bar };
    bar += s.chords.length;
    return placed;
  });
}

/** Total bars of a form, not counting the resolution bar that follows it. */
export function formBars(sections: readonly FormSection[]): number {
  return sections.reduce((n, s) => n + s.chords.length, 0);
}
