const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionError';
  }
}

export interface Submission {
  youtubeUrl: string;
  email: string;
}

export function parseSubmission(input: { youtubeUrl?: unknown; email?: unknown }): Submission {
  if (typeof input.youtubeUrl !== 'string' || typeof input.email !== 'string') {
    throw new SubmissionError('A YouTube URL and an email address are required.');
  }

  const youtubeUrl = parseYouTubeUrl(input.youtubeUrl);
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new SubmissionError('Enter a valid email address.');
  }

  return { youtubeUrl, email };
}

function parseYouTubeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new SubmissionError('Enter a valid YouTube URL.');
  }

  if (url.protocol !== 'https:') {
    throw new SubmissionError('The YouTube URL must use https.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new SubmissionError('The YouTube URL cannot include credentials.');
  }
  if (url.port !== '') {
    throw new SubmissionError('The YouTube URL cannot include a port.');
  }
  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    throw new SubmissionError('Only YouTube URLs are accepted.');
  }

  return url.toString();
}
