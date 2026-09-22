import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { ExtractionNotice } from '../shared/notice.js';

export async function deliverNotice(
  raw: string,
  deps: { fromEmail: string; send: (command: SendEmailCommand) => Promise<unknown> },
): Promise<void> {
  const notice = parseNotice(raw);
  if (!notice) {
    return;
  }
  await deps.send(emailForNotice(notice, deps.fromEmail));
}

export function emailForNotice(notice: ExtractionNotice, fromEmail: string): SendEmailCommand {
  const ready = notice.status === 'ready' && notice.downloadUrl;
  return new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [notice.email] },
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: ready ? 'Your audio download is ready' : 'Audio extraction failed',
      },
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: ready
            ? [
                'Your audio file is ready.',
                '',
                'Download link (expires in 24 hours):',
                notice.downloadUrl,
                '',
                'The file is removed from storage after 24 hours.',
              ].join('\n')
            : `We could not extract audio from that YouTube URL.\n\n${notice.detail ?? 'Audio extraction failed.'}\n\nNo download link was created.`,
        },
      },
    },
  });
}

export async function handler(
  event: { Records?: { Sns?: { Message?: string } }[] },
  deps?: { fromEmail: string; send: (command: SendEmailCommand) => Promise<unknown> },
): Promise<void> {
  const runtime =
    deps ??
    {
      fromEmail: requiredEnv('FROM_EMAIL'),
      send: (command: SendEmailCommand) => new SESClient({}).send(command),
    };

  for (const record of event.Records ?? []) {
    const message = record.Sns?.Message;
    if (message) {
      await deliverNotice(message, runtime);
    }
  }
}

function parseNotice(raw: string): ExtractionNotice | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const notice = parsed as Partial<ExtractionNotice>;
  if (notice.status !== 'ready' && notice.status !== 'failed') {
    return undefined;
  }
  if (typeof notice.email !== 'string' || !notice.email.includes('@')) {
    return undefined;
  }
  return {
    email: notice.email,
    status: notice.status,
    downloadUrl: typeof notice.downloadUrl === 'string' ? notice.downloadUrl : undefined,
    detail: typeof notice.detail === 'string' ? notice.detail : undefined,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
