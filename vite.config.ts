import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Live sessions, room links and uploads come from server/index.mjs (`npm run dev:server`).
const API = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API,
      '/media': API,
      '/collab': { target: API, ws: true },
    },
  },
});
