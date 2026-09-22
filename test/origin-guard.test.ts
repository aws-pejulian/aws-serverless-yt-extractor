import { describe, expect, it } from 'vitest';
import { rejectUnverifiedOrigin } from '../src/frontend/src/server/origin-guard.js';

describe('rejectUnverifiedOrigin', () => {
  it('accepts the CloudFront origin header', () => {
    expect(rejectUnverifiedOrigin({ 'X-Origin-Verify': 'secret' }, 'secret')).toBeUndefined();
  });

  it('rejects a direct caller', () => {
    expect(rejectUnverifiedOrigin({}, 'secret')?.statusCode).toBe(403);
    expect(rejectUnverifiedOrigin({ 'x-origin-verify': 'other' }, 'secret')?.statusCode).toBe(403);
    expect(rejectUnverifiedOrigin({ 'x-origin-verify': 'secret' }, undefined)?.statusCode).toBe(403);
  });
});