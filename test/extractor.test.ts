import { Readable } from 'node:stream';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { assertMp3InTmp, buildYtDlpArgs, processExtraction, type ExtractorDeps } from '../src/backend/extractor.js';
import { DOWNLOAD_TTL_SECONDS } from '../src/shared/constants.js';
import type { ExtractionNotice } from '../src/shared/notice.js';

const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function deps(overrides: Partial<ExtractorDeps> = {}): ExtractorDeps & {
  s3Commands: unknown[];
  notices: ExtractionNotice[];
  signed: { key: string; expiresInSeconds: number }[];
  removed: string[];
} {
  const s3Commands: unknown[] = [];
  const notices: ExtractionNotice[] = [];
  const signed: { key: string; expiresInSeconds: number }[] = [];
  const removed: string[] = [];

  return {
    s3Commands,
    notices,
    signed,
    removed,
    run: vi.fn(async () => ({ stdout: '/tmp/track.mp3\n', stderr: '', code: 0 })),
    open: () => Readable.from(['mp3-bytes']),
    remove: async (filePath) => {
      removed.push(filePath);
    },
    s3: {
      send: async (command) => {
        s3Commands.push(command);
        return {};
      },
    },
    publish: async (notice) => {
      notices.push(notice);
    },
    signDownloadUrl: async (objectKey, expiresInSeconds) => {
      signed.push({ key: objectKey, expiresInSeconds });
      return `https://yt-audio-extractor.julian-pereira.com/${objectKey}?Signature=test`;
    },
    uuid: () => '11111111-1111-4111-8111-111111111111',
    bucket: 'audio-bucket',
    ...overrides,
  };
}

describe('buildYtDlpArgs', () => {
  it('passes the URL as one argument and points ffmpeg at the static binary', () => {
    const args = buildYtDlpArgs(youtubeUrl, '/tmp/out.%(ext)s', '/usr/local/bin/ffmpeg');

    expect(args.at(-1)).toBe(youtubeUrl);
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--ffmpeg-location');
    expect(args).toContain('/usr/local/bin/ffmpeg');
  });
});

describe('assertMp3InTmp', () => {
  it('returns the last reported mp3 path', () => {
    expect(assertMp3InTmp('note\n/tmp/track.mp3\n')).toBe('/tmp/track.mp3');
  });

  it('rejects paths that escape /tmp', () => {
    expect(() => assertMp3InTmp('/tmp/../etc/passwd.mp3')).toThrow(/safe output file/);
    expect(() => assertMp3InTmp('/etc/passwd.mp3')).toThrow(/outside/);
    expect(() => assertMp3InTmp('/tmp/track.wav')).toThrow(/mp3/);
  });
});

describe('processExtraction', () => {
  it('uploads the mp3, signs a 24-hour CloudFront URL, and publishes it', async () => {
    const fake = deps();
    const result = await processExtraction({ youtubeUrl, email: 'Listener@Example.com' }, fake);

    expect(result).toEqual({ ok: true, key: 'audio/11111111-1111-4111-8111-111111111111.mp3' });
    expect(fake.signed).toEqual([
      { key: 'audio/11111111-1111-4111-8111-111111111111.mp3', expiresInSeconds: DOWNLOAD_TTL_SECONDS },
    ]);
    expect(fake.removed).toEqual(['/tmp/track.mp3']);

    const put = fake.s3Commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
    expect(put.input).toMatchObject({
      Bucket: 'audio-bucket',
      Key: 'audio/11111111-1111-4111-8111-111111111111.mp3',
      ContentType: 'audio/mpeg',
    });
    expect(fake.notices).toEqual([
      {
        email: 'listener@example.com',
        status: 'ready',
        downloadUrl:
          'https://yt-audio-extractor.julian-pereira.com/audio/11111111-1111-4111-8111-111111111111.mp3?Signature=test',
      },
    ]);
  });

  it('passes the YouTube URL as a single yt-dlp argument', async () => {
    const fake = deps();
    await processExtraction({ youtubeUrl, email: 'listener@example.com' }, fake);
    const run = fake.run as ReturnType<typeof vi.fn>;
    const args = run.mock.calls[0]?.[1] as string[];
    expect(args.at(-1)).toBe(youtubeUrl);
    expect(args.some((arg) => arg.includes('&&') || arg.includes(';'))).toBe(false);
  });

  it('publishes a failure and does not upload when yt-dlp fails', async () => {
    const fake = deps({
      run: vi.fn(async () => ({ stdout: '', stderr: 'unavailable', code: 1 })),
    });

    const result = await processExtraction({ youtubeUrl, email: 'listener@example.com' }, fake);

    expect(result.ok).toBe(false);
    expect(fake.s3Commands.filter((command) => command instanceof PutObjectCommand)).toHaveLength(0);
    expect(fake.notices).toEqual([
      {
        email: 'listener@example.com',
        status: 'failed',
        detail: 'Audio extraction failed.',
      },
    ]);
  });

  it('finishes a failed extraction when the failure email cannot be sent', async () => {
    const fake = deps({
      run: vi.fn(async () => ({ stdout: '', stderr: 'unavailable', code: 1 })),
      publish: async () => {
        throw new Error('sns unavailable');
      },
    });

    await expect(processExtraction({ youtubeUrl, email: 'listener@example.com' }, fake)).resolves.toMatchObject({
      ok: false,
    });
  });

  it('rejects a non-YouTube URL before starting yt-dlp', async () => {
    const fake = deps();
    const result = await processExtraction(
      { youtubeUrl: 'https://evil.example/video', email: 'listener@example.com' },
      fake,
    );

    expect(result).toMatchObject({ ok: false });
    expect(fake.run).not.toHaveBeenCalled();
    expect(fake.notices).toHaveLength(0);
  });
});
