import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extractor image', () => {
  const dockerfile = readFileSync(path.join(process.cwd(), 'src/backend/Dockerfile'), 'utf8');

  it('uses the Node.js 22 Lambda base image and packages yt-dlp plus ffmpeg', () => {
    expect(dockerfile).toContain('public.ecr.aws/lambda/nodejs:22');
    expect(dockerfile).toContain('yt-dlp_linux');
    expect(dockerfile).toContain('ffmpeg');
    expect(dockerfile).toContain('CMD ["index.handler"]');
  });
});
