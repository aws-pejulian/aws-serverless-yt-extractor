import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

export function signCloudFrontDownload(input: {
  baseUrl: string;
  objectKey: string;
  keyPairId: string;
  privateKey: string;
  expiresInSeconds: number;
  now?: Date;
}): string {
  const base = input.baseUrl.replace(/\/$/, '');
  const expiresAt = new Date((input.now ?? new Date()).getTime() + input.expiresInSeconds * 1000);
  return getSignedUrl({
    url: `${base}/${input.objectKey}`,
    keyPairId: input.keyPairId,
    privateKey: input.privateKey,
    dateLessThan: expiresAt,
    algorithm: 'SHA256',
  });
}
