/**
 * The running orders in `sessions/`: which one is open, editing it, and getting
 * it back to disk.
 *
 * Fetched rather than globbed — a glob would put `sessions/*.json` under Vite's
 * live-reload watcher, and saving a running order mid-game would reload the page,
 * which stops the audio. See [`src/dev/endpoints`](../../dev/endpoints.ts).
 *
 * Every edit is a whole new plan (the rules live in
 * [`@engine/session`](../../engine/session.ts)) and every edit is written back,
 * because the board is used at a table and nobody is going to press Save. The
 * write is debounced: reordering a running order is a burst of clicks and each
 * one would otherwise be a file write.
 */
import { useEffect, useRef, useState } from "react";
import { checkSessionName, deletedMessage, savedMessage, saveFailedMessage } from "@engine/session-bench";
import { emptySession, parseSessions, sessionSlug, type SessionPlan } from "@engine/session";
import {
  SESSION_DELETE_ENDPOINT,
  SESSION_LIST_ENDPOINT,
  SESSION_SAVE_ENDPOINT,
} from "../../dev/endpoints";
import { useApi } from "./useApi";

/** Long enough to swallow a burst of ↑/↓ clicks, short enough to beat a refresh. */
const SAVE_DEBOUNCE_MS = 300;

export interface SessionsOptions {
  /**
   * Hold the first fetch until the caller is ready to judge what it gets. The
   * board resolves cues against the render manifest, so listing sessions before
   * that manifest is in would announce a night of silent cues and then quietly
   * correct itself.
   */
  enabled: boolean;
  onStatus(message: string): void;
  /** A plan became the open one — a first load, a switch, or a delete. */
  onOpen(plan: SessionPlan | null): void;
}

export interface Sessions {
  /** Every plan on disk, sorted, so the picker can switch without a round trip. */
  all: SessionPlan[];
  plan: SessionPlan | null;
  select(name: string): void;
  /** Apply a change to the open plan and write it. A no-op change writes nothing. */
  edit(change: (plan: SessionPlan) => SessionPlan): void;
  /** Start a session named `title`. Returns false when the name was refused. */
  create(title: string, campaign: string | null): boolean;
  /** Delete the open plan's file. The compositions are not touched. */
  remove(): void;
}

export function useSessions({ enabled, onStatus, onOpen }: SessionsOptions): Sessions {
  const api = useApi();
  const [all, setAll] = useState<SessionPlan[]>([]);
  const [name, setName] = useState<string | null>(null);
  const plan = all.find((p) => p.name === name) ?? null;

  // Latched: both fire from a debounced timer or a promise, long after the
  // render that supplied them.
  const status = useRef(onStatus);
  status.current = onStatus;
  const open = useRef(onOpen);
  open.current = onOpen;

  /**
   * False once a write has been refused. A built bundle has no dev server to
   * answer the endpoints: say so once, then stop nagging on every click. The
   * board still works — it just cannot remember tonight's changes.
   */
  const canSave = useRef(true);
  const saveTimer = useRef(0);
  /** The plan the pending timer will write — always the newest, never the one it was armed with. */
  const pending = useRef<SessionPlan | null>(null);

  async function write(next: SessionPlan): Promise<void> {
    if (!canSave.current) return;
    try {
      await api.post(SESSION_SAVE_ENDPOINT, next);
      status.current(savedMessage(next.name));
    } catch (err) {
      canSave.current = false;
      status.current(saveFailedMessage((err as Error).message));
    }
  }

  function scheduleWrite(next: SessionPlan): void {
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const target = pending.current;
      pending.current = null;
      if (target) void write(target);
    }, SAVE_DEBOUNCE_MS);
  }

  async function load(select?: string): Promise<void> {
    let loaded: SessionPlan[] = [];
    try {
      const body = await api.get<{ sessions?: unknown }>(SESSION_LIST_ENDPOINT);
      loaded = parseSessions(body.sessions);
    } catch {
      // Nobody answering the list endpoint is also nobody to save to.
      canSave.current = false;
    }
    const chosen = loaded.find((p) => p.name === select) ?? loaded[0] ?? null;
    setAll(loaded);
    setName(chosen?.name ?? null);
    open.current(chosen);
  }

  // One load, on the first render the caller says it is ready for. The ref
  // guard is what makes StrictMode's second pass a no-op rather than a second
  // fetch that re-announces the pre-flight check over the top of itself.
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void load();
  }, [enabled]);

  return {
    all,
    plan,
    select(next: string): void {
      const target = all.find((p) => p.name === next) ?? null;
      setName(target?.name ?? null);
      open.current(target);
    },
    edit(change: (plan: SessionPlan) => SessionPlan): void {
      if (!plan) return;
      const next = change(plan);
      if (next === plan) return;
      setAll((prev) => prev.map((p) => (p.name === next.name ? next : p)));
      scheduleWrite(next);
    },
    create(title: string, campaign: string | null): boolean {
      const check = checkSessionName(sessionSlug(title), all.map((p) => p.name));
      if (!check.name) {
        status.current(check.error ?? "");
        return false;
      }
      const next: SessionPlan = { ...emptySession(check.name, campaign ?? undefined), title };
      setAll((prev) => [...prev, next].sort((a, b) => a.name.localeCompare(b.name)));
      setName(next.name);
      // Written now rather than debounced: an empty file on disk is what makes
      // the session real, and the next click is going to be on the Archive tab.
      void write(next);
      return true;
    },
    remove(): void {
      if (!plan) return;
      void api
        .post(SESSION_DELETE_ENDPOINT, { name: plan.name })
        .then(() => {
          status.current(deletedMessage(plan.name));
          return load();
        })
        .catch((err: Error) => status.current(`Could not delete: ${err.message}`));
    },
  };
}
