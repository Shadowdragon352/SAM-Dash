import { useEffect, useState } from "react";

type Reading = { movementRms: number | null; capturedAt: number; receivedAt: string };

export default function LiveVolunteer() {
  const [reading, setReading] = useState<Reading | null>(null);
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
        setReading(data.reading);
        setStatus(data.reading ? "" : "Waiting for the first movement reading.");
      } catch {
        if (controller.signal.aborted) return;
        setReading(null);
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
      <p>Watch movement readings · University prototype</p>
      {status && <p role="status">{status}</p>}
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
