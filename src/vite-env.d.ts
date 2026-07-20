/// <reference types="vite/client" />

/**
 * Build identifier injected by vite.config.ts `define` (short commit SHA).
 * Used to cache-bust runtime-loaded /themes/*.css links (web#553).
 */
declare const __BUILD_ID__: string;
