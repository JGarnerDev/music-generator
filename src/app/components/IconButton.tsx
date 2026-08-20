/**
 * A small glyph button inside a table row: play, delete, loop, reorder.
 *
 * Shared rather than per-table because the click behaviour is the load-bearing
 * part and it is easy to forget — the event stops propagating, so pressing one
 * never also fires the row's own select handler.
 *
 * `title` and `aria-label` are the same string on purpose. The glyph is the
 * whole label, and a glyph is not a name: `▶` has to reach a screen reader as
 * "Play tavern-raid" and a hovering pointer as the same words.
 */
export interface IconButtonProps {
  glyph: string;
  /** What it does, to this row: "Play tavern-raid", not "Play". */
  label: string;
  /** Red on hover — deleting, removing, anything that loses work. */
  danger?: boolean;
  /**
   * A two-state button that shows which state it is in (the session board's
   * loop toggle). `on` accents it.
   */
  toggle?: boolean;
  on?: boolean;
  disabled?: boolean;
  onClick(): void;
}

export function IconButton({ glyph, label, danger, toggle, on, disabled, onClick }: IconButtonProps) {
  const className = ["icon", danger ? "danger" : "", toggle ? "toggle" : "", on ? "on" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {glyph}
    </button>
  );
}
