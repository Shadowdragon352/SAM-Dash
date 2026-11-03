import { privateDemo } from '@/lib/privateDemo';
import { builtInReplay } from '@/data/demoReplay';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { parseReplay, replayMessages, type ReplayRow } from '@/lib/scenarioReplay';

const modelDemo = {
  "threshold": 0.5623265537576067,
  "cases": [
    {
      "label": "unmodified",
      "score": 0.003294478534273984,
      "flag": false
    },
    {
      "label": "scripted_mixed_change",
      "score": 0.9931045592891142,
      "flag": true
    }
  ]
};

export default function ScenarioReplay() {
  const [rows, setRows] = useState<ReplayRow[]>(() => privateDemo ? builtInReplay() : []);
  const [scenario, setScenario] = useState(privateDemo ? 'stable_baseline' : '');
  const logout = useAuthStore(state => state.logout);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const sequence = rows.filter(r => r.scenario_id === scenario);
  const current = sequence[step];
  const scenarios = [...new Set(rows.map(r => r.scenario_id))];
  useEffect(() => {
    if (!playing) return;
    if (step >= sequence.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setStep(s => s + 1), 1000);
    return () => window.clearTimeout(timer);
  }, [playing, step, sequence.length]);
  useEffect(() => () => { request.current++; }, []);

  async function importFile(file?: File) {
    if (!file) return;
    const id = ++request.current;
    setPlaying(false); setError(''); setRows([]); setScenario(''); setStep(0);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 5 MB.');
      const parsed = parseReplay(await file.text());
      if (id !== request.current) return;
      setRows(parsed); setScenario(parsed[0].scenario_id);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'Could not read file.');
    }
  }
  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    {privateDemo ? <button className="underline" onClick={() => void logout()}>Sign out</button> : <Link to="/" className="underline">← Patient dashboard</Link>}
    <header><h1 className="text-2xl font-bold">SAM scenario replay</h1>
      <p className="text-muted-foreground">University prototype · scenario demonstration</p></header>
    <section className="rounded-md border border-amber-500 bg-card p-4">
      <strong>Simulated observations · no clinical prediction</strong>
      <p>{privateDemo ? "All displayed readings, baseline descriptions and observations are invented software fixtures. They are not patient histories or smartwatch recordings. Replay controls display scripted observations. The model examples below are precomputed." : "Colab exports combine recorded ICU vital signs with scripted baseline changes. These are not actual patient histories or smartwatch recordings. Replay controls display scripted observations. The model examples below are precomputed."}</p>
      <p className="mt-2 text-sm">Files stay in this browser component and are cleared on navigation or reload. Nothing is uploaded to patient records.</p>
    </section>
    {!privateDemo && <label className="block">Import <code>sam_replay.json</code> from your Colab ZIP
      <input className="mt-2 block" type="file" accept=".json,application/json"
        onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!current && !error && <p>Import the JSON file to choose a scenario and replay its hourly readings.</p>}
    {current && <>
      <section className="flex flex-wrap items-center gap-4 rounded-md border p-4">
        <label>Scenario <select className="sam-input" value={scenario} onChange={e => {
          setScenario(e.target.value); setStep(0); setPlaying(false);
        }}>{scenarios.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></label>
        <button className="sam-button" disabled={step === sequence.length - 1} onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <button className="sam-secondary" onClick={() => { setStep(0); setPlaying(false); }}>Reset</button>
        <label className="flex-1">Step {step + 1} / {sequence.length}
          <input aria-label="Replay step" className="block w-full" type="range" min={0} max={sequence.length - 1} value={step}
            onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }} /></label>
      </section>
      <section className="rounded-md border bg-card p-4">
        <h2 className="font-semibold">{current.demo_patient_id}</h2>
        <p>{current.scenario_description}</p>
        <p className="text-sm text-muted-foreground">{current.source_record_id === "SYNTHETIC-NO-SOURCE" ? "Fully synthetic fixture" : `Source record ${current.source_record_id}`} · Demonstration hour {current.hour} · age {current.age_years}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <p>Heart rate: <b>{current.heart_rate_bpm ?? 'Missing'}</b>{current.heart_rate_bpm !== null && ' bpm'}</p>
          <p>SpO₂: <b>{current.spo2_percent ?? 'Missing'}</b>{current.spo2_percent !== null && '%'}</p>
        </div>
        {privateDemo && scenario === 'baseline_change' && current.hour >= 10 && (
          <div className="mt-4 rounded-md border border-amber-500 p-4">
            <h3 className="font-semibold">Simulated SAD risk · Next 6 hours</h3>
            <p className="text-2xl font-bold">25%</p>
            <p>Scripted example for this fictional patient. No model is used to calculate this estimate.</p>
          </div>
        )}

        <p className="mt-3">Synthetic usual baseline: {current.baseline_available ? current.synthetic_baseline ?? 'Description unavailable' : 'Unavailable'}</p>
        {current.synthetic_sensor_dropout && <p>Synthetic sensor dropout is active.</p>}
      </section>
      <section aria-live="polite" className="rounded-md border bg-card p-4">
        <h2 className="font-semibold">Scripted demonstration messages</h2>
        <ul className="mt-2 list-disc pl-5">{replayMessages(current).map(m => <li key={m}>{m}</li>)}</ul>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        {(['heart_rate_bpm', 'spo2_percent'] as const).map(metric => <section key={metric} className="min-w-0 rounded-md border bg-card p-4">
          <h2 className="mb-3 font-semibold">{metric === 'heart_rate_bpm' ? 'Heart rate (bpm)' : 'SpO₂ (%)'} · hourly demonstration readings</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={sequence.slice(0, step + 1)}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" />
              <YAxis domain={['auto', 'auto']} /><Tooltip />
              <Line type="linear" dataKey={metric} stroke="#2563eb" connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground">Missing readings remain gaps. Connecting lines do not represent measurements between hours.</p>
        </section>)}
      </div>
    </>}
    <section className="space-y-2 rounded border p-4">
      <h2 className="font-semibold">Held-out model test</h2>
      <p>Precomputed model outputs for a matched held-out wrist window with synthetic cognition. The change case uses scripted perturbations.</p>
      <p>Validation threshold {modelDemo.threshold.toFixed(4)}</p>
      <ul>
        {modelDemo.cases.map(({ label, score, flag }) => (
          <li key={label}>{label === "unmodified" ? "Unmodified reference" : "Scripted mixed change"} · Score {score.toFixed(4)} · {flag ? "Flagged" : "No flag"}</li>
        ))}
      </ul>
      <p>Research scenario recognition only. No clinical risk estimate.</p>
    </section>
  </main>;
}

