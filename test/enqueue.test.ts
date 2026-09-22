import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it } from 'vitest';
import { submitExtraction, type QueueSender } from '../src/frontend/src/server/enqueue.js';

const queuedMessage = 'Your request is in the queue! Check your email in a few minutes';

describe('submitExtraction', () => {
  it('queues a valid request and returns 202', async () => {
    const commands: SendMessageCommand[] = [];
    const client: QueueSender = {
      send: async (command) => {
        commands.push(command);
        return {};
      },
    };

    const result = await submitExtraction(
      { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', email: 'Listener@Example.com' },
      { queueUrl: 'https://sqs.ap-southeast-1.amazonaws.com/123/jobs', queuedMessage, client },
    );

    expect(result).toEqual({ ok: true, status: 202, message: queuedMessage });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.input.QueueUrl).toBe('https://sqs.ap-southeast-1.amazonaws.com/123/jobs');
    expect(JSON.parse(commands[0]?.input.MessageBody ?? '')).toEqual({
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      email: 'listener@example.com',
    });
  });

  it('does not queue an invalid YouTube URL', async () => {
    const client: QueueSender = {
      send: async () => {
        throw new Error('should not send');
      },
    };

    const result = await submitExtraction(
      { youtubeUrl: 'https://example.com/watch', email: 'listener@example.com' },
      { queueUrl: 'https://sqs.example/jobs', queuedMessage, client },
    );

    expect(result.status).toBe(400);
    expect(result.ok).toBe(false);
  });

  it('reports a configuration error when the queue URL is missing', async () => {
    const result = await submitExtraction(
      { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', email: 'listener@example.com' },
      { queueUrl: undefined, queuedMessage, client: { send: async () => ({}) } },
    );

    expect(result).toEqual({ ok: false, status: 500, message: 'Queue is not configured.' });
  });
});
