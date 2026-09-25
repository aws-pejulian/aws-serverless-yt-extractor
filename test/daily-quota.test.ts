import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from 'vitest';
import { consumeDailyJob, maxJobsPerDay, type QuotaClient } from '../src/frontend/src/server/daily-quota.js';

const now = new Date('2026-09-23T16:00:00.000Z');

describe('consumeDailyJob', () => {
  it('counts one accepted job for the UTC day', async () => {
    const commands: UpdateItemCommand[] = [];
    const client: QuotaClient = {
      send: async (command) => {
        commands.push(command);
      },
    };

    await expect(consumeDailyJob('JobQuota', client, now)).resolves.toBe(true);

    expect(commands[0]?.input).toMatchObject({
      TableName: 'JobQuota',
      Key: { day: { S: '2026-09-23' } },
      ExpressionAttributeValues: {
        ':one': { N: '1' },
        ':limit': { N: String(maxJobsPerDay) },
        ':expires': { N: String(Math.floor(Date.parse('2026-09-23T00:00:00.000Z') / 1000) + 3 * 24 * 60 * 60) },
      },
    });
  });

  it('refuses the job when the condition fails', async () => {
    const client: QuotaClient = {
      send: async () => {
        const error = new Error('full');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      },
    };

    await expect(consumeDailyJob('JobQuota', client, now)).resolves.toBe(false);
  });

  it('fails closed when the table name is missing', async () => {
    const client: QuotaClient = { send: async () => undefined };
    await expect(consumeDailyJob(undefined, client, now)).rejects.toThrow('Daily quota is not configured.');
  });
});
