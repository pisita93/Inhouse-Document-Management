import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  test: {
    environmentMatchGlobs: [
      ['client/**', 'jsdom'],
      ['**', 'node'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', 'dist', 'e2e/**', '**/server/dist/**', '**/client/dist/**'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['server/src/**', 'client/src/**', 'shared/**'],
      exclude: [
        'client/src/App.tsx',
        'client/src/main.tsx',
        'client/src/types.ts',
        'client/src/pages/**',
        'server/src/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
