import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DOWNLOAD_TTL_SECONDS } from '../shared/constants.js';
import type { ExtractionNotice } from '../shared/notice.js';
import { parseSubmission } from '../shared/submission.js';
import { processExtraction, type ExtractorDeps, type ExtractionResult } from './extractor.js';
import { runProcess } from './process.js';
import { signCloudFrontDownload } from './sign-url.js';

interface SqsRecord {
  messageId: string;
  body: string;
}

export interface SqsExtractionEvent {
  Records?: SqsRecord[];
}

export function createDeps(env: NodeJS.ProcessEnv = process.env): ExtractorDeps {
  const bucket = env.BUCKET_NAME;
  const topicArn = env.TOPIC_ARN;
  const keyPairId = env.KEY_PAIR_ID;
  const parameterName = env.SIGNING_PARAMETER_NAME;
  const baseUrl = env.DOWNLOAD_BASE_URL;
  if (!bucket || !topicArn || !keyPairId || !parameterName || !baseUrl) {
    throw new Error('BUCKET_NAME, TOPIC_ARN, KEY_PAIR_ID, SIGNING_PARAMETER_NAME, and DOWNLOAD_BASE_URL are required.');
  }

  const s3 = new S3Client({});
  const sns = new SNSClient({});
  const ssm = new SSMClient({});
  let privateKey: string | undefined;

  return {
    run: runProcess,
    open: (filePath) => createReadStream(filePath),
    remove: async (filePath) => {
      await unlink(filePath).catch(() => undefined);
    },
    s3,
    publish: async (notice: ExtractionNotice) => {
      await sns.send(
        new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(notice),
        }),
      );
    },
    signDownloadUrl: async (objectKey, expiresInSeconds = DOWNLOAD_TTL_SECONDS) => {
      privateKey ??= await loadPrivateKey(ssm, parameterName);
      return signCloudFrontDownload({
        baseUrl,
        objectKey,
        keyPairId,
        privateKey,
        expiresInSeconds,
      });
    },
    claim: (messageId) => claimJob(s3, bucket, messageId),
    uuid: randomUUID,
    bucket,
    ytDlpBin: env.YT_DLP_BIN,
    ffmpegBin: env.FFMPEG_BIN,
  };
}

export async function handler(
  event: SqsExtractionEvent,
  deps: ExtractorDeps = createDeps(),
): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records ?? []) {
    try {
      const claimed = deps.claim ? await deps.claim(record.messageId) : true;
      if (!claimed) {
        continue;
      }
      await processExtraction(JSON.parse(record.body) as unknown, deps);
    } catch {
      await emailFailure(record.body, deps);
    }
  }

  return { batchItemFailures };
}

async function claimJob(s3: S3Client, bucket: string, messageId: string): Promise<boolean> {
  const safeId = messageId.replace(/[^A-Za-z0-9_-]/g, '_');
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `audio/claims/${safeId}`,
        Body: '',
        IfNoneMatch: '*',
      }),
    );
    return true;
  } catch (error) {
    if (isAlreadyClaimed(error)) {
      return false;
    }
    throw error;
  }
}

function isAlreadyClaimed(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'PreconditionFailed' || candidate.$metadata?.httpStatusCode === 412;
}

async function emailFailure(body: string, deps: ExtractorDeps): Promise<void> {
  try {
    const submission = parseSubmission(JSON.parse(body) as { youtubeUrl?: unknown; email?: unknown });
    await deps.publish({
      email: submission.email,
      status: 'failed',
      detail: 'Audio extraction failed.',
    });
  } catch {
    // The address is unusable or the notification could not be published. The queue message is still deleted.
  }
}

async function loadPrivateKey(ssm: SSMClient, name: string): Promise<string> {
  const result = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error('CloudFront signing key is missing.');
  }
  return value;
}

export type { ExtractionResult };
