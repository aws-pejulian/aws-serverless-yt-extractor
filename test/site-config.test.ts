import { describe, expect, it } from 'vitest';
import { loadGitHubConfig, loadSiteConfig } from '../lib/site-config.js';

const complete = {
  HOSTED_ZONE_ID: 'Z01113202LCYIASZV1KVG',
  ROOT_DOMAIN: 'julian-pereira.com',
  SITE_DOMAIN: 'yt-audio-extrator.julian-pereira.com',
  FROM_EMAIL: 'noreply@julian-pereira.com',
  GEO_COUNTRY_CODE: 'MY',
  APP_REGION: 'ap-southeast-1',
  CERTIFICATE_REGION: 'us-east-1',
  QUEUED_MESSAGE: 'Your request is in the queue! Check your email in a few minutes',
};

describe('loadSiteConfig', () => {
  it('maps the sourced environment into stack settings', () => {
    expect(loadSiteConfig(complete)).toEqual({
      hostedZoneId: 'Z01113202LCYIASZV1KVG',
      rootDomain: 'julian-pereira.com',
      siteDomain: 'yt-audio-extrator.julian-pereira.com',
      fromEmail: 'noreply@julian-pereira.com',
      geoCountryCode: 'MY',
      appRegion: 'ap-southeast-1',
      certificateRegion: 'us-east-1',
      queuedMessage: 'Your request is in the queue! Check your email in a few minutes',
    });
  });

  it('rejects a missing hosted zone id', () => {
    const env = { ...complete, HOSTED_ZONE_ID: '  ' };
    expect(() => loadSiteConfig(env)).toThrow(/HOSTED_ZONE_ID/);
  });
});

describe('loadGitHubConfig', () => {
  it('reads the repository allowed to deploy', () => {
    expect(
      loadGitHubConfig({
        GITHUB_REPOSITORY: 'pejulian/aws-serverless-yt-extractor',
        GITHUB_BRANCH: 'main',
      }),
    ).toEqual({
      repository: 'pejulian/aws-serverless-yt-extractor',
      branch: 'main',
    });
  });

  it('rejects a repository that is not owner/name', () => {
    expect(() => loadGitHubConfig({ GITHUB_REPOSITORY: 'pejulian', GITHUB_BRANCH: 'main' })).toThrow(
      /owner\/name/,
    );
  });
});