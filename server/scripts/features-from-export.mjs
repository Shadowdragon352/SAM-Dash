// Offline research features: node server/scripts/features-from-export.mjs events.ndjson <cutoff-epoch-ms>
import { readFileSync } from 'node:fs';
import { buildFeatures } from '../src/delirium/features.js';
const [file, cutoff] = process.argv.slice(2);
const asOf = Number(cutoff);
if (!file || !Number.isSafeInteger(asOf) || asOf <= 86400000) throw new Error('Supply one patient export and a cutoff in epoch milliseconds');
const records = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const events = records.filter(r => r.record_type === 'event');
if (new Set(events.map(e => String(e.patientId))).size > 1) throw new Error('Use one patient export at a time to avoid mixing patients');
console.log(JSON.stringify(buildFeatures(events, asOf), null, 2));
