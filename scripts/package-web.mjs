import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build/web-lambda');

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'server'), { recursive: true });
await cp(path.join(root, 'src/frontend/server'), path.join(out, 'server'), { recursive: true });
await cp(path.join(root, 'src/frontend/dist'), path.join(out, 'dist'), { recursive: true });
