import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'server/src/index.js'))) throw new Error('Run this from the updated dashboard repository');
const target = resolve(root, '.env');
mkdirSync(resolve(root, 'secrets'), { recursive: true });
let content = existsSync(target) ? readFileSync(target, 'utf8') : '';
const defaults = { MONGO_PASSWORD: () => randomBytes(32).toString('hex'), JWT_SECRET: () => randomBytes(48).toString('hex'), LOCAL_PORT: () => '8080', LISTEN_ADDRESS: () => '127.0.0.1', INGEST_TOKEN: () => randomBytes(32).toString('hex'), REGISTRATION_CODE: () => randomBytes(16).toString('hex'), MODEL_API_TOKEN: () => randomBytes(32).toString('hex'), COOKIE_SECURE: () => 'false', MODEL_URL: () => '' };
for (const [key, generate] of Object.entries(defaults)) {
  if (!new RegExp(`^${key}=`, 'm').test(content)) content += `${content && !content.endsWith('\n') ? '\n' : ''}${key}=${generate()}\n`;
}
writeFileSync(target, content, { mode: 0o600 });
console.log('Configuration initialized. Existing values were preserved. Read REGISTRATION_CODE from .env to create dashboard accounts.');
