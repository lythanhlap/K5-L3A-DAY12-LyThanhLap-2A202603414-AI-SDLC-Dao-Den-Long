import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { leaderboardHandler } from './scripts/leaderboard-store.mjs';

export default defineConfig({
  build: {
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), character: resolve(__dirname, 'character.html') } },
  },
  plugins: [
    {
      name: 'leaderboard-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => leaderboardHandler(req, res, next));
      },
    },
  ],
});
