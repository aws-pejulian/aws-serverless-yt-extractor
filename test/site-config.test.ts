import { describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../lib/site-config.js';

const complete = {
  HOSTED_ZONE_ID: 'Z01113202LCYIASZV1KVG',
  ROOT_DOMAIN: 'julian-pereira.com',
  SITE_DOMAIN: 'yt-audio-extractor.julian-pereira.com',
  FROM_EMAIL: 'noreply@julian-pereira.com',
  GEO_COUNTRY_CODE: 'MY',
  APP_REGION: 'ap-southeast-1',
  CERTIFICATE_REGION: 'us-east-1',
};

describe('loadSiteConfig', () => {
  it('maps the sourced environment into stack settings', () => {
    expect(loadSiteConfig(complete)).toEqual({
      hostedZoneId: 'Z01113202LCYIASZV1KVG',
      rootDomain: 'julian-pereira.com',
      siteDomain: 'yt-audio-extractor.julian-pereira.com',
      fromEmail: 'noreply@julian-pereira.com',
      geoCountryCode: 'MY',
      appRegion: 'ap-southeast-1',
      certificateRegion: 'us-east-1',
    });
  });

  it('rejects a missing hosted zone id', () => {
    const env = { ...complete, HOSTED_ZONE_ID: '  ' };
    expect(() => loadSiteConfig(env)).toThrow(/HOSTED_ZONE_ID/);
  });
});