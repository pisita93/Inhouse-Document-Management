import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5900' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
