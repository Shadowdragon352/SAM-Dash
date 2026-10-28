import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [hostname, emailList] = process.argv.slice(2);
const emails = String(emailList || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname || '') || !emails.length || emails.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
  console.error('Usage: node docker/init-private.mjs demo.yourdomain.com "email1@example.com,email2@example.com"');
  process.exit(1);
}
try {
  writeFileSync('.env.private', `DEMO_HOSTNAME=${hostname.toLowerCase()}\nTEAM_EMAILS=${emails.join(',')}\nMONGO_PASSWORD=${randomBytes(48).toString('hex')}\nJWT_SECRET=${randomBytes(48).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created .env.private. Existing local configuration and databases were not changed.');
} catch (error) {
  if (error.code === 'EEXIST') { console.error('.env.private already exists; edit it without regenerating database credentials.'); process.exitCode = 1; }
  else throw error;
}
