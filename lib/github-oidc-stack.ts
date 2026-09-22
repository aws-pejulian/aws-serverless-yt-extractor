import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { GitHubConfig } from './site-config.js';

const bootstrapQualifier = 'hnb659fds';

export interface GitHubOidcStackProps extends cdk.StackProps {
  github: GitHubConfig;
}

export class GitHubOidcStack extends cdk.Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props);

    const provider = props.github.providerArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubProvider', props.github.providerArn)
      : new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'yt-audio-extractor-github-deploy',
      description: 'Assumed by GitHub Actions to deploy the CDK app.',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${props.github.repository}:ref:refs/heads/${props.github.branch}`,
        },
      }),
    });

    const account = cdk.Stack.of(this).account;
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${account}:role/cdk-${bootstrapQualifier}-deploy-role-${account}-*`,
          `arn:aws:iam::${account}:role/cdk-${bootstrapQualifier}-file-publishing-role-${account}-*`,
          `arn:aws:iam::${account}:role/cdk-${bootstrapQualifier}-image-publishing-role-${account}-*`,
          `arn:aws:iam::${account}:role/cdk-${bootstrapQualifier}-lookup-role-${account}-*`,
        ],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadCdkBootstrapVersion',
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:*:${account}:parameter/cdk-bootstrap/${bootstrapQualifier}/version`],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
  }
}
