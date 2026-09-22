#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AudioExtractorStack, SiteCertificateStack } from '../lib/audio-extractor-stack.js';
import { loadSiteConfig } from '../lib/site-config.js';

const config = loadSiteConfig();
const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;

const certificateStack = new SiteCertificateStack(app, 'SiteCertificateStack', {
  description: `ACM certificate for CloudFront. CloudFront requires this certificate in ${config.certificateRegion}.`,
  crossRegionReferences: true,
  config,
  env: {
    account,
    region: config.certificateRegion,
  },
});

new AudioExtractorStack(app, 'AudioExtractorStack', {
  description: `YouTube audio extractor in ${config.appRegion}.`,
  crossRegionReferences: true,
  config,
  certificate: certificateStack.certificate,
  env: {
    account,
    region: config.appRegion,
  },
});
