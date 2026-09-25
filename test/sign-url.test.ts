import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signCloudFrontDownload } from '../src/backend/sign-url.js';
import { DOWNLOAD_TTL_SECONDS } from '../src/shared/constants.js';

describe('signCloudFrontDownload', () => {
  it('signs the CloudFront object URL for 24 hours', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const now = new Date('2026-09-22T12:00:00.000Z');
    const signed = signCloudFrontDownload({
      baseUrl: 'https://yt-audio-extractor.julian-pereira.com',
      objectKey: 'audio/track.mp3',
      keyPairId: 'KTESTKEY',
      privateKey,
      expiresInSeconds: DOWNLOAD_TTL_SECONDS,
      now,
    });
    const url = new URL(signed);

    expect(url.origin + url.pathname).toBe('https://yt-audio-extractor.julian-pereira.com/audio/track.mp3');
    expect(url.searchParams.get('Key-Pair-Id')).toBe('KTESTKEY');
    expect(url.searchParams.get('Signature')).toBeTruthy();
    expect(url.searchParams.get('Expires')).toBe(String(Math.floor(now.getTime() / 1000) + DOWNLOAD_TTL_SECONDS));
  });
});
