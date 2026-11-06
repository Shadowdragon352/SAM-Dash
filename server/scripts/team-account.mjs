import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import User from '../src/models/User.js';
import { privateMode, teamAllowed } from '../src/middleware/privateDemo.js';

const [action, rawEmail, ...nameParts] = process.argv.slice(2);
const email = String(rawEmail || '').trim().toLowerCase();
if (!['create', 'reset-password'].includes(action) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node server/scripts/team-account.mjs create|reset-password email "Full Name"');
  process.exit(1);
}
if (!privateMode() || !teamAllowed(email)) throw new Error('Enable PRIVATE_DEMO and add this email to TEAM_EMAILS first');
if (!process.stdin.isTTY) throw new Error('Use an interactive terminal; passwords must not be passed as command arguments');
let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
  process.stdout.write('New password (12–72 UTF-8 bytes; input hidden): ');
  muted = true;
  const password = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Use at least 12 characters and no more than 72 UTF-8 bytes');
  await mongoose.connect(process.env.MONGODB_URI);
  await User.init();
  if (action === 'create') {
    const fullName = nameParts.join(' ').trim();
    if (!fullName || fullName.length > 200) throw new Error('Provide the team member full name');
    await User.create({ email, fullName, role: 'doctor', password: await bcrypt.hash(password, 12) });
    console.log('Team account created. Share its credentials privately; never commit them.');
  } else {
    const changed = await User.updateOne({ email }, { $set: { password: await bcrypt.hash(password, 12), sessionVersion: new mongoose.Types.ObjectId().toHexString() } });
    if (!changed.matchedCount) throw new Error('Account not found');
    console.log('Password reset. Existing private-demo sessions are revoked.');
  }
} catch (error) {
  console.error(error.code === 11000 ? 'Account already exists; use reset-password if needed.' : error.message);
  process.exitCode = 1;
} finally {
  muted = false;
  prompt.close();
  await mongoose.disconnect();
}
