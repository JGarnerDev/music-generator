/**
 * One tag pill. Motif pills are accented so a quoted theme reads differently
 * from a palette tag at a glance.
 *
 * Text goes through JSX, which escapes it — tags come out of composition JSON,
 * so none of it may ever be parsed as markup. That was the `dom.ts`
 * never-innerHTML rule; here it is the default.
 */
import type { ChipLabel } from "@engine/library";

export function Chip({ label }: { label: ChipLabel }) {
  return <span className={label.motif ? "chip motif" : "chip"}>{label.text}</span>;
}
