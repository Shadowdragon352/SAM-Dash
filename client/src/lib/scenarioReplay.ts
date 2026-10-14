export type ReplayRow = {
  scenario_id: string; scenario_description: string; demo_patient_id: string;
  source_record_id: string; hour: number; heart_rate_bpm: number | null;
  spo2_percent: number | null; age_years: number;
  baseline_available: boolean; synthetic_baseline: string | null;
  synthetic_alertness_change: boolean; synthetic_communication_change: boolean;
  synthetic_mobility_change: boolean; synthetic_medication_change: boolean;
  synthetic_sensor_dropout: boolean; clinical_prediction: false;
};

export function parseReplay(text: string): ReplayRow[] {
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000)
    throw new Error('Expected 1–10,000 rows from sam_replay.json.');
  const strings = ['scenario_id', 'scenario_description', 'demo_patient_id', 'source_record_id'];
  const bools = ['baseline_available', 'synthetic_alertness_change', 'synthetic_communication_change',
    'synthetic_mobility_change', 'synthetic_medication_change', 'synthetic_sensor_dropout'];
  const seen = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row ${i + 1}.`);
    const r = row as Record<string, unknown>;
    const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (strings.some(k => typeof r[k] !== 'string' || !(r[k] as string).trim() || (r[k] as string).length > 1000)
      || bools.some(k => typeof r[k] !== 'boolean')
      || !numeric(r.hour) || !numeric(r.age_years)
      || ['heart_rate_bpm', 'spo2_percent'].some(k => r[k] !== null && !numeric(r[k]))
      || (r.synthetic_baseline !== null && typeof r.synthetic_baseline !== 'string')
      || r.clinical_prediction !== false
      || r.observation_provenance !== 'SCRIPTED SYNTHETIC'
      || !['PHYSIONET ICU RECORDING', 'SYNTHETIC DROPOUT'].includes(String(r.vital_provenance)))
      throw new Error(`Row ${i + 1} is not a supported synthetic Colab replay row.`);
    const key = JSON.stringify([r.scenario_id, r.hour]);
    if (seen.has(key)) throw new Error(`Duplicate hour in scenario ${r.scenario_id}.`);
    seen.add(key);
  }
  return (rows as ReplayRow[]).slice().sort((a, b) => a.hour - b.hour);
}

export function replayMessages(row: ReplayRow): string[] {
  const messages: string[] = [];
  if (!row.baseline_available) messages.push('Baseline information needed.');
  const changes = [row.synthetic_alertness_change && 'alertness',
    row.synthetic_communication_change && 'communication', row.synthetic_mobility_change && 'mobility'].filter(Boolean);
  if (changes.length) messages.push(`Synthetic baseline change: ${changes.join(', ')}. Reassessment requested.`);
  if (row.synthetic_medication_change) messages.push('Synthetic medication-change context recorded; cause is not inferred.');
  if (row.heart_rate_bpm === null || row.spo2_percent === null || row.synthetic_sensor_dropout)
    messages.push('Incomplete sensor readings.');
  if (!messages.length) messages.push('No scripted prompt at this step. This does not establish clinical stability.');
  return messages;
}
