import { describe, expect, it } from 'vitest';
import { parseSubmission, SubmissionError } from '../src/shared/submission.js';

describe('parseSubmission', () => {
  it('accepts a standard YouTube watch URL and normalizes the email', () => {
    const submission = parseSubmission({
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      email: ' Listener@Example.com ',
    });

    expect(submission.youtubeUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(submission.email).toBe('listener@example.com');
  });

  it('accepts youtu.be links', () => {
    const submission = parseSubmission({
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      email: 'listener@example.com',
    });

    expect(submission.youtubeUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it.each([
    ['http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https'],
    ['https://evil.example/watch?v=dQw4w9WgXcQ', 'Only YouTube'],
    ['https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ', 'credentials'],
    ['https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ', 'port'],
    ['not a url', 'valid YouTube URL'],
  ])('rejects %s', (youtubeUrl, fragment) => {
    expect(() => parseSubmission({ youtubeUrl, email: 'listener@example.com' })).toThrow(SubmissionError);
    expect(() => parseSubmission({ youtubeUrl, email: 'listener@example.com' })).toThrow(fragment);
  });

  it('rejects a missing or invalid email', () => {
    expect(() => parseSubmission({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' })).toThrow(/required/);
    expect(() =>
      parseSubmission({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', email: 'not-an-email' }),
    ).toThrow(/email/i);
  });
});
