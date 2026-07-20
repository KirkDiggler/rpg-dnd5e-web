import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Computed once per build. public/ assets (the /themes/*.css files) are not
// fingerprinted by Vite, so runtime-injected stylesheet links append this as a
// ?v= query — otherwise Cloudflare/browser caches serve stale theme CSS after
// deploys (web#553: combat HUD rendered unstyled in prod).
//
// Three tiers, in order:
//   1. BUILD_ID env var — the Docker image build (docker.yml) passes
//      github.sha through a build-arg, because .dockerignore excludes .git
//      and `git rev-parse` is impossible in-image. This is what prod ships.
//   2. `git rev-parse --short HEAD` — local/CI builds with a repo present.
//   3. Timestamp fallback — any environment with neither; still unique
//      per build, so cache-busting works everywhere even without a SHA.
function buildId(): string {
  if (process.env.BUILD_ID) {
    return process.env.BUILD_ID.slice(0, 12);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return Date.now().toString(36);
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Force Vite to pre-bundle these deps
    include: [
      '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb',
    ],
    esbuildOptions: {
      // Handle .ts files in node_modules
      loader: {
        '.ts': 'ts',
      },
    },
  },
  server: {
    port: 3001,
    // Proxy API requests to the rpg-api server
    proxy: {
      '/connect': {
        target: process.env.VITE_API_HOST || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
