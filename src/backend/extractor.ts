import path from 'node:path';
import type { Readable } from 'node:stream';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DOWNLOAD_TTL_SECONDS } from '../shared/constants.js';
import type { ExtractionNotice } from '../shared/notice.js';
import { parseSubmission, SubmissionError } from '../shared/submission.js';

export interface ExtractorDeps {
  run: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  open: (filePath: string) => Readable;
  remove: (filePath: string) => Promise<void>;
  s3: Pick<S3Client, 'send'>;
  publish: (notice: ExtractionNotice) => Promise<void>;
  signDownloadUrl: (objectKey: string, expiresInSeconds: number) => Promise<string>;
  /** Returns false when this queue message was already claimed, so the job is not started again. */
  claim?: (messageId: string) => Promise<boolean>;
  uuid: () => string;
  bucket: string;
  ytDlpBin?: string;
  ffmpegBin?: string;
}

export type ExtractionResult = { ok: true; key: string } | { ok: false; error: string };

export function buildYtDlpArgs(youtubeUrl: string, outputTemplate: string, ffmpegBin: string): string[] {
  return [
    '--no-playlist',
    '--no-cache-dir',
    '--no-progress',
    '--restrict-filenames',
    '--max-filesize',
    '200M',
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '--ffmpeg-location',
    ffmpegBin,
    '--print',
    'after_move:filepath',
    '-o',
    outputTemplate,
    youtubeUrl,
  ];
}

export function assertMp3InTmp(stdout: string): string {
  const line = stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .at(-1);

  if (!line || line.includes('..')) {
    throw new Error('yt-dlp did not report a safe output file.');
  }

  const resolved = path.resolve(line);
  if (resolved !== '/tmp' && !resolved.startsWith('/tmp/')) {
    throw new Error('Refusing to read a file outside /tmp.');
  }
  if (!resolved.endsWith('.mp3')) {
    throw new Error('Expected an mp3 file.');
  }
  return resolved;
}

export async function processExtraction(event: unknown, deps: ExtractorDeps): Promise<ExtractionResult> {
  let submission;
  try {
    submission = parseSubmission(readPayload(event));
  } catch (error) {
    const message = error instanceof SubmissionError ? error.message : 'Invalid request.';
    return { ok: false, error: message };
  }

  const id = deps.uuid();
  const ffmpegBin = deps.ffmpegBin ?? '/usr/local/bin/ffmpeg';
  const outputTemplate = `/tmp/${id}.%(ext)s`;
  let produced: string | undefined;

  try {
    let key: string;
    let url: string;
    try {
      const result = await deps.run(
        deps.ytDlpBin ?? 'yt-dlp',
        buildYtDlpArgs(submission.youtubeUrl, outputTemplate, ffmpegBin),
      );
      if (result.code !== 0) {
        throw new Error('Audio extraction failed.');
      }

      produced = assertMp3InTmp(result.stdout);
      key = `audio/${id}.mp3`;
      await deps.s3.send(
        new PutObjectCommand({
          Bucket: deps.bucket,
          Key: key,
          Body: deps.open(produced),
          ContentType: 'audio/mpeg',
          ContentDisposition: 'attachment; filename="audio.mp3"',
        }),
      );

      url = await deps.signDownloadUrl(key, DOWNLOAD_TTL_SECONDS);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Audio extraction failed.';
      await deps.publish({ email: submission.email, status: 'failed', detail }).catch(() => undefined);
      return { ok: false, error: detail };
    }

    await deps.publish({ email: submission.email, status: 'ready', downloadUrl: url });
    return { ok: true, key };
  } finally {
    if (produced) {
      await deps.remove(produced);
    }
  }
}

function readPayload(event: unknown): { youtubeUrl?: unknown; email?: unknown } {
  if (typeof event !== 'object' || event === null) {
    return {};
  }
  const record = event as { youtubeUrl?: unknown; email?: unknown };
  return { youtubeUrl: record.youtubeUrl, email: record.email };
}
