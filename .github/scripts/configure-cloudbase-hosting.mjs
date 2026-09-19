import CloudBase from '@cloudbase/manager-node';

const required = ['TCB_ENV_ID', 'TCB_SECRET_ID', 'TCB_SECRET_KEY'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error('Missing required environment variable: ' + name);
  }
}

const cloudbase = new CloudBase({
  secretId: process.env.TCB_SECRET_ID,
  secretKey: process.env.TCB_SECRET_KEY,
  envId: process.env.TCB_ENV_ID,
});

const result = await cloudbase.hosting.setWebsiteDocument({
  indexDocument: 'index.html',
  errorDocument: 'index.html',
});

if (result?.statusCode !== 200) {
  throw new Error('CloudBase setWebsiteDocument failed: ' + JSON.stringify(result));
}

console.log('CloudBase website document configured: index.html / index.html');
