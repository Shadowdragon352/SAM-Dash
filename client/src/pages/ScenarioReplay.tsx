import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { useEffect, useState } from "react";

type Point = { time: number; value: number | null };
type Reading = { movementRms: number | null; capturedAt: number; receivedAt: string };

export default function LiveVolunteer() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [heartRate, setHeartRate] = useState<{ bpm: number | null; capturedAt: number } | null>(null);
  const [cognition, setCognition] = useState<{ accuracy: number | null; capturedAt: number } | null>(null);
  const [timeline, setTimeline] = useState<{ movement: Point[]; pulse: Point[] } | null>(null);
  const [status, setStatus] = useState("Checking for a reading…");
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/v1/research/live-volunteer", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        setTimeline(data.timeline ?? null);
        setReading(data.reading);
        setHeartRate(data.heartRate ?? null);
        setCognition(data.cognition ?? null);
        setStatus(data.reading ? "" : "Waiting for the first movement reading.");
      } catch {
        if (controller.signal.aborted) return;
        setTimeline(null);
        setReading(null);
        setHeartRate(null);
        setCognition(null);
        setStatus("Live readings unavailable. Check your sign-in and try again.");
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
    }
    void refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, []);

  const age = reading ? Math.max(0, Math.floor((now - reading.capturedAt) / 1000)) : null;
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <a className="underline" href="/scenario-replay">Scenario Replay</a>
      <h1 className="text-2xl font-bold">Live Volunteer</h1>
      <p>Watch movement and heart rate · University prototype</p>
      {status && <p role="status">{status}</p>}
      <section className="space-y-2 rounded border p-4">
        <p>Heart rate: {heartRate ? (heartRate.bpm === null ? "Unavailable" : `${heartRate.bpm} bpm`) : "No reading yet"}</p>
        {heartRate && <>
          <p>Captured: {new Date(heartRate.capturedAt).toLocaleString()}</p>
          <p>Reading age: {Math.max(0, Math.floor((now - heartRate.capturedAt) / 1000))} seconds{now - heartRate.capturedAt > 60_000 ? " · Stale" : ""}</p>
        </>}
      </section>
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Latest cognitive check</h2>
        {cognition ? <>
          <p>Task accuracy: {cognition.accuracy === null ? "Unavailable" : `${(cognition.accuracy * 100).toFixed(1)}%`}</p>
          <p>Completed: {new Date(cognition.capturedAt).toLocaleString()}</p>
        </> : <p>No completed check yet</p>}
      </section>
      {timeline && ([
        ["Movement RMS (m/s²)", timeline.movement],
        ["Heart rate (bpm)", timeline.pulse],
      ] as const).map(([label, points]) => {
        const recent = points.filter(point => point.time >= now - 300_000 && point.time <= now);
        return <section key={label} className="rounded border p-4">
          <h2 className="font-semibold">{label} · last five minutes</h2>
          {recent.some(point => point.value !== null) ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={recent}>
                <XAxis dataKey="time" type="number" domain={[now - 300_000, now]} allowDataOverflow
                  tickFormatter={time => new Date(time).toLocaleTimeString()} />
                <YAxis width={52} />
                <Tooltip labelFormatter={time => new Date(time).toLocaleTimeString()} />
                {cognition && cognition.capturedAt >= now - 300_000 && cognition.capturedAt <= now &&
                  <ReferenceLine x={cognition.capturedAt} stroke="#a16207" label="Cognitive check" />}
                <Line dataKey="value" name={label} stroke="#2563eb" strokeWidth={0} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p>No usable readings in this window.</p>}
        </section>;
      })}
      {reading && (
        <section className="space-y-2 rounded border p-4">
          <p>Movement RMS: {reading.movementRms === null ? "Unavailable" : `${reading.movementRms.toFixed(3)} m/s²`}</p>
          <p>Captured: {new Date(reading.capturedAt).toLocaleString()}</p>
          <p>Received: {new Date(reading.receivedAt).toLocaleString()}</p>
          <p>Reading age: {age} seconds{age !== null && age > 60 ? " · Stale" : ""}</p>
        </section>
      )}
    </main>
  );
}
