/**
 * The scrub bar: where we are in the cue, and a click to move there.
 *
 * DOM + rAF glue over [`./audio/playback`](./audio/playback.ts), which owns the actual
 * seeking. Kept apart from the session page because it is a transport widget,
 * not a session concept — the composition bench can mount the same one.
 *
 * The bar polls rather than being told: `Tone.Player` has no position event, and
 * a piece can end, loop or be seeked from a keypress. One rAF loop reading
 * `positionSeconds()` is both simpler and always right.
 */
import { formatClock } from "@utils/clock";
import { durationSeconds, playbackState, positionSeconds, seekTo } from "./audio/playback";

export interface ScrubBar {
  /** Begin following playback. Idempotent. */
  start(): void;
  /** Stop following and blank the bar — call when playback stops. */
  reset(): void;
}

/**
 * Mount a scrub bar into `container`, which is emptied first.
 *
 * `onSeek` fires after the seek lands, for the caller's status line. It is not
 * asked for permission: the bar is only interactive while something is loaded,
 * and a seek that the player refuses (nothing loaded) simply does nothing.
 */
export function createScrubBar(container: HTMLElement, onSeek?: (seconds: number) => void): ScrubBar {
  container.textContent = "";
  container.classList.add("scrub");

  const elapsed = document.createElement("span");
  elapsed.className = "scrub-time";
  elapsed.textContent = "0:00";

  const total = document.createElement("span");
  total.className = "scrub-time";
  total.textContent = "0:00";

  const track = document.createElement("div");
  track.className = "scrub-track";
  track.setAttribute("role", "slider");
  track.setAttribute("aria-label", "Playback position");
  track.setAttribute("aria-valuemin", "0");
  track.tabIndex = 0;

  const fill = document.createElement("div");
  fill.className = "scrub-fill";
  track.append(fill);
  container.append(elapsed, track, total);

  let raf = 0;
  /** Set while dragging: the pointer owns the fill, not the clock. */
  let dragging = false;

  const draw = (): void => {
    const duration = durationSeconds();
    const idle = duration <= 0;
    container.classList.toggle("idle", idle);
    total.textContent = formatClock(duration);
    if (!dragging) {
      const at = positionSeconds();
      elapsed.textContent = formatClock(at);
      fill.style.width = idle ? "0%" : `${Math.min((at / duration) * 100, 100)}%`;
      track.setAttribute("aria-valuemax", String(Math.round(duration)));
      track.setAttribute("aria-valuenow", String(Math.round(at)));
      track.setAttribute("aria-valuetext", `${formatClock(at)} of ${formatClock(duration)}`);
    }
    // Keep following while paused: a paused piece still has a position, and the
    // bar is how you move it before pressing play again.
    raf = playbackState() === "stopped" ? 0 : requestAnimationFrame(draw);
    if (raf === 0) reset();
  };

  /** Seconds under a pointer at `clientX`, clamped to the track. */
  const secondsAt = (clientX: number): number => {
    const box = track.getBoundingClientRect();
    const fraction = box.width > 0 ? (clientX - box.left) / box.width : 0;
    return Math.min(Math.max(fraction, 0), 1) * durationSeconds();
  };

  const paint = (seconds: number): void => {
    const duration = durationSeconds();
    if (duration <= 0) return;
    fill.style.width = `${Math.min((seconds / duration) * 100, 100)}%`;
    elapsed.textContent = formatClock(seconds);
  };

  const commit = (seconds: number): void => {
    if (seekTo(seconds)) onSeek?.(seconds);
  };

  track.addEventListener("pointerdown", (event) => {
    if (durationSeconds() <= 0) return;
    dragging = true;
    track.setPointerCapture(event.pointerId);
    paint(secondsAt(event.clientX));
  });
  track.addEventListener("pointermove", (event) => {
    if (dragging) paint(secondsAt(event.clientX));
  });
  track.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    track.releasePointerCapture(event.pointerId);
    commit(secondsAt(event.clientX));
  });
  track.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // Arrow keys nudge, because "a few seconds earlier" is the commonest ask and
  // hitting it with a pointer on a 700px bar is a game of darts.
  track.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0;
    if (step === 0) return;
    event.preventDefault();
    commit(positionSeconds() + step);
  });

  const reset = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    dragging = false;
    fill.style.width = "0%";
    elapsed.textContent = "0:00";
    total.textContent = "0:00";
    container.classList.add("idle");
    track.setAttribute("aria-valuenow", "0");
  };

  reset();
  return {
    start(): void {
      if (raf === 0) raf = requestAnimationFrame(draw);
    },
    reset,
  };
}
