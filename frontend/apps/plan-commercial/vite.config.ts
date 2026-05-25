import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@amafin/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5174,
    cors: true,
    proxy: {
      // FastAPI backend (handles state, products, images, preview, generate, archive)
      '/api':   { target: 'http://localhost:8000', changeOrigin: true },
      // User-uploaded images live under /files (Vite owns /assets for build output)
      '/files': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  // Single-process mode: served at "/" by FastAPI from dist/.
  base: '/',
  build: {
    outDir: 'dist',
  },
});
