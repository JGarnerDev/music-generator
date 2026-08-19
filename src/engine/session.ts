/**
 * Session plans: an ordered list of cues to play at the table.
 *
 * A composition is a piece of music; a **session plan** is the running order for
 * one night of a campaign — "tavern loop while they arrive, ambush sting when
 * the door opens, aftermath when it's over". It holds no music of its own, only
 * pointers into the library (`<kind>/<slug>` ids) plus the one thing the library
 * cannot know: *when you intend to press play*.
 *
 * Pure: no fs, no DOM, no audio. The dev server reads and writes the JSON (see
 * [`src/dev/session-store`](../dev/session-store.ts)), the page renders it (see
 * [`src/app/session-view`](../app/session-view.ts)), and every rule about what a
 * plan may contain and what state a cue is in lives here.
 *
 * See [`docs/sessions.md`](../../docs/sessions.md).
 */
import type { ValidationIssue } from "./composition";
import type { LibraryEntry } from "./library";
import { audioName, type ManifestEntry } from "./manifest";

/** Where session plans live, repo-relative. One `.json` per session. */
export const SESSIONS_DIR = "sessions";

export interface SessionCue {
  /** Library id of the piece to play, `<kind>/<slug>`. */
  entry: string;
  /** What it is for, in your words: "when the door opens". Shown beside the cue. */
  note?: string;
  /**
   * Repeat forever instead of playing once. Absent = the piece decides: anything
   * with a `loop` window was written to sit under a scene, so it loops.
   */
  loop?: boolean;
}

export interface SessionPlan {
  /** Slug — the filename under `sessions/`, without `.json`. */
  name: string;
  /** Human title for the header: "Session 14 — The Ambush at Redwater". */
  title?: string;
  /** Campaign slug, matching compositions' `campaign` field. Filters the archive tab. */
  campaign?: string;
  /** The running order. Duplicates are allowed — a theme may recur in one night. */
  cues: SessionCue[];
}

/** A blank plan for `name`, ready to have cues pushed into it. */
export function emptySession(name: string, campaign?: string): SessionPlan {
  return { name: sessionSlug(name), ...(campaign ? { campaign } : {}), cues: [] };
}

/**
 * Filename-safe slug for a session name. Sessions are named by hand ("Session 14
 * — the ambush"), and that string becomes a path, so it is squeezed down to
 * lowercase words joined by hyphens before it ever reaches the filesystem.
 */
export function sessionSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Structural validation for a plan parsed from untrusted JSON — same contract as
 * `validateComposition`: a list of issues, empty meaning valid. Cue entry ids are
 * *not* checked against the library here; a plan that names a piece you have not
 * written yet is valid and shows up as a missing cue, which is exactly what you
 * want when the plan is written before the music.
 */
export function validateSessionPlan(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (typeof input !== "object" || input === null) {
    push("$", "session plan must be an object");
    return issues;
  }
  const plan = input as Record<string, unknown>;

  if (typeof plan.name !== "string" || sessionSlug(plan.name) === "") {
    push("name", "must be a non-empty slug");
  }
  for (const field of ["title", "campaign"] as const) {
    if (plan[field] !== undefined && (typeof plan[field] !== "string" || String(plan[field]).trim() === "")) {
      push(field, "must be a non-empty string");
    }
  }

  if (!Array.isArray(plan.cues)) {
    push("cues", "must be an array");
    return issues;
  }
  plan.cues.forEach((cue, i) => {
    const at = `cues[${i}]`;
    if (typeof cue !== "object" || cue === null) {
      push(at, "must be an object");
      return;
    }
    const c = cue as Record<string, unknown>;
    if (typeof c.entry !== "string" || c.entry.trim() === "") {
      push(`${at}.entry`, "must be a library id, e.g. \"loops/tavern-raid\"");
    }
    if (c.note !== undefined && typeof c.note !== "string") {
      push(`${at}.note`, "must be a string");
    }
    if (c.loop !== undefined && typeof c.loop !== "boolean") {
      push(`${at}.loop`, "must be a boolean");
    }
  });

  return issues;
}

/** Keep only the well-formed plans in a list from disk, sorted by name. */
export function parseSessions(input: unknown): SessionPlan[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((plan) => validateSessionPlan(plan).length === 0)
    .map((plan) => plan as SessionPlan)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Serialise a plan for `sessions/<name>.json` — stable field order, trailing newline. */
export function renderSessionPlan(plan: SessionPlan): string {
  const ordered = {
    name: plan.name,
    ...(plan.title ? { title: plan.title } : {}),
    ...(plan.campaign ? { campaign: plan.campaign } : {}),
    cues: plan.cues.map((cue) => ({
      entry: cue.entry,
      ...(cue.note ? { note: cue.note } : {}),
      ...(cue.loop === undefined ? {} : { loop: cue.loop }),
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

// ── Editing ────────────────────────────────────────────────────────────────
// Every edit returns a new plan rather than mutating: the page re-renders from
// the plan it is handed, so "changed" has to be a different object.

export function addCue(plan: SessionPlan, entryId: string, note?: string): SessionPlan {
  const cue: SessionCue = { entry: entryId, ...(note ? { note } : {}) };
  return { ...plan, cues: [...plan.cues, cue] };
}

export function removeCue(plan: SessionPlan, index: number): SessionPlan {
  if (index < 0 || index >= plan.cues.length) return plan;
  return { ...plan, cues: plan.cues.filter((_, i) => i !== index) };
}

/**
 * Move a cue `delta` places. Clamped rather than wrapped: dragging the top cue
 * up should do nothing, not teleport it to the end of the night.
 */
export function moveCue(plan: SessionPlan, index: number, delta: number): SessionPlan {
  const target = index + delta;
  if (index < 0 || index >= plan.cues.length) return plan;
  if (target < 0 || target >= plan.cues.length) return plan;
  const cues = [...plan.cues];
  const [cue] = cues.splice(index, 1) as [SessionCue];
  cues.splice(target, 0, cue);
  return { ...plan, cues };
}

/** Set (or, with an empty string, clear) a cue's note. */
export function setCueNote(plan: SessionPlan, index: number, note: string): SessionPlan {
  return patchCue(plan, index, (cue) => {
    const trimmed = note.trim();
    const { note: _dropped, ...rest } = cue;
    return trimmed === "" ? rest : { ...rest, note: trimmed };
  });
}

/** Force a cue to loop or not; `undefined` hands the decision back to the piece. */
export function setCueLoop(plan: SessionPlan, index: number, loop: boolean | undefined): SessionPlan {
  return patchCue(plan, index, (cue) => {
    const { loop: _dropped, ...rest } = cue;
    return loop === undefined ? rest : { ...rest, loop };
  });
}

function patchCue(
  plan: SessionPlan,
  index: number,
  patch: (cue: SessionCue) => SessionCue,
): SessionPlan {
  if (index < 0 || index >= plan.cues.length) return plan;
  return { ...plan, cues: plan.cues.map((cue, i) => (i === index ? patch(cue) : cue)) };
}

// ── Resolving against the library + what has been rendered ─────────────────

/**
 * `ready` — press play. `missing-piece` — the plan names a composition that is
 * not in `compositions/`. `missing-audio` — the piece exists but nobody rendered
 * it, so it is silent.
 *
 * Both failures are worth showing *before* the game rather than discovering with
 * six people waiting: a cue that cannot sound is the one thing a session page
 * must never hide.
 */
export type CueStatus = "ready" | "missing-piece" | "missing-audio";

export interface ResolvedCue {
  index: number;
  cue: SessionCue;
  entry: LibraryEntry | null;
  /** Manifest row for the flavour that will actually play (loop body or full take). */
  audio: ManifestEntry | null;
  /** Whether this cue repeats when played. */
  loop: boolean;
  status: CueStatus;
  /** Display name: the composition's own name, falling back to the id in the plan. */
  label: string;
  /** What to do about a non-`ready` status, phrased as the command that fixes it. */
  hint: string;
}

/** Whether a cue repeats: its own override, else "it was written with a loop window". */
export function cueLoops(cue: SessionCue, entry: LibraryEntry | null): boolean {
  if (cue.loop !== undefined) return cue.loop && !!entry?.composition.loop;
  return !!entry?.composition.loop;
}

/** Resolve every cue in the plan against the library and the render manifest. */
export function resolveCues(
  plan: SessionPlan,
  entries: readonly LibraryEntry[],
  rendered: ReadonlyMap<string, ManifestEntry>,
): ResolvedCue[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return plan.cues.map((cue, index) => {
    const entry = byId.get(cue.entry) ?? null;
    const loop = cueLoops(cue, entry);
    const audio = entry ? rendered.get(audioName(entry.composition.name, { loop })) ?? null : null;
    const status: CueStatus = !entry ? "missing-piece" : !audio ? "missing-audio" : "ready";
    return {
      index,
      cue,
      entry,
      audio,
      loop,
      status,
      label: entry?.composition.name ?? cue.entry,
      hint:
        status === "missing-piece"
          ? `No ${cue.entry} in compositions/ — was it renamed or trashed?`
          : status === "missing-audio"
            ? `Not rendered: npm run render -- --file ${entry?.path ?? cue.entry}`
            : "",
    } satisfies ResolvedCue;
  });
}

/** Cues that cannot sound — the pre-flight check the page runs on load. */
export function unplayableCues(resolved: readonly ResolvedCue[]): ResolvedCue[] {
  return resolved.filter((cue) => cue.status !== "ready");
}

// ── Campaigns ──────────────────────────────────────────────────────────────

/** The campaign a piece is filed under, or null when it belongs to none. */
export function campaignOf(entry: LibraryEntry): string | null {
  const campaign = entry.composition.campaign?.trim();
  return campaign ? campaign : null;
}

/** Every campaign present in the library, sorted — the archive tab's shelf list. */
export function campaignsOf(entries: readonly LibraryEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const campaign = campaignOf(entry);
    if (campaign) seen.add(campaign);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Library entries for one campaign, or all of them when `campaign` is null. */
export function entriesOfCampaign(
  entries: readonly LibraryEntry[],
  campaign: string | null,
): LibraryEntry[] {
  return campaign === null ? [...entries] : entries.filter((e) => campaignOf(e) === campaign);
}
