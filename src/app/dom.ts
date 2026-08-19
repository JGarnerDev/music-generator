/**
 * The four element helpers every bench view builds its tables out of.
 *
 * Nodes are created with `createElement` and filled with `textContent`, never
 * `innerHTML`: names, tags and session notes all come from JSON files and typed
 * input, so none of it may ever be parsed as markup.
 *
 * Shared by [`./library-view`](./library-view.ts) and
 * [`./session-view`](./session-view.ts) — the same row grammar, so the two pages
 * stay recognisably one app.
 */

/** A `<span>` with a class and text. Pass `""` for no class. */
export function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement("span");
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/** A `<td>` with a class and children. */
export function cell(className: string, ...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = className;
  td.append(...children);
  return td;
}

/**
 * A small glyph button for inside a row. The click stops propagating, so
 * pressing one never also fires the row's own select handler.
 */
export function iconButton(
  glyph: string,
  label: string,
  danger: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "icon danger" : "icon";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

/** A `<button>` with a class, label and handler — the chips and tabs. */
export function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}
