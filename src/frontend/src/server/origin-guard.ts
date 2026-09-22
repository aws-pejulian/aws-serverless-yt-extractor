export interface OriginRejection {
  statusCode: 403;
  body: string;
  headers: { 'content-type': 'text/plain' };
}

const rejection: OriginRejection = {
  statusCode: 403,
  body: 'Forbidden',
  headers: { 'content-type': 'text/plain' },
};

/** Rejects requests that did not come through CloudFront. */
export function rejectUnverifiedOrigin(
  headers: Record<string, string | undefined> | undefined,
  secret: string | undefined,
): OriginRejection | undefined {
  if (!secret || headerValue(headers, 'x-origin-verify') !== secret) {
    return rejection;
  }
  return undefined;
}

function headerValue(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return match?.[1];
}
