/**
 * Print the palette registry as a tree, so subtype hierarchies are visible
 * without any parent file listing its children by hand:
 *   npm run palette:tree
 *   npm run palette:tree -- --kind genre
 * Named flags only (repo convention: no positional arguments).
 */
import { resolve } from "node:path";
import { Command } from "commander";
import { loadPalettesFromDir } from "../src/engine/palette-loader";
import type { Palette } from "../src/engine/palette";

const program = new Command();
program
  .name("palette-tree")
  .description("List palettes grouped by kind, nesting subtypes under their parent")
  .option("--kind <kind>", "only show this kind, e.g. genre")
  .parse(process.argv);

const opts = program.opts<{ kind?: string }>();

const palettes = loadPalettesFromDir(resolve(process.cwd(), "palettes")).filter(
  (p) => !opts.kind || p.frontmatter.kind === opts.kind,
);

if (palettes.length === 0) {
  console.error(opts.kind ? `No palettes of kind "${opts.kind}".` : "No palettes found.");
  process.exit(2);
}

const byKind = new Map<string, Palette[]>();
for (const p of palettes) {
  const list = byKind.get(p.frontmatter.kind) ?? [];
  list.push(p);
  byKind.set(p.frontmatter.kind, list);
}

for (const [kind, group] of [...byKind].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${kind}/`);
  // Roots are parentless, or point at a parent filtered out of this view.
  const slugs = new Set(group.map((p) => p.frontmatter.slug));
  const roots = group.filter((p) => !p.frontmatter.parent || !slugs.has(p.frontmatter.parent));
  for (const root of roots) printBranch(root, group, "  ");
}
console.log();

/** Print one palette and, indented beneath it, every palette naming it as parent. */
function printBranch(palette: Palette, group: Palette[], indent: string): void {
  const { slug, title } = palette.frontmatter;
  console.log(`${indent}${slug} — ${title}`);
  const children = group.filter((p) => p.frontmatter.parent === slug);
  for (const child of children) printBranch(child, group, `${indent}  `);
}
