import { createQwikCity, type PlatformAwsLambda } from '@builder.io/qwik-city/middleware/aws-lambda';
import qwikCityPlan from '@qwik-city-plan';
import serverless from 'serverless-http';
import render from './entry.ssr';

declare global {
  type QwikCityPlatform = PlatformAwsLambda;
}

export const { handle } = createQwikCity({ render, qwikCityPlan });

const serve = serverless({ handle }, { binary: true });

export const handler = (
  event: Parameters<typeof serve>[0],
  context: Parameters<typeof serve>[1],
) => serve(event, context);
