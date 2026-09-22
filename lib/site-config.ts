export interface SiteConfig {
  hostedZoneId: string;
  rootDomain: string;
  siteDomain: string;
  fromEmail: string;
  geoCountryCode: string;
  appRegion: string;
  certificateRegion: string;
  queuedMessage: string;
}

const fields = {
  hostedZoneId: 'HOSTED_ZONE_ID',
  rootDomain: 'ROOT_DOMAIN',
  siteDomain: 'SITE_DOMAIN',
  fromEmail: 'FROM_EMAIL',
  geoCountryCode: 'GEO_COUNTRY_CODE',
  appRegion: 'APP_REGION',
  certificateRegion: 'CERTIFICATE_REGION',
  queuedMessage: 'QUEUED_MESSAGE',
} as const satisfies Record<keyof SiteConfig, string>;

/** Reads site settings from the process environment. The CDK app sources `.env` first. */
export function loadSiteConfig(env: NodeJS.ProcessEnv = process.env): SiteConfig {
  const missing: string[] = [];
  const config = {} as SiteConfig;

  for (const [field, name] of Object.entries(fields) as [keyof SiteConfig, string][]) {
    const value = env[name]?.trim();
    if (!value) {
      missing.push(name);
      continue;
    }
    config[field] = value;
  }

  if (missing.length > 0) {
    throw new Error(`Missing configuration: ${missing.join(', ')}. Source .env before starting the CDK app.`);
  }

  return config;
}
