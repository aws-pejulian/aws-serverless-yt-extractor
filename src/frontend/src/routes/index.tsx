import { component$ } from '@builder.io/qwik';
import { Form, routeAction$, type DocumentHead } from '@builder.io/qwik-city';
import { ExtractForm } from '~/components/extract-form';

export const useExtractAction = routeAction$(async (data, event) => {
  const { submitExtraction } = await import('../server/enqueue');
  const { consumeDailyJob } = await import('../server/daily-quota');
  const { SQSClient } = await import('@aws-sdk/client-sqs');
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const quota = new DynamoDBClient({});
  const result = await submitExtraction(
    { youtubeUrl: data.youtubeUrl, email: data.email },
    {
      queueUrl: process.env.QUEUE_URL,
      client: new SQSClient({}),
      consumeDailyJob: () => consumeDailyJob(process.env.QUOTA_TABLE_NAME, quota),
    },
  );
  event.status(result.status);
  return { ok: result.ok, message: result.message };
});

export default component$(() => {
  const action = useExtractAction();
  const result = action.value;

  return (
    <main class="panel">
      <p class="eyebrow">Malaysia</p>
      <h1>Audio extractor</h1>
      <p class="lede">
        Paste a YouTube link and an email address. A valid request is queued immediately, and the
        download link arrives by email.
      </p>
      <Form action={action} class="extract-form">
        <ExtractForm pending={action.isRunning} />
      </Form>
      {result?.message && (
        <p class="status" role="status" data-ok={String(result.ok)}>
          {result.message}
        </p>
      )}
      <p class="fine-print">The audio file is deleted from storage after 24 hours.</p>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'YouTube Audio Extractor',
  meta: [
    {
      name: 'description',
      content: 'Extract audio from a YouTube video and receive a 24-hour download link by email.',
    },
  ],
};
