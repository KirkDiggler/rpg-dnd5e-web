/// <reference types="vite/client" />

/**
 * Build identifier injected by vite.config.ts `define`. Tiered source:
 * BUILD_ID env var (Docker builds — github.sha via build-arg, since the
 * image has no .git), else short commit SHA via git, else a per-build
 * timestamp. Used to cache-bust runtime-loaded /themes/*.css links (web#553).
 */
declare const __BUILD_ID__: string;
