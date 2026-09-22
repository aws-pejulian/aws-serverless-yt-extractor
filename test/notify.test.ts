import { SendEmailCommand } from '@aws-sdk/client-ses';
import { describe, expect, it } from 'vitest';
import { deliverNotice, handler } from '../src/notify/handler.js';

describe('deliverNotice', () => {
  it('emails the CloudFront download link', async () => {
    const sent: SendEmailCommand[] = [];
    await deliverNotice(
      JSON.stringify({
        email: 'listener@example.com',
        status: 'ready',
        downloadUrl: 'https://yt-audio-extrator.julian-pereira.com/audio/a.mp3?Signature=1',
      }),
      {
        fromEmail: 'noreply@julian-pereira.com',
        send: async (command) => {
          sent.push(command);
        },
      },
    );

    expect(sent[0]?.input).toMatchObject({
      Source: 'noreply@julian-pereira.com',
      Destination: { ToAddresses: ['listener@example.com'] },
    });
    expect(sent[0]?.input.Message?.Body?.Text?.Data).toContain('Signature=1');
    expect(sent[0]?.input.Message?.Body?.Text?.Data).toContain('24 hours');
  });

  it('emails a failure without a download link', async () => {
    const sent: SendEmailCommand[] = [];
    await handler(
      {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                email: 'listener@example.com',
                status: 'failed',
                detail: 'Audio extraction failed.',
              }),
            },
          },
        ],
      },
      {
        fromEmail: 'noreply@julian-pereira.com',
        send: async (command) => {
          sent.push(command);
        },
      },
    );

    expect(sent[0]?.input.Message?.Subject?.Data).toBe('Audio extraction failed');
    expect(sent[0]?.input.Message?.Body?.Text?.Data).not.toContain('https://');
  });
});
