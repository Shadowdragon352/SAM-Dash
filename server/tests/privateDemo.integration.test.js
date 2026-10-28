import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

// Starts the actual production entry point against a disposable database.
test('private production server: real database login, data boundaries and password-reset revocation', { skip: !process.env.TEST_MONGODB_URI }, async () => {
  const dbName = `private_demo_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(process.env.TEST_MONGODB_URI);
  uri.pathname = `/${dbName}`;
  const origin = 'https://demo.example.com';
  const email = 'demo@example.com';
  const password = 'private-integration-password';
  let child, output = '';
  await mongoose.connect(uri.toString());
  try {
    await User.init();
    const user = await User.create({ fullName: 'Synthetic test operator', email, password: await bcrypt.hash(password, 4) });
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await new Promise(resolve => probe.once('listening', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    child = spawn(process.execPath, ['server/src/index.js'], { env: { ...process.env,
      NODE_ENV: 'production', PRIVATE_DEMO: 'true', PUBLIC_ORIGIN: origin,
      TEAM_EMAILS: email, COOKIE_SECURE: 'true', JWT_SECRET: 'private-integration-secret-'.repeat(3),
      MONGODB_URI: uri.toString(), PORT: String(port), MODEL_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', c => { output += c; });
    child.stderr.on('data', c => { output += c; });
    const base = `http://127.0.0.1:${port}`;
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(base+'/healthz')).ok; } catch { /* awaiting startup */ }
      if (healthy || child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(healthy, output);
    // The packaged entry point must serve React deep links, not the API placeholder.
    if (process.env.TEST_PRIVATE_BUILD === 'true') {
      const page = await fetch(base+'/scenario-replay');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<html/);
      assert.equal((await fetch(base+'/api/v1/unknown')).status, 404);
    }
    assert.equal((await fetch(base+'/api/v1/patients')).status, 401);
    assert.equal((await fetch(base+'/api/v1/research/devices')).status, 401);
    const signed = await fetch(base+'/api/v1/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(signed.status, 200);
    const cookieHeader = signed.headers.get('set-cookie');
    assert.match(cookieHeader, /HttpOnly/);
    assert.match(cookieHeader, /Secure/);
    assert.match(cookieHeader, /SameSite=Strict/);
    const headers = { Cookie: cookieHeader.split(';')[0], Origin: origin, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base+'/api/v1/auth/check', { headers })).status, 200);
    assert.equal((await fetch(base+'/api/v1/patients', { headers })).status, 200);
    assert.equal((await fetch(base+'/api/v1/patients', { method: 'POST', headers, body: '{}' })).status, 403);
    assert.equal((await fetch(base+'/api/v1/auth/signup', { method: 'POST', headers, body: '{}' })).status, 403);
    assert.equal((await fetch(base+'/api/v1/ingest', { method: 'POST', headers, body: '{}' })).status, 403);
    await User.updateOne({ _id: user._id }, { $set: { sessionVersion: 'reset-by-operator' } });
    assert.equal((await fetch(base+'/api/v1/auth/check', { headers })).status, 401);
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
