import AppError from '../utils/AppError.js';

export const privateMode = (env = process.env) => env.PRIVATE_DEMO === 'true';
export const liveDemoDevice = (env = process.env) => privateMode(env) ? env.DEMO_LIVE_DEVICE_ID?.trim() : undefined;
export const teamEmails = (env = process.env) => new Set((env.TEAM_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
export const teamAllowed = (email, env = process.env) => !privateMode(env) || teamEmails(env).has(String(email || '').trim().toLowerCase());

export function assertPrivateConfig(env = process.env) {
  if (!privateMode(env)) return;
  let origin;
  try { origin = new URL(env.PUBLIC_ORIGIN); } catch { throw new Error('Private demo requires PUBLIC_ORIGIN'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN must be one HTTPS origin without a trailing slash');
  if (env.COOKIE_SECURE !== 'true') throw new Error('Private demo requires COOKIE_SECURE=true');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('Private demo requires a JWT_SECRET of at least 32 characters');
  if (!teamEmails(env).size || [...teamEmails(env)].some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Set TEAM_EMAILS to the approved team email addresses');
  if (env.MODEL_URL) throw new Error('Private demo must keep MODEL_URL empty');
}

export function demoBoundary(req, res, next) {
  if (!privateMode()) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  // The opted-in upload route uses a scoped Bearer credential, independent of browser sessions.
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  if (path === '/api/v1/ingest' && req.method === 'POST' && liveDemoDevice()) return next();
  if (path === '/api/v1/ingest' || path === '/api/v1/device-assignment') return next(new AppError('Live device integration is disabled in this demo', 403));
  const authMutation = ['/api/v1/auth/login', '/api/v1/auth/logout', '/api/v1/auth/signup'].includes(path);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !authMutation) return next(new AppError('This demonstration is read only; use scenario replay', 403));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== process.env.PUBLIC_ORIGIN) return next(new AppError('Request origin is not allowed', 403));
  next();
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (privateMode()) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
}

// One Node worker only. Bounded memory, reset on restart; not a distributed WAF.
export function loginLimiter({ limit = 10, windowMs = 15 * 60_000, capacity = 10_000, now = Date.now } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const time = now();
    const key = req.ip || 'unknown';
    for (const [ip, entry] of attempts) if (entry.until <= time) attempts.delete(ip);
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= capacity) return res.status(429).set('Retry-After', '60').json({ success: false, message: 'Please try again later' });
      entry = { count: 0, until: time + windowMs };
      attempts.set(key, entry);
    }
    if (++entry.count > limit) return res.status(429).set('Retry-After', String(Math.max(1, Math.ceil((entry.until - time) / 1000)))).json({ success: false, message: 'Too many sign-in attempts. Try again later.' });
    next();
  };
}
