import { GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { parseSubmission, SubmissionError } from '../../../shared/submission.js';
import { dailyLimitMessage } from './daily-quota.js';

export interface QueueSender {
  send(command: SendMessageCommand | GetQueueAttributesCommand): Promise<{ Attributes?: Record<string, string> }>;
}

export interface QueueResult {
  ok: boolean;
  status: number;
  message: string;
}

export const queuedMessage = 'Your request is in the queue! Check your email in a few minutes';

/** Visible plus in-flight jobs. Two waves of the extractor's reserved concurrency. */
export const maxQueuedJobs = 20;

export const queueFullMessage = 'The queue is full. Try again in a few minutes.';

export async function submitExtraction(
  form: { youtubeUrl?: unknown; email?: unknown },
  deps: {
    queueUrl: string | undefined;
    client: QueueSender;
    consumeDailyJob: () => Promise<boolean>;
  },
): Promise<QueueResult> {
  let submission;
  try {
    submission = parseSubmission(form);
  } catch (error) {
    const message = error instanceof SubmissionError ? error.message : 'Check the form and try again.';
    return { ok: false, status: 400, message };
  }

  if (!deps.queueUrl) {
    return { ok: false, status: 500, message: 'Queue is not configured.' };
  }

  const depth = await deps.client.send(
    new GetQueueAttributesCommand({
      QueueUrl: deps.queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    }),
  );
  if (queuedJobCount(depth.Attributes) >= maxQueuedJobs) {
    return { ok: false, status: 503, message: queueFullMessage };
  }

  if (!(await deps.consumeDailyJob())) {
    return { ok: false, status: 503, message: dailyLimitMessage };
  }

  await deps.client.send(
    new SendMessageCommand({
      QueueUrl: deps.queueUrl,
      MessageBody: JSON.stringify(submission),
    }),
  );

  return { ok: true, status: 202, message: queuedMessage };
}

function queuedJobCount(attributes: Record<string, string> | undefined): number {
  const visible = Number(attributes?.ApproximateNumberOfMessages ?? '0');
  const hidden = Number(attributes?.ApproximateNumberOfMessagesNotVisible ?? '0');
  if (!Number.isFinite(visible) || !Number.isFinite(hidden)) {
    return maxQueuedJobs;
  }
  return visible + hidden;
}
