/** CloudFormation custom-resource handler. Runs once and stores the CloudFront key in SSM. */
export const SIGNING_KEY_HANDLER = `
const { generateKeyPairSync } = require('crypto');
const {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParameterCommand,
} = require('@aws-sdk/client-ssm');

exports.handler = async (event) => {
  const privateName = event.ResourceProperties.PrivateParameterName;
  const publicName = event.ResourceProperties.PublicParameterName;
  const originName = event.ResourceProperties.OriginParameterName;
  const ssm = new SSMClient({});

  const read = async (name) => {
    const existing = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    return existing.Parameter.Value;
  };
  const data = async () => ({ PublicKeyPem: await read(publicName), OriginVerifySecret: await read(originName) });

  if (event.RequestType === 'Delete') {
    await ssm.send(new DeleteParameterCommand({ Name: privateName })).catch(() => undefined);
    await ssm.send(new DeleteParameterCommand({ Name: publicName })).catch(() => undefined);
    await ssm.send(new DeleteParameterCommand({ Name: originName })).catch(() => undefined);
    return { PhysicalResourceId: privateName };
  }

  if (event.RequestType === 'Update') {
    return { PhysicalResourceId: privateName, Data: await data() };
  }

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const originSecret = require('crypto').randomBytes(32).toString('hex');

  try {
    await ssm.send(new PutParameterCommand({
      Name: privateName,
      Type: 'SecureString',
      Value: privateKey,
      Overwrite: false,
    }));
  } catch (error) {
    if (!error || error.name !== 'ParameterAlreadyExists') throw error;
    return { PhysicalResourceId: privateName, Data: await data() };
  }

  await ssm.send(new PutParameterCommand({
    Name: publicName,
    Type: 'String',
    Value: publicKey,
    Overwrite: true,
  }));
  await ssm.send(new PutParameterCommand({
    Name: originName,
    Type: 'SecureString',
    Value: originSecret,
    Overwrite: true,
  }));

  return {
    PhysicalResourceId: privateName,
    Data: { PublicKeyPem: publicKey, OriginVerifySecret: originSecret },
  };
};
`;
