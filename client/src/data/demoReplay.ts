import { parseReplay } from '@/lib/scenarioReplay';

// Invented software fixtures: no source patient or diagnostic label.
export function builtInReplay() {
  return parseReplay(JSON.stringify(['stable_baseline', 'baseline_change', 'medication_context', 'baseline_unavailable', 'sensor_dropout'].flatMap(id =>
    Array.from({ length: 12 }, (_, i) => {
      const active = i >= 6;
      const changed = active && ['baseline_change', 'medication_context'].includes(id);
      const dropout = active && id === 'sensor_dropout';
      return {
        scenario_id: id, scenario_description: `Fully synthetic ${id.replace(/_/g, ' ')} scenario`,
        demo_patient_id: `DEMO-${id}`, source_record_id: 'SYNTHETIC-NO-SOURCE', hour: i + 1,
        heart_rate_bpm: dropout ? null : [72, 74, 73, 76, 75, 72, 74, 73, 75, 74, 72, 73][i],
        spo2_percent: dropout ? null : [98, 98, 97, 98, 99, 98, 98, 97, 98, 99, 98, 98][i],
        age_years: 72, baseline_available: id !== 'baseline_unavailable',
        synthetic_baseline: id === 'baseline_unavailable' ? null : 'Invented usual alertness, conversation and mobility',
        synthetic_alertness_change: changed, synthetic_communication_change: changed,
        synthetic_mobility_change: false, synthetic_medication_change: active && id === 'medication_context',
        synthetic_sensor_dropout: dropout, clinical_prediction: false,
        observation_provenance: 'SCRIPTED SYNTHETIC', vital_provenance: 'FULLY SYNTHETIC',
      };
    })
  )));
}
