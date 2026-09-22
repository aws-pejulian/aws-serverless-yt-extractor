import { nodeServerAdapter } from '@builder.io/qwik-city/adapters/node-server/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../vite.config.ts';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default extendConfig(baseConfig, () => {
  return {
    root: frontendRoot,
    ssr: {
      external,
      noExternal: /./,
    },
    build: {
      minify: false,
      ssr: true,
      outDir: resolve(frontendRoot, 'server'),
      rollupOptions: {
        input: [resolve(frontendRoot, 'src/entry_aws-lambda.tsx'), '@qwik-city-plan'],
      },
    },
    plugins: [nodeServerAdapter({ name: 'aws-lambda' })],
  };
});
