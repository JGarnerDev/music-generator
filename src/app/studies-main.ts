/**
 * The studies bench (`/studies.html`): hear an attempt at a musical concept and
 * say whether we should write music like that.
 *
 * The composition bench asks "is this piece good" and the voice bench asks "is
 * this sound good". This one asks the question neither can — *how should a
 * guitar solo go at all* — and the answer accumulates into `studies/ledger.md`,
 * which is the evidence `docs/taste.md` is written from.
 *
 * Two things shape the layout. **The set is the unit**: an attempt's thumb only
 * means something against its siblings, which differ from it on exactly one
 * axis, so they sit in a strip under the selection and are one click away.
 * **The tag shelf is fixed**: a free-text reason appears once and can never be
 * counted, whereas `cluttered` said five times is a preference — so the chips
 * are the primary input and the note is the overflow.
 *
 * It plays files like everything else here: `npm run study:render` writes them.
 */
import { indexManifest } from "@engine/manifest";
import {
  CONCEPT_GROUPS,
  GROUP_BLURBS,
  countsByGroup,
  searchStudies,
  setsOf,
  studiesOfGroup,
  studyAudioName,
  type StudyEntry,
} from "@engine/study-library";
import {
  TAG_FACETS,
  conceptOf,
  tagsOfFacet,
  type ConceptGroup,
  type Thumb,
} from "@engine/study";
import { STUDY_VERDICT_ENDPOINT } from "../dev/endpoints";
import { STUDY_LIBRARY } from "./studies";
import { pausePlayback, playFile, playbackState, resumePlayback, stopPlayback } from "./playback";

// What `npm run study:render` produced. Fetched rather than imported because it
// sits in `public/` beside the audio it describes.
const rendered = fetch("/audio/studies/manifest.json")
  .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
  .then(indexManifest)
  .catch(() => indexManifest(null));

const els = {
  tabs: document.querySelector<HTMLElement>("#tabs")!,
  blurb: document.querySelector<HTMLElement>("#blurb")!,
  rows: document.querySelector<HTMLElement>("#rows")!,
  empty: document.querySelector<HTMLElement>("#empty")!,
  unjudgedOnly: document.querySelector<HTMLInputElement>("#unjudgedOnly")!,
  loop: document.querySelector<HTMLInputElement>("#loop")!,
  search: document.querySelector<HTMLInputElement>("#search")!,
  selected: document.querySelector<HTMLElement>("#selected")!,
  approach: document.querySelector<HTMLElement>("#approach")!,
  set: document.querySelector<HTMLElement>("#set")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  pause: document.querySelector<HTMLButtonElement>("#pause")!,
  stop: document.querySelector<HTMLButtonElement>("#stop")!,
  tags: document.querySelector<HTMLElement>("#tags")!,
  note: document.querySelector<HTMLTextAreaElement>("#note")!,
  up: document.querySelector<HTMLButtonElement>("#up")!,
  down: document.querySelector<HTMLButtonElement>("#down")!,
  clear: document.querySelector<HTMLButtonElement>("#clear")!,
  status: document.querySelector<HTMLElement>("#status")!,
};

/** Verdicts write files; there is no dev server in a built bundle. */
const canJudge = import.meta.env.DEV;

interface State {
  entries: StudyEntry[];
  group: ConceptGroup | null;
  unjudgedOnly: boolean;
  query: string;
  selectedId: string | null;
  /** Tags armed for the *current* selection, cleared whenever it changes. */
  picked: Set<string>;
}

const state: State = {
  entries: STUDY_LIBRARY,
  group: null,
  unjudgedOnly: true,
  query: "",
  selectedId: null,
  picked: new Set(),
};

function setStatus(message: string): void {
  els.status.textContent = message;
}

function selected(): StudyEntry | null {
  return state.entries.find((entry) => entry.id === state.selectedId) ?? null;
}

/**
 * The rows on screen. `unjudgedOnly` deliberately keeps the *selected* study
 * visible even once it has been judged — otherwise thumbing something makes it
 * vanish from under the cursor, and the next thing you want is almost always to
 * compare it against the sibling you just heard.
 */
function visible(): StudyEntry[] {
  const inGroup = searchStudies(studiesOfGroup(state.entries, state.group), state.query);
  if (!state.unjudgedOnly) return inGroup;
  return inGroup.filter((entry) => !entry.study.verdict || entry.id === state.selectedId);
}

function draw(): void {
  drawTabs();
  els.blurb.textContent = state.group
    ? GROUP_BLURBS[state.group]
    : "Every attempt under studies/. Pick a group to work through one kind of question.";
  drawRows();
  drawSelection();
}

function drawTabs(): void {
  const counts = countsByGroup(state.entries);
  els.tabs.replaceChildren(
    tab("All", state.entries.length, state.group === null, () => pickGroup(null)),
    ...CONCEPT_GROUPS.map((group) =>
      tab(group, counts[group], state.group === group, () => pickGroup(group)),
    ),
  );
}

function pickGroup(group: ConceptGroup | null): void {
  state.group = group;
  draw();
}

function tab(label: string, count: number, isSelected: boolean, onClick: () => void): HTMLElement {
  const button = document.createElement("button");
  button.className = "tab";
  button.type = "button";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(isSelected));
  button.append(label, span("count", `${count}`));
  button.addEventListener("click", onClick);
  return button;
}

function drawRows(): void {
  const rows = visible();
  els.rows.replaceChildren(...rows.map(row));
  els.empty.hidden = rows.length > 0;
  els.empty.textContent = emptyMessage();
}

function emptyMessage(): string {
  if (state.query.trim() !== "") return `Nothing matches “${state.query.trim()}”.`;
  if (state.unjudgedOnly && state.entries.length > 0) {
    return "Everything here has a verdict. Untick “unjudged only” to revisit them.";
  }
  return 'No studies yet. Fan out a set: npm run study:new -- --concept <slug> --axis <axis> --mood "<scene>"';
}

function row(entry: StudyEntry): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.setAttribute("aria-selected", String(entry.id === state.selectedId));
  tr.title = entry.path.replace(/^.*studies\//, "studies/");
  tr.addEventListener("click", () => select(entry));

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "icon";
  playButton.textContent = "▶";
  playButton.title = `Play ${entry.id}`;
  playButton.addEventListener("click", (event) => {
    event.stopPropagation();
    select(entry);
    void play();
  });

  const variant = cell(
    "cell-variant",
    span("axis", `${entry.study.axis ?? "?"} ·`),
    entry.study.variant ?? "",
  );
  variant.title = entry.study.approach ?? "";

  tr.append(
    cell("cell-play", playButton),
    cell(
      "cell-name",
      `${entry.study.set ?? "?"}/${entry.slug.split("-").at(-1) ?? entry.slug}`,
      span("concept", entry.concept),
    ),
    variant,
    cell("cell-verdict", verdictChip(entry)),
  );
  return tr;
}

function verdictChip(entry: StudyEntry): HTMLElement {
  if (entry.issues.length > 0) return span("chip broken", "broken");
  if (entry.study.draft) return span("chip draft", "draft");
  const verdict = entry.study.verdict;
  if (!verdict) return span("chip", "—");
  return span(`chip ${verdict.thumb}`, verdict.thumb === "up" ? "👍" : "👎");
}

/**
 * The study to open on, given the filters.
 *
 * Falls back past `visible()` to the whole library, because "unjudged only" is
 * on by default and a session where everything has already been judged would
 * otherwise open on nothing — no selection, no transport, and a status line
 * claiming there are no studies at all.
 */
function firstSelectable(): StudyEntry | null {
  return visible()[0] ?? state.entries.find((entry) => entry.issues.length === 0) ?? null;
}

/** Keep something selected whenever the filters leave rows on screen. */
function ensureSelection(): void {
  if (selected() && visible().some((entry) => entry.id === state.selectedId)) return;
  const next = visible()[0];
  if (next) select(next);
}

function select(entry: StudyEntry): void {
  if (entry.id === state.selectedId) return;
  state.selectedId = entry.id;
  // Tags and note belong to one attempt. Carrying them to the next would
  // silently attribute a reason to a study it was never said about.
  state.picked = new Set(entry.study.verdict?.tags ?? []);
  els.note.value = entry.study.verdict?.note ?? "";
  draw();
}

function drawSelection(): void {
  const entry = selected();
  if (!entry) {
    els.selected.textContent = "No study selected.";
    els.approach.textContent = "";
    els.set.replaceChildren();
    for (const button of [els.play, els.up, els.down, els.clear]) button.disabled = true;
    drawTags();
    return;
  }

  const study = entry.study;
  const concept = conceptOf(entry.concept);
  const broken = entry.issues.length > 0;
  els.selected.textContent = `${study.title ?? entry.id} — ${entry.id}`;
  els.approach.textContent = broken
    ? entry.issues.map((issue) => `${issue.path} ${issue.message}`).join(" · ")
    : [
        study.approach ?? "",
        `held: ${study.held ?? "—"}${study.mood ? ` · from “${study.mood}”` : ""}` +
          `${concept ? ` · ${concept.title}` : ""}`,
      ].join("\n");

  drawSet(entry);
  drawTags();

  const judgeable = canJudge && !broken && !study.draft;
  els.play.disabled = broken || !!study.draft;
  els.up.disabled = !judgeable;
  els.down.disabled = !judgeable;
  els.clear.disabled = !judgeable || !study.verdict;
  els.note.disabled = !judgeable;
}

/**
 * The rest of the set — the attempts this one is actually being compared with.
 *
 * Drawn from the whole library rather than from `visible()`, because "unjudged
 * only" would otherwise hide exactly the sibling you want to A/B against.
 */
function drawSet(entry: StudyEntry): void {
  const key = `${entry.concept}/${entry.study.set ?? entry.slug}`;
  const siblings = setsOf(state.entries).get(key) ?? [entry];
  const nodes: (Node | string)[] = [span("label", `set ${entry.study.set ?? "—"}:`)];
  for (const sibling of siblings) {
    const button = document.createElement("button");
    const thumb = sibling.study.verdict?.thumb;
    button.type = "button";
    button.className = `sib${thumb ? ` ${thumb}` : ""}`;
    button.setAttribute("aria-current", String(sibling.id === entry.id));
    button.textContent =
      `${sibling.study.variant ?? sibling.slug}` +
      `${thumb ? (thumb === "up" ? " 👍" : " 👎") : ""}`;
    button.title = sibling.study.approach ?? sibling.id;
    button.addEventListener("click", () => select(sibling));
    nodes.push(button);
  }
  els.set.replaceChildren(...nodes);
}

/** The tag shelf, grouped by facet. Pressed state is this selection's tags. */
function drawTags(): void {
  const disabled = els.up.disabled;
  els.tags.replaceChildren(
    ...TAG_FACETS.map((facet) => {
      const rowEl = document.createElement("div");
      rowEl.className = "facet";
      rowEl.append(span("facet-name", facet));
      for (const tag of tagsOfFacet(facet)) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tagchip";
        chip.textContent = tag.name;
        chip.title = tag.blurb;
        chip.disabled = disabled;
        chip.setAttribute("aria-pressed", String(state.picked.has(tag.name)));
        chip.addEventListener("click", () => {
          if (state.picked.has(tag.name)) state.picked.delete(tag.name);
          else state.picked.add(tag.name);
          drawTags();
        });
        rowEl.append(chip);
      }
      return rowEl;
    }),
  );
}

async function play(): Promise<void> {
  const entry = selected();
  if (!entry) return;
  const name = studyAudioName(entry.concept, entry.slug);
  const audio = (await rendered).get(name);
  if (!audio) {
    setStatus(`No audio for ${entry.id}. Run: npm run study:render -- --study ${entry.id}`);
    return;
  }

  els.play.disabled = true;
  try {
    await playFile(`/audio/studies/${audio.file}`, {
      loop: els.loop.checked,
      onEnded: () => {
        setStatus("Finished.");
        drawTransport();
      },
    });
    setStatus(
      `Playing ${entry.id} — ${audio.seconds.toFixed(0)}s, ` +
        `rendered ${new Date(audio.renderedAt).toLocaleDateString()}. ` +
        `Edited it since? npm run study:render -- --study ${entry.id} --force`,
    );
  } catch (err) {
    setStatus(`Could not play ${entry.id}: ${(err as Error).message}`);
  } finally {
    els.play.disabled = false;
    drawTransport();
  }
}

/** The pause button is the only control whose label depends on what is happening. */
function drawTransport(): void {
  const playing = playbackState();
  els.pause.textContent = playing === "paused" ? "▶ Resume" : "⏸ Pause";
  els.pause.disabled = playing === "stopped";
}

async function judge(thumb: Thumb): Promise<void> {
  const entry = selected();
  if (!entry) return;
  const tags = [...state.picked];
  const note = els.note.value.trim();
  try {
    const body = await post(STUDY_VERDICT_ENDPOINT, { id: entry.id, thumb, tags, note });
    // The file on disk changed; keep the page honest without a reload.
    entry.study.verdict = body.verdict as StudyEntry["study"]["verdict"];
    draw();
    setStatus(
      `${entry.id} → ${thumb}${tags.length ? ` (${tags.join(", ")})` : ""}. ` +
        `studies/ledger.md rewritten.` +
        (tags.length === 0 && note === "" ? " No reason given — the tally learns nothing from it." : ""),
    );
  } catch (err) {
    setStatus(`Could not record a verdict on ${entry.id}: ${(err as Error).message}`);
  }
}

async function clearVerdict(): Promise<void> {
  const entry = selected();
  if (!entry) return;
  try {
    await post(STUDY_VERDICT_ENDPOINT, { id: entry.id, clear: true });
    delete entry.study.verdict;
    state.picked = new Set();
    els.note.value = "";
    draw();
    setStatus(`${entry.id} is back in the queue.`);
  } catch (err) {
    setStatus(`Could not clear ${entry.id}: ${(err as Error).message}`);
  }
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(parsed.error ?? `HTTP ${res.status}`));
  return parsed;
}

function cell(className: string, ...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = className;
  td.append(...children);
  return td;
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement("span");
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

els.play.addEventListener("click", () => void play());
els.pause.addEventListener("click", () => {
  if (!pausePlayback()) resumePlayback();
  drawTransport();
  setStatus(playbackState() === "paused" ? "Paused." : "Playing.");
});
els.stop.addEventListener("click", () => {
  stopPlayback();
  drawTransport();
  setStatus("Stopped.");
});
els.up.addEventListener("click", () => void judge("up"));
els.down.addEventListener("click", () => void judge("down"));
els.clear.addEventListener("click", () => void clearVerdict());
els.unjudgedOnly.addEventListener("change", () => {
  state.unjudgedOnly = els.unjudgedOnly.checked;
  draw();
  ensureSelection();
});
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  draw();
  ensureSelection();
});

draw();
drawTransport();
const first = firstSelectable();
if (first) {
  select(first);
  setStatus(
    canJudge
      ? "Play an attempt, pick the tags that say why, then thumb it. Its siblings are the strip above."
      : "Read-only build — judging needs the dev server (npm run dev).",
  );
} else {
  setStatus(
    'No studies yet. Fan out a set: npm run study:new -- --concept guitar-solo --axis phrasing --mood "<scene>"',
  );
}
