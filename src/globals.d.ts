/**
 * Build-time constants, replaced by Vite's `define`.
 *
 * One of them, and it answers one question the browser cannot: *which build am
 * I?* The keys page ships twice — as one tab of the local bench
 * (`vite.config.ts`) and as the standalone phone app
 * (`vite.keys.config.ts`) — and the app half has a service worker while the
 * bench half does not. `import.meta.env.PROD` is true for both, so it cannot
 * tell them apart, and a registration that 404s is a console error on every
 * production build of the bench.
 */
declare const __KEYS_APP__: boolean;
