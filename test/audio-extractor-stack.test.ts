import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { describe, expect, it } from 'vitest';
import { AudioExtractorStack, SiteCertificateStack } from '../lib/audio-extractor-stack.js';
import type { SiteConfig } from '../lib/site-config.js';

const account = '123456789012';
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/web-lambda');
const config: SiteConfig = {
  hostedZoneId: 'Z01113202LCYIASZV1KVG',
  rootDomain: 'julian-pereira.com',
  siteDomain: 'yt-audio-extrator.julian-pereira.com',
  fromEmail: 'noreply@julian-pereira.com',
  geoCountryCode: 'MY',
  appRegion: 'ap-southeast-1',
  certificateRegion: 'us-east-1',
  queuedMessage: 'Your request is in the queue! Check your email in a few minutes',
};

function synthesize(): { app: Template; certificate: Template; region: string } {
  const app = new cdk.App();
  const certificateStack = new SiteCertificateStack(app, 'SiteCertificateStack', {
    env: { account, region: config.certificateRegion },
    crossRegionReferences: true,
    config,
  });
  const stack = new AudioExtractorStack(app, 'AudioExtractorStack', {
    env: { account, region: config.appRegion },
    crossRegionReferences: true,
    config,
    certificate: certificateStack.certificate,
    webAssetPath: fixture,
    extractorImage: (scope) =>
      lambda.DockerImageCode.fromEcr(ecr.Repository.fromRepositoryName(scope, 'ExtractorRepo', 'audio-extractor'), {
        tagOrDigest: 'test',
      }),
  });

  return {
    app: Template.fromStack(stack),
    certificate: Template.fromStack(certificateStack),
    region: stack.region,
  };
}

describe('AudioExtractorStack', () => {
  const synthesized = synthesize();
  const template = synthesized.app;

  it('runs the application in Asia Pacific (Singapore) and the certificate in us-east-1', () => {
    expect(synthesized.region).toBe('ap-southeast-1');
    expect(synthesized.certificate.toJSON()).toBeTruthy();
    synthesized.certificate.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'yt-audio-extrator.julian-pereira.com',
    });
  });

  it('allowlists Malaysia on CloudFront and signs audio downloads', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['yt-audio-extrator.julian-pereira.com'],
        IPV6Enabled: true,
        Restrictions: {
          GeoRestriction: {
            RestrictionType: 'whitelist',
            Locations: ['MY'],
          },
        },
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/audio/*',
            TrustedKeyGroups: Match.anyValue(),
          }),
        ]),
      }),
    });
    template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 1);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 0);
  });

  it('versions the audio bucket, expires objects after one day, and grants reads only to the OAI', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Status: 'Enabled',
            ExpirationInDays: 1,
            NoncurrentVersionExpiration: Match.objectLike({ NoncurrentDays: 1 }),
          }),
        ]),
      },
      PublicAccessBlockConfiguration: Match.objectLike({
        BlockPublicAcls: true,
        RestrictPublicBuckets: true,
      }),
    });

    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 's3:GetObject',
            Principal: Match.objectLike({
              CanonicalUser: Match.anyValue(),
            }),
          }),
        ]),
      },
    });
  });

  it('geolocates the A and AAAA aliases to Malaysia', () => {
    for (const type of ['A', 'AAAA']) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Type: type,
        Name: 'yt-audio-extrator.julian-pereira.com.',
        HostedZoneId: config.hostedZoneId,
        SetIdentifier: 'my',
        GeoLocation: { CountryCode: 'MY' },
      });
    }
  });

  it('queues work for the 15-minute extractor and serves Qwik with 1024 MB', () => {
    template.resourceCountIs('AWS::SQS::Queue', 1);
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 5400,
      MessageRetentionPeriod: 172800,
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: {
        ThrottlingRateLimit: 10,
        ThrottlingBurstLimit: 5,
      },
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
      ScalingConfig: { MaximumConcurrency: 50 },
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
    const logGroups = template.findResources('AWS::Logs::LogGroup');
    expect(Object.keys(logGroups).length).toBeGreaterThan(0);
    for (const group of Object.values(logGroups)) {
      expect(group.Properties).toMatchObject({ RetentionInDays: 3 });
    }
    template.resourceCountIs('AWS::SNS::Topic', 1);

    template.hasResourceProperties('AWS::Lambda::Function', {
      PackageType: 'Image',
      MemorySize: 2048,
      Timeout: 900,
      ReservedConcurrentExecutions: 50,
      EphemeralStorage: { Size: 2048 },
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      MemorySize: 1024,
      ReservedConcurrentExecutions: 50,
      Handler: 'server/entry_aws-lambda.handler',
      Environment: {
        Variables: Match.objectLike({
          QUEUED_MESSAGE: config.queuedMessage,
        }),
      },
    });
  });

  it('keeps the site behind CloudFront and limits queue, object, and email permissions', () => {
    template.resourceCountIs('AWS::Lambda::Url', 0);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Origins: Match.arrayWith([
          Match.objectLike({
            OriginCustomHeaders: Match.arrayWith([
              Match.objectLike({ HeaderName: 'X-Origin-Verify' }),
            ]),
          }),
        ]),
      }),
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['sqs:SendMessage']),
            Effect: 'Allow',
          }),
        ]),
      },
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['s3:PutObject']),
            Effect: 'Allow',
          }),
        ]),
      },
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sns:Publish',
            Effect: 'Allow',
          }),
        ]),
      },
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ses:SendEmail',
            Effect: 'Allow',
            Condition: {
              StringEquals: {
                'ses:FromAddress': 'noreply@julian-pereira.com',
              },
            },
          }),
        ]),
      },
    });

    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).not.toContain('s3:GetObject');
    expect(policies).not.toContain('"s3:*"');
    expect(policies).not.toContain('"ses:*"');
  });
});
