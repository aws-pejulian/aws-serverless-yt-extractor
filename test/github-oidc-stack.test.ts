import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { GitHubOidcStack } from '../lib/github-oidc-stack.js';

const account = '123456789012';

function template(): Template {
  const app = new cdk.App();
  const stack = new GitHubOidcStack(app, 'GitHubOidcStack', {
    env: { account, region: 'ap-southeast-1' },
    github: { repository: 'pejulian/aws-serverless-yt-extractor', branch: 'main' },
  });
  return Template.fromStack(stack);
}

describe('GitHubOidcStack', () => {
  const synthesized = template();

  it('trusts GitHub Actions for the main branch of this repository', () => {
    synthesized.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIDList: ['sts.amazonaws.com'],
    });

    synthesized.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'yt-audio-extractor-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:pejulian/aws-serverless-yt-extractor:ref:refs/heads/main',
              },
            },
          }),
        ]),
      },
    });
  });

  it('can assume the CDK bootstrap roles and read the bootstrap version', () => {
    synthesized.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Resource: Match.arrayWith([
              `arn:aws:iam::${account}:role/cdk-hnb659fds-deploy-role-${account}-*`,
              `arn:aws:iam::${account}:role/cdk-hnb659fds-image-publishing-role-${account}-*`,
            ]),
          }),
          Match.objectLike({
            Action: 'ssm:GetParameter',
            Effect: 'Allow',
          }),
        ]),
      },
    });

    const policies = JSON.stringify(synthesized.findResources('AWS::IAM::Policy'));
    expect(policies).not.toContain('AdministratorAccess');
    expect(policies).not.toContain('"s3:*"');
  });

  it('imports an existing provider instead of creating another', () => {
    const app = new cdk.App();
    const stack = new GitHubOidcStack(app, 'GitHubOidcStack', {
      env: { account, region: 'ap-southeast-1' },
      github: {
        repository: 'pejulian/aws-serverless-yt-extractor',
        branch: 'main',
        providerArn: `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`,
      },
    });
    const imported = Template.fromStack(stack);
    imported.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
  });
});