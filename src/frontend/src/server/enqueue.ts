import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { parseSubmission, SubmissionError } from '../../../shared/submission.js';

export interface QueueSender {
  send(command: SendMessageCommand): Promise<unknown>;
}

export interface QueueResult {
  ok: boolean;
  status: number;
  message: string;
}

export async function submitExtraction(
  form: { youtubeUrl?: unknown; email?: unknown },
  deps: { queueUrl: string | undefined; queuedMessage: string | undefined; client: QueueSender },
): Promise<QueueResult> {
  let submission;
  try {
    submission = parseSubmission(form);
  } catch (error) {
    const message = error instanceof SubmissionError ? error.message : 'Check the form and try again.';
    return { ok: false, status: 400, message };
  }

  if (!deps.queueUrl || !deps.queuedMessage) {
    return { ok: false, status: 500, message: 'Queue is not configured.' };
  }

  await deps.client.send(
    new SendMessageCommand({
      QueueUrl: deps.queueUrl,
      MessageBody: JSON.stringify(submission),
    }),
  );

  return { ok: true, status: 202, message: deps.queuedMessage };
}
