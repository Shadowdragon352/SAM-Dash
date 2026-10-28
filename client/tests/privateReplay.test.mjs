import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const parserUrl = moduleUrl(compile(readFileSync(new URL('../src/lib/scenarioReplay.ts', import.meta.url), 'utf8')));
const fixtures = compile(readFileSync(new URL('../src/data/demoReplay.ts', import.meta.url), 'utf8')).replace("'@/lib/scenarioReplay'", JSON.stringify(parserUrl));
const { builtInReplay } = await import(moduleUrl(fixtures));
const { replayMessages } = await import(parserUrl);

test('private demo starts with five synthetic scenarios and preserves intended transitions', () => {
  const rows = builtInReplay();
  assert.equal(rows.length, 60);
  assert.equal(new Set(rows.map(r => r.scenario_id)).size, 5);
  assert.ok(rows.every(r => r.clinical_prediction === false && r.source_record_id === 'SYNTHETIC-NO-SOURCE'));
  const sample = (scenario, hour) => rows.find(r => r.scenario_id === scenario && r.hour === hour);
  assert.ok(replayMessages(sample('baseline_change', 6)).every(m => !m.includes('Reassessment')));
  assert.ok(replayMessages(sample('baseline_change', 7)).some(m => m.includes('Reassessment')));
  assert.ok(replayMessages(sample('baseline_unavailable', 1)).some(m => m.includes('Baseline information needed')));
  assert.equal(sample('sensor_dropout', 7).heart_rate_bpm, null);
  assert.ok(replayMessages(sample('sensor_dropout', 7)).some(m => m.includes('Incomplete')));
  assert.ok(replayMessages(sample('medication_context', 7)).some(m => m.includes('medication-change')));
});
