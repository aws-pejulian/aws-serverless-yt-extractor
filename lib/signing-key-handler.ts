/** CloudFormation custom-resource handler. Runs once and stores the CloudFront key in SSM. */
export const SIGNING_KEY_HANDLER = `
const { generateKeyPairSync } = require('crypto');
const {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParameterCommand,
} = require('@aws-sdk/client-ssm');

const legacyOriginParameter = '/yt-audio-extractor/origin-verify-secret';

exports.handler = async (event) => {
  const privateName = event.ResourceProperties.PrivateParameterName;
  const publicName = event.ResourceProperties.PublicParameterName;
  const ssm = new SSMClient({});

  const readPublicKey = async () => {
    const existing = await ssm.send(new GetParameterCommand({ Name: publicName }));
    return existing.Parameter.Value;
  };
  const forgetOriginSecret = () =>
    ssm.send(new DeleteParameterCommand({ Name: legacyOriginParameter })).catch(() => undefined);

  if (event.RequestType === 'Delete') {
    await ssm.send(new DeleteParameterCommand({ Name: privateName })).catch(() => undefined);
    await ssm.send(new DeleteParameterCommand({ Name: publicName })).catch(() => undefined);
    await forgetOriginSecret();
    return { PhysicalResourceId: privateName };
  }

  if (event.RequestType === 'Update') {
    await forgetOriginSecret();
    return { PhysicalResourceId: privateName, Data: { PublicKeyPem: await readPublicKey() } };
  }

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  try {
    await ssm.send(new PutParameterCommand({
      Name: privateName,
      Type: 'SecureString',
      Value: privateKey,
      Overwrite: false,
    }));
  } catch (error) {
    if (!error || error.name !== 'ParameterAlreadyExists') throw error;
    await forgetOriginSecret();
    return { PhysicalResourceId: privateName, Data: { PublicKeyPem: await readPublicKey() } };
  }

  await ssm.send(new PutParameterCommand({
    Name: publicName,
    Type: 'String',
    Value: publicKey,
    Overwrite: true,
  }));
  await forgetOriginSecret();

  return {
    PhysicalResourceId: privateName,
    Data: { PublicKeyPem: publicKey },
  };
};
`;
