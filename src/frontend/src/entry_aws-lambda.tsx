import { createQwikCity, type PlatformAwsLambda } from '@builder.io/qwik-city/middleware/aws-lambda';
import qwikCityPlan from '@qwik-city-plan';
import serverless from 'serverless-http';
import { rejectUnverifiedOrigin } from './server/origin-guard';
import render from './entry.ssr';

declare global {
  type QwikCityPlatform = PlatformAwsLambda;
}

export const { handle } = createQwikCity({ render, qwikCityPlan });

const serve = serverless({ handle }, { binary: true });

export const handler = async (
  event: { headers?: Record<string, string | undefined> },
  context: Parameters<typeof serve>[1],
) => {
  const rejected = rejectUnverifiedOrigin(event.headers, process.env.ORIGIN_VERIFY_SECRET);
  if (rejected) return rejected;
  return serve(event, context);
};
