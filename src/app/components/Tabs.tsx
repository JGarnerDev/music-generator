/**
 * The tab strip every bench wears: All · <shelf> · <shelf> …, each with how many
 * things it holds.
 *
 * One component rather than three near-identical ones, because all three pages
 * style it from the same `#tabs` block copied between their stylesheets — a tab
 * that changed shape on one page and not the others would be a bug nobody was
 * looking for. What differs per page is only *what the shelves are*, so that
 * stays in the caller: [`KindTabs`](./KindTabs.tsx),
 * [`InstrumentTabs`](./InstrumentTabs.tsx), [`GroupTabs`](./GroupTabs.tsx).
 *
 * Equal-width tabs (`flex: 1 1 0` in the CSS) keep a count going 9 → 10 from
 * resizing them mid-comparison.
 */
export interface TabItem<T> {
  /** What the tab selects. `null` is the All tab. */
  value: T | null;
  label: string;
  count: number;
}

export interface TabsProps<T> {
  /** Names the strip for screen readers: "Composition kinds", "Instruments", … */
  label: string;
  items: readonly TabItem<T>[];
  selected: T | null;
  onPick(value: T | null): void;
}

export function Tabs<T extends string>({ label, items, selected, onPick }: TabsProps<T>) {
  return (
    <nav id="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value ?? "__all"}
          className="tab"
          type="button"
          role="tab"
          aria-selected={item.value === selected}
          onClick={() => onPick(item.value)}
        >
          {item.label}
          <span className="count">{item.count}</span>
        </button>
      ))}
    </nav>
  );
}
