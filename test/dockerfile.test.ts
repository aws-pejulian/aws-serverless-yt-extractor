import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extractor image', () => {
  const dockerfile = readFileSync(path.join(process.cwd(), 'src/backend/Dockerfile'), 'utf8');

  it('uses the Node.js 24 Lambda base image and verifies pinned yt-dlp and ffmpeg checksums', () => {
    expect(dockerfile).toContain('public.ecr.aws/lambda/nodejs:24');
    expect(dockerfile).toContain('ARG YT_DLP_VERSION=2026.08.19');
    expect(dockerfile).toContain(
      'ARG YT_DLP_SHA256=58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a',
    );
    expect(dockerfile).toContain('ARG FFMPEG_BUILD=autobuild-2026-09-20-17-29');
    expect(dockerfile).toContain('ARG FFMPEG_VERSION=N-126732-g5d3cb3dc17');
    expect(dockerfile).toContain(
      'ARG FFMPEG_SHA256=fcafdfacab0a1d513020e7bde3440ee3e0820ef190a1e120df77b7fafe61de1f',
    );
    expect(dockerfile).toContain('echo "${YT_DLP_SHA256}  /tmp/yt-dlp" | sha256sum -c -');
    expect(dockerfile).toContain('echo "${FFMPEG_SHA256}  /tmp/ffmpeg.tar.xz" | sha256sum -c -');
    expect(dockerfile).toContain('CMD ["index.handler"]');
  });
});
