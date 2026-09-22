import { qwikVite } from '@builder.io/qwik/optimizer';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        plugins: [qwikVite()],
        esbuild: {
          jsx: 'automatic',
          jsxImportSource: '@builder.io/qwik',
        },
        test: {
          name: 'qwik',
          environment: 'node',
          include: ['test/**/*.test.tsx'],
        },
      },
    ],
  },
});
