import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cr from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import { SIGNING_KEY_HANDLER } from './signing-key-handler.js';
import type { SiteConfig } from './site-config.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateKeyParameter = '/yt-audio-extractor/cloudfront-private-key';
const publicKeyParameter = '/yt-audio-extractor/cloudfront-public-key';
export interface SiteCertificateStackProps extends cdk.StackProps {
  config: SiteConfig;
}

export class SiteCertificateStack extends cdk.Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: SiteCertificateStackProps) {
    super(scope, id, props);

    const zone = importedZone(this, 'Zone', props.config);

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.config.siteDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}

export interface AudioExtractorStackProps extends cdk.StackProps {
  config: SiteConfig;
  certificate: acm.ICertificate;
  /**
   * Test hook. Production leaves this unset and builds src/backend/Dockerfile.
   */
  extractorImage?: (scope: Construct) => lambda.DockerImageCode;
  /** Directory containing the Qwik `server/` and `dist/` bundles. */
  webAssetPath?: string;
}

export class AudioExtractorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AudioExtractorStackProps) {
    super(scope, id, props);

    const { config } = props;
    const zone = importedZone(this, 'Zone', config);

    const audioBucket = new s3.Bucket(this, 'AudioBucket', {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          id: 'expire-audio-after-one-day',
          enabled: true,
          expiration: cdk.Duration.days(1),
          noncurrentVersionExpiration: cdk.Duration.days(1),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'AudioOai', {
      comment: `CloudFront reads audio for ${config.siteDomain}`,
    });
    const audioOrigin = origins.S3BucketOrigin.withOriginAccessIdentity(audioBucket, {
      originAccessIdentity,
    });

    const signingKey = this.createSigningKey();
    const publicKey = new cloudfront.PublicKey(this, 'DownloadPublicKey', {
      encodedKey: signingKey.getAttString('PublicKeyPem'),
    });
    const keyGroup = new cloudfront.KeyGroup(this, 'DownloadKeyGroup', {
      items: [publicKey],
    });

    const topic = new sns.Topic(this, 'ExtractionTopic');
    const extractorTimeout = cdk.Duration.minutes(15);
    // Six times the function timeout. The message stays hidden for the whole run,
    // so a second poller cannot start the same job while the first one is working.
    const queueVisibility = cdk.Duration.minutes(15 * 6);
    const queue = new sqs.Queue(this, 'ExtractionQueue', {
      visibilityTimeout: queueVisibility,
      retentionPeriod: cdk.Duration.days(2),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const identity = new ses.EmailIdentity(this, 'DomainIdentity', {
      identity: ses.Identity.publicHostedZone(zone),
    });

    const extractorLogGroup = new logs.LogGroup(this, 'ExtractorLogs', {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Qwik accepts the form, SQS holds the job, the container Lambda extracts,
    // and SNS wakes a notifier that sends the email. Step Functions is unnecessary
    // for this straight-line pipeline.
    const extractor = new lambda.DockerImageFunction(this, 'Extractor', {
      code:
        props.extractorImage?.(this) ??
        lambda.DockerImageCode.fromImageAsset(projectRoot, {
          file: 'src/backend/Dockerfile',
          platform: ecrAssets.Platform.LINUX_AMD64,
          exclude: ['node_modules', 'cdk.out', 'build', 'dist', 'coverage', 'src/frontend', 'test', '.git'],
        }),
      architecture: lambda.Architecture.X86_64,
      memorySize: 2048,
      ephemeralStorageSize: cdk.Size.mebibytes(2048),
      timeout: extractorTimeout,
      reservedConcurrentExecutions: 10,
      logGroup: extractorLogGroup,
      environment: {
        BUCKET_NAME: audioBucket.bucketName,
        TOPIC_ARN: topic.topicArn,
        KEY_PAIR_ID: publicKey.publicKeyId,
        SIGNING_PARAMETER_NAME: privateKeyParameter,
        DOWNLOAD_BASE_URL: `https://${config.siteDomain}`,
      },
      description: 'Polls SQS, extracts YouTube audio, and publishes a CloudFront signed URL to SNS.',
    });

    extractor.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 1,
        maxConcurrency: 10,
        reportBatchItemFailures: true,
      }),
    );

    extractor.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'UploadAudio',
        actions: ['s3:PutObject', 's3:AbortMultipartUpload'],
        resources: [audioBucket.arnForObjects('audio/*')],
      }),
    );
    topic.grantPublish(extractor);
    extractor.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ReadSigningKey',
        actions: ['ssm:GetParameter'],
        resources: [ssmParameterArn(this, privateKeyParameter)],
      }),
    );
    extractor.addToRolePolicy(ssmEncryptionStatement());

    const notifierLogGroup = new logs.LogGroup(this, 'NotifierLogs', {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const notifier = new NodejsFunction(this, 'Notifier', {
      entry: path.join(projectRoot, 'src/notify/handler.ts'),
      runtime: lambda.Runtime.NODEJS_24_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(15),
      logGroup: notifierLogGroup,
      environment: { FROM_EMAIL: config.fromEmail },
      bundling: {
        format: OutputFormat.ESM,
        target: 'node24',
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
      description: 'Sends the download email after the extraction topic fires.',
    });
    topic.addSubscription(new LambdaSubscription(notifier));
    notifier.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'SendDownloadEmail',
        actions: ['ses:SendEmail'],
        resources: [identity.emailIdentityArn],
        conditions: {
          StringEquals: {
            'ses:FromAddress': config.fromEmail,
          },
        },
      }),
    );

    const jobQuota = new dynamodb.Table(this, 'JobQuota', {
      partitionKey: { name: 'day', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const webLogGroup = new logs.LogGroup(this, 'WebLogs', {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const web = new lambda.Function(this, 'Web', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'server/entry_aws-lambda.handler',
      code: lambda.Code.fromAsset(props.webAssetPath ?? path.join(projectRoot, 'build/web-lambda')),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      reservedConcurrentExecutions: 50,
      logGroup: webLogGroup,
      environment: {
        QUEUE_URL: queue.queueUrl,
        QUOTA_TABLE_NAME: jobQuota.tableName,
      },
      description: 'Qwik SSR frontend. Validates a request and enqueues it.',
    });
    queue.grantSendMessages(web);
    queue.grant(web, 'sqs:GetQueueAttributes');
    jobQuota.grant(web, 'dynamodb:UpdateItem');

    // IAM auth plus CloudFront origin access control. A direct call to the
    // function URL has no CloudFront signature, so Lambda rejects it.
    const webUrl = web.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });
    const webOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(webUrl);
    const webOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'WebOriginRequest', {
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.denyList('host', 'authorization'),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      certificate: props.certificate,
      domainNames: [config.siteDomain],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: false,
      geoRestriction: cloudfront.GeoRestriction.allowlist(config.geoCountryCode),
      defaultBehavior: {
        origin: webOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: webOriginRequestPolicy,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        '/build/*': {
          origin: webOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: webOriginRequestPolicy,
        },
        '/audio/*': {
          origin: audioOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          trustedKeyGroups: [keyGroup],
        },
      },
    });

    const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    const geoLocation = route53.GeoLocation.country(config.geoCountryCode);
    new route53.ARecord(this, 'SiteA', {
      zone,
      recordName: config.siteDomain,
      target: aliasTarget,
      geoLocation,
      setIdentifier: config.geoCountryCode.toLowerCase(),
    });

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${config.siteDomain}` });
    new cdk.CfnOutput(this, 'AudioBucketName', { value: audioBucket.bucketName });
    new cdk.CfnOutput(this, 'ExtractionQueueUrl', { value: queue.queueUrl });
  }

  private createSigningKey(): cdk.CustomResource {
    const signingLogGroup = new logs.LogGroup(this, 'SigningKeyLogs', {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const signingFn = new lambda.Function(this, 'SigningKeyFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(SIGNING_KEY_HANDLER),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      logGroup: signingLogGroup,
      description: 'Creates the CloudFront signing key and stores the private key in SSM.',
    });
    const parameterArn = ssmParameterArn(this, '/yt-audio-extractor/*');
    signingFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:GetParameter', 'ssm:DeleteParameter'],
        resources: [parameterArn],
      }),
    );
    signingFn.addToRolePolicy(ssmEncryptionStatement());

    const providerLogGroup = new logs.LogGroup(this, 'SigningKeyProviderLogs', {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const provider = new cr.Provider(this, 'SigningKeyProvider', {
      onEventHandler: signingFn,
      logGroup: providerLogGroup,
    });
    return new cdk.CustomResource(this, 'SigningKey', {
      serviceToken: provider.serviceToken,
      properties: {
        PrivateParameterName: privateKeyParameter,
        PublicParameterName: publicKeyParameter,
      },
    });
  }
}

function importedZone(scope: Construct, id: string, config: SiteConfig): route53.IPublicHostedZone {
  return route53.PublicHostedZone.fromPublicHostedZoneAttributes(scope, id, {
    hostedZoneId: config.hostedZoneId,
    zoneName: config.rootDomain,
  });
}

function ssmParameterArn(stack: cdk.Stack, name: string): string {
  const pathName = name.replace(/^\//, '');
  return stack.formatArn({
    service: 'ssm',
    resource: 'parameter',
    resourceName: pathName,
    arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
  });
}

function ssmEncryptionStatement(): iam.PolicyStatement {
  return new iam.PolicyStatement({
    actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
    resources: ['*'],
    conditions: {
      StringEquals: {
        'kms:ViaService': `ssm.${cdk.Aws.REGION}.amazonaws.com`,
      },
    },
  });
}
