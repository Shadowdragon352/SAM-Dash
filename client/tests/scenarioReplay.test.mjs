import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/scenarioReplay.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
});
const { parseReplay, replayMessages } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const row = {
  scenario_id: 'baseline_change', scenario_description: 'Synthetic case', demo_patient_id: 'DEMO', source_record_id: 'p1',
  hour: 1, heart_rate_bpm: 80, spo2_percent: 96, age_years: 70, baseline_available: true,
  synthetic_baseline: 'Usual baseline', synthetic_alertness_change: false, synthetic_communication_change: false,
  synthetic_mobility_change: false, synthetic_medication_change: false, synthetic_sensor_dropout: false,
  clinical_prediction: false, observation_provenance: 'SCRIPTED SYNTHETIC', vital_provenance: 'PHYSIONET ICU RECORDING'
};
test('preserves missing readings and orders replay hours', () => {
  const parsed = parseReplay(JSON.stringify([{ ...row, hour: 2 }, { ...row, heart_rate_bpm: null }]));
  assert.equal(parsed[0].hour, 1); assert.equal(parsed[0].heart_rate_bpm, null);
});
test('rejects malformed, clinical, unmarked and duplicate input', () => {
  for (const value of [[], {}, [null], [{ ...row, hour: '1' }], [{ ...row, baseline_available: 'false' }],
    [{ ...row, clinical_prediction: true }], [{ ...row, observation_provenance: 'REAL' }],
    [{ ...row, heart_rate_bpm: '80' }], [row, row]]) {
    assert.throws(() => parseReplay(JSON.stringify(value)));
  }
});
test('simultaneous data-quality and baseline issues remain visible', () => {
  const messages = replayMessages({ ...row, baseline_available: false, heart_rate_bpm: null,
    synthetic_alertness_change: true, synthetic_medication_change: true });
  assert.equal(messages.length, 4);
  assert.ok(messages.some(m => m.includes('Reassessment')));
  assert.ok(messages.some(m => m.includes('Incomplete')));
});
test('no prompt does not claim clinical stability', () => {
  assert.match(replayMessages(row)[0], /does not establish clinical stability/);
});
