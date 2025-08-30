import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
