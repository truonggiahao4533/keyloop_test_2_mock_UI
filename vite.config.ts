/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The API sends no CORS headers, so the browser talks to Vite and Vite forwards
// to the API. Set API_TARGET to point at a backend on another host or port.
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', '').API_TARGET || 'http://localhost:8080';
  const proxy = {
    '/v1': { target, changeOrigin: true },
    '/readyz': { target, changeOrigin: true },
  };
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: { environment: 'node' },
  };
});
