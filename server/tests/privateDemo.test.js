import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import authRoutes from '../src/routes/authRoutes.js';
import patientRoutes from '../src/routes/patientRoutes.js';
import { researchRouter, ingestRouter } from '../src/delirium/routes.js';
import protectedRoute from '../src/middleware/auth.middleware.js';
import errorHandler from '../src/utils/errorHandler.js';
import { assertPrivateConfig, demoBoundary, securityHeaders, teamAllowed, loginLimiter } from '../src/middleware/privateDemo.js';

const valid = { PRIVATE_DEMO: 'true', TEAM_EMAILS: 'ovy@example.com, TEAM@example.com', PUBLIC_ORIGIN: 'https://demo.example.com', COOKIE_SECURE: 'true', JWT_SECRET: 'test-secret-'.repeat(5) };

test('private deployment rejects unsafe or incomplete configuration', () => {
  assert.doesNotThrow(() => assertPrivateConfig(valid));
  for (const patch of [{ TEAM_EMAILS: '' }, { TEAM_EMAILS: 'invalid' }, { PUBLIC_ORIGIN: 'http://demo.example.com' }, { PUBLIC_ORIGIN: 'https://demo.example.com/' }, { COOKIE_SECURE: 'false' }, { JWT_SECRET: 'short' }, { MODEL_URL: 'http://model:8000' }]) {
    assert.throws(() => assertPrivateConfig({ ...valid, ...patch }));
  }
  assert.equal(teamAllowed(' TEAM@example.COM ', valid), true);
  assert.equal(teamAllowed('outsider@example.com', valid), false);
});

test('private HTTP access: signup blocked, cookie security, origin, expiry, revocation and demo write restrictions', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, valid);
  const findOne = User.findOne, findById = User.findById;
  let queries = 0;
  const id = '0123456789abcdef01234567';
  const password = 'private-test-password';
  const doc = { _id: id, fullName: 'Demo team member', email: 'ovy@example.com', role: 'doctor', sessionVersion: 'version-one', password: await bcrypt.hash(password, 4) };
  User.findOne = async () => { queries++; return { ...doc, _doc: doc }; };
  User.findById = () => ({ select: async () => ({ ...doc, _doc: { ...doc, password: undefined } }) });
  const app = express();
  app.use(securityHeaders, demoBoundary, express.json(), cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/patients', patientRoutes);
  app.use('/api/v1/research', researchRouter);
  app.use('/api/v1', ingestRouter);
  app.get('/api/v1/team-test', protectedRoute, (req, res) => res.json({ email: req.user.email }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = 'GET', body, cookie, origin = valid.PUBLIC_ORIGIN } = {}) => fetch(base+path, { method,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call('/api/v1/patients')).status, 401);
    assert.equal((await call('/api/v1/research/devices')).status, 401);
    assert.equal((await call('/api/v1/auth/signup', { method: 'POST', body: { registrationCode: 'even-a-valid-old-code' } })).status, 403);
    for (const origin of ['https://other.example.com', '']) assert.equal((await call('/api/v1/auth/login', { method: 'POST', origin, body: { email: doc.email, password } })).status, 403);
    const before = queries;
    assert.equal((await call('/api/v1/auth/login', { method: 'POST', body: { email: 'outsider@example.com', password } })).status, 400);
    assert.equal(queries, before);
    assert.equal((await call('/api/v1/auth/login', { method: 'POST', body: { email: doc.email, password: 'incorrect' } })).status, 400);
    const signed = await call('/api/v1/auth/login', { method: 'POST', body: { email: doc.email, password } });
    assert.equal(signed.status, 200);
    const header = signed.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(header.includes(flag));
    assert.equal((await signed.json()).password, undefined);
    assert.equal(signed.headers.get('cache-control'), 'no-store');
    assert.ok(signed.headers.get('content-security-policy').includes("connect-src 'self'"));
    const cookie = header.split(';')[0];
    assert.equal((await call('/api/v1/team-test', { cookie })).status, 200);
    assert.equal((await call('/api/v1/patients', { method: 'POST', cookie, body: { name: 'real records forbidden' } })).status, 403);
    assert.equal((await call('/api/v1/ingest', { method: 'POST', body: { events: [] } })).status, 403);
    assert.equal((await call('/API/v1/device-assignment/')).status, 403);
    process.env.TEAM_EMAILS = 'team@example.com';
    assert.equal((await call('/api/v1/team-test', { cookie })).status, 403);
    process.env.TEAM_EMAILS = valid.TEAM_EMAILS;
    doc.sessionVersion = 'version-two';
    assert.equal((await call('/api/v1/team-test', { cookie })).status, 401);
    const legacy = jwt.sign({ userId: id }, valid.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await call('/api/v1/team-test', { cookie: `token=${legacy}` })).status, 401);
    const expired = jwt.sign({ userId: id, sessionVersion: doc.sessionVersion }, valid.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await call('/api/v1/team-test', { cookie: `token=${expired}` })).status, 401);
  } finally {
    User.findOne = findOne; User.findById = findById;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await new Promise(resolve => server.close(resolve));
  }
});

test('login limiter returns Retry-After and allows access after the window expires', async () => {
  let now = 100;
  const app = express();
  app.use(loginLimiter({ limit: 2, windowMs: 1000, now: () => now }));
  app.get('/', (req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    const blocked = await fetch(url);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '1');
    now = 1100;
    assert.equal((await fetch(url)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
