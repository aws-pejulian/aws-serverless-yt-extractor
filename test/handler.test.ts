import { describe, expect, it, vi } from 'vitest';
import { createDeps, handler } from '../src/backend/handler.js';
import type { ExtractorDeps } from '../src/backend/extractor.js';

describe('handler', () => {
  it('requires the bucket, topic, and signing configuration', () => {
    expect(() => createDeps({})).toThrow(/BUCKET_NAME, TOPIC_ARN/);
  });

  it('deletes an invalid queue message without retrying extraction', async () => {
    const run = vi.fn<ExtractorDeps['run']>();
    const deps = {
      run,
      open: () => {
        throw new Error('unused');
      },
      remove: async () => undefined,
      s3: { send: async () => ({}) },
      publish: async () => undefined,
      signDownloadUrl: async () => 'https://example.com',
      uuid: () => 'id',
      bucket: 'bucket',
    } satisfies ExtractorDeps;

    const result = await handler(
      {
        Records: [{ messageId: 'msg-1', body: JSON.stringify({ youtubeUrl: 'https://evil.example', email: 'a@b.co' }) }],
      },
      deps,
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('drops an unreadable message instead of retrying it', async () => {
    const publish = vi.fn<ExtractorDeps['publish']>();
    const deps = {
      run: vi.fn<ExtractorDeps['run']>(),
      open: () => {
        throw new Error('unused');
      },
      remove: async () => undefined,
      s3: { send: async () => ({}) },
      publish,
      signDownloadUrl: async () => 'https://example.com',
      uuid: () => 'id',
      bucket: 'bucket',
    } satisfies ExtractorDeps;

    const result = await handler({ Records: [{ messageId: 'msg-2', body: '{' }] }, deps);
    expect(result.batchItemFailures).toEqual([]);
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not start a job that was already claimed', async () => {
    const run = vi.fn<ExtractorDeps['run']>();
    const deps = {
      run,
      open: () => {
        throw new Error('unused');
      },
      remove: async () => undefined,
      s3: { send: async () => ({}) },
      publish: async () => undefined,
      signDownloadUrl: async () => 'https://example.com',
      claim: async () => false,
      uuid: () => 'id',
      bucket: 'bucket',
    } satisfies ExtractorDeps;

    const result = await handler(
      {
        Records: [
          {
            messageId: 'msg-3',
            body: JSON.stringify({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', email: 'listener@example.com' }),
          },
        ],
      },
      deps,
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
