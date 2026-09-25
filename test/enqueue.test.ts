import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it } from 'vitest';
import { dailyLimitMessage } from '../src/frontend/src/server/daily-quota.js';
import {
  maxQueuedJobs,
  queueFullMessage,
  queuedMessage,
  submitExtraction,
  type QueueSender,
} from '../src/frontend/src/server/enqueue.js';

function recordingClient(
  commands: Array<GetQueueAttributesCommand | SendMessageCommand>,
  attributes?: Record<string, string>,
): QueueSender {
  return {
    send: async (command) => {
      commands.push(command);
      if (command instanceof GetQueueAttributesCommand) {
        return { Attributes: attributes };
      }
      return {};
    },
  };
}

const validForm = { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', email: 'Listener@Example.com' };
const queueUrl = 'https://sqs.ap-southeast-1.amazonaws.com/123/jobs';

describe('submitExtraction', () => {
  it('queues a valid request and returns 202', async () => {
    const commands: Array<GetQueueAttributesCommand | SendMessageCommand> = [];
    const result = await submitExtraction(validForm, {
      queueUrl,
      client: recordingClient(commands),
      consumeDailyJob: async () => true,
    });

    expect(result).toEqual({ ok: true, status: 202, message: queuedMessage });
    expect(commands[0]).toBeInstanceOf(GetQueueAttributesCommand);
    const sent = commands.find((command) => command instanceof SendMessageCommand);
    expect(sent?.input.QueueUrl).toBe(queueUrl);
    expect(JSON.parse(sent?.input.MessageBody ?? '')).toEqual({
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      email: 'listener@example.com',
    });
  });

  it('does not queue when visible and in-flight jobs already fill the limit', async () => {
    const commands: Array<GetQueueAttributesCommand | SendMessageCommand> = [];
    const result = await submitExtraction(validForm, {
      queueUrl,
      client: recordingClient(commands, {
        ApproximateNumberOfMessages: '12',
        ApproximateNumberOfMessagesNotVisible: String(maxQueuedJobs - 12),
      }),
      consumeDailyJob: async () => {
        throw new Error('should not consume a daily slot');
      },
    });

    expect(result).toEqual({ ok: false, status: 503, message: queueFullMessage });
    expect(commands.some((command) => command instanceof SendMessageCommand)).toBe(false);
  });

  it('does not queue once the daily limit is reached', async () => {
    const commands: Array<GetQueueAttributesCommand | SendMessageCommand> = [];
    const result = await submitExtraction(validForm, {
      queueUrl,
      client: recordingClient(commands),
      consumeDailyJob: async () => false,
    });

    expect(result).toEqual({ ok: false, status: 503, message: dailyLimitMessage });
    expect(commands.some((command) => command instanceof SendMessageCommand)).toBe(false);
  });

  it('does not queue an invalid YouTube URL', async () => {
    const client: QueueSender = {
      send: async () => {
        throw new Error('should not send');
      },
    };

    const result = await submitExtraction(
      { youtubeUrl: 'https://example.com/watch', email: 'listener@example.com' },
      { queueUrl, client, consumeDailyJob: async () => true },
    );

    expect(result.status).toBe(400);
    expect(result.ok).toBe(false);
  });

  it('reports a configuration error when the queue URL is missing', async () => {
    const result = await submitExtraction(validForm, {
      queueUrl: undefined,
      client: { send: async () => ({}) },
      consumeDailyJob: async () => true,
    });

    expect(result).toEqual({ ok: false, status: 500, message: 'Queue is not configured.' });
  });
});
