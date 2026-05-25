import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@amafin/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5173,
    cors: true,
    origin: 'http://localhost:5173',
    proxy: {
      '/api':    { target: 'http://localhost:8000', changeOrigin: true },
      '/static': { target: 'http://localhost:8000', changeOrigin: true },
      '/media':  { target: 'http://localhost:8000', changeOrigin: true },
      '/login':  { target: 'http://localhost:8000', changeOrigin: true },
      '/logout': { target: 'http://localhost:8000', changeOrigin: true },
      '/admin':  { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  base: '/react/',
  build: {
    outDir: 'dist',
  },
});
