import { qwikCity } from '@builder.io/qwik-city/vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const frontendRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    root: frontendRoot,
    plugins: [qwikCity(), qwikVite(), tsconfigPaths({ root: frontendRoot })],
    server: {
      headers: {
        'Cache-Control': 'public, max-age=0',
      },
    },
    preview: {
      headers: {
        'Cache-Control': 'public, max-age=600',
      },
    },
  };
});
