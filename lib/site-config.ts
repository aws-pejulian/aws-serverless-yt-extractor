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

export interface GitHubConfig {
  repository: string;
  branch: string;
  /** Set when this account already has a GitHub OIDC provider. */
  providerArn?: string;
}

/** Repository allowed to assume the deploy role, for example `owner/name`. */
export function loadGitHubConfig(env: NodeJS.ProcessEnv = process.env): GitHubConfig {
  const repository = env.GITHUB_REPOSITORY?.trim() ?? '';
  const branch = env.GITHUB_BRANCH?.trim() ?? '';
  const missing = [
    repository ? undefined : 'GITHUB_REPOSITORY',
    branch ? undefined : 'GITHUB_BRANCH',
  ].filter((name): name is string => name !== undefined);

  if (missing.length > 0) {
    throw new Error(`Missing configuration: ${missing.join(', ')}. Source .env before starting the CDK app.`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must look like owner/name.');
  }

  const providerArn = env.GITHUB_OIDC_PROVIDER_ARN?.trim();
  return { repository, branch, ...(providerArn ? { providerArn } : {}) };
}
