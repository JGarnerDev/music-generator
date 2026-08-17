/**
 * The study registry, browser side: every attempt under `studies/`, bundled by
 * Vite.
 *
 * Globbed rather than imported one by one so a fresh `npm run study:new` set is
 * judgeable with nothing to register — the same trick the composition and voice
 * libraries use, and like them, a *new* file reaches an open tab only because
 * [`src/dev/live-library.ts`](../dev/live-library.ts) invalidates this glob;
 * Vite alone would need a dev-server restart.
 *
 * The organising rules (folder = concept, how sets group, how tags tally) are
 * pure and tested in [`@engine/study-library`](../engine/study-library.ts); this
 * module is only the wiring that hands them Vite's glob record.
 */
import { buildStudyLibrary, type StudyEntry } from "@engine/study-library";

const bundled = import.meta.glob<unknown>("../../studies/**/*.json", {
  eager: true,
  import: "default",
});

/** Every study on disk, valid or not — invalid ones carry their issues. */
export const STUDY_LIBRARY: StudyEntry[] = buildStudyLibrary(bundled);
