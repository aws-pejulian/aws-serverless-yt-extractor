import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';

/** Accepted jobs per UTC day. Twenty full 15-minute runs is $0.60, about $18 in a 30-day month. */
export const maxJobsPerDay = 20;

export const dailyLimitMessage = 'The daily limit has been reached. Try again tomorrow.';

export interface QuotaClient {
  send(command: UpdateItemCommand): Promise<unknown>;
}

export function quotaDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function consumeDailyJob(
  tableName: string | undefined,
  client: QuotaClient,
  now = new Date(),
): Promise<boolean> {
  if (!tableName) {
    throw new Error('Daily quota is not configured.');
  }

  const day = quotaDay(now);
  const expiresAt = Math.floor(Date.parse(`${day}T00:00:00.000Z`) / 1000) + 3 * 24 * 60 * 60;
  try {
    await client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { day: { S: day } },
        UpdateExpression: 'ADD jobCount :one SET expiresAt = if_not_exists(expiresAt, :expires)',
        ConditionExpression: 'attribute_not_exists(jobCount) OR jobCount < :limit',
        ExpressionAttributeValues: {
          ':one': { N: '1' },
          ':limit': { N: String(maxJobsPerDay) },
          ':expires': { N: String(expiresAt) },
        },
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}
