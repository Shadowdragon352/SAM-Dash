import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartDomain, chartPoints, chartWindow, DURATIONS, panEnd, type ChartReading } from "./chartData";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const rangeTime = (ms: number) => new Date(ms).toLocaleString([], {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function RecordedChart({ data, asOf, metric, label, unit }: {
  data: ChartReading[]; asOf: number; metric: string; label: string; unit: string;
}) {
  const id = useId();
  const [duration, setDuration] = useState(6 * 60 * 60_000);
  // null follows live updates; a timestamp holds the viewed history still.
  const [requestedEnd, setRequestedEnd] = useState<number | null>(null);
  const [smooth, setSmooth] = useState(true);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; end: number; width: number; active: boolean } | null>(null);
  const window = chartWindow(asOf, duration, requestedEnd);
  const points = useMemo(() => chartPoints(data, metric), [data, metric]);
  const visible = useMemo(() => points.filter((p) => p.ts_ms >= window.start && p.ts_ms <= window.end), [points, window.start, window.end]);
  const populated = visible.some((p) => p.recorded !== null);
  const domain = chartDomain(metric, visible);
  const canPan = window.earliest + duration < asOf;
  const atLatest = requestedEnd === null;
  const moveTo = (end: number) => {
    const clamped = chartWindow(asOf, duration, end).end;
    setRequestedEnd(clamped >= asOf ? null : clamped);
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <section className="rounded-md border bg-card p-5" aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={`${id}-title`} className="font-semibold">{label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">5-minute means · {unit}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs" htmlFor={`${id}-duration`}>
            Window
            <select id={`${id}-duration`} className="sam-input !w-auto !py-1.5" value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}>
              {DURATIONS.map((option) => <option key={option.ms} value={option.ms}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input type="checkbox" checked={smooth} onChange={(event) => setSmooth(event.target.checked)} className="accent-primary" />
            Smooth line
          </label>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{rangeTime(window.start)} – {rangeTime(window.end)}</span>
        <button type="button" className="sam-secondary !px-2 !py-1 !text-xs" disabled={atLatest}
          onClick={() => setRequestedEnd(null)}>Latest</button>
      </div>
      <div className={`relative h-52 select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${canPan ? dragging ? "cursor-grabbing" : "cursor-grab" : ""}`}
        style={{ touchAction: "pan-y" }} tabIndex={0} role="group"
        aria-label={`${label} graph. Use left and right arrows to move through time, Home for oldest, End for latest.`}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "Home") moveTo(window.earliest + duration);
            else if (event.key === "End") setRequestedEnd(null);
            else moveTo(window.end + (event.key === "ArrowLeft" ? -1 : 1) * duration / 4);
          }
        }}
        onPointerDown={(event) => {
          if (!canPan || !event.isPrimary || event.button !== 0) return;
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            end: window.end, width: Math.max(1, event.currentTarget.clientWidth - 60), active: false };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.pointerId !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (!start.active) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) { drag.current = null; return; }
            if (Math.abs(dx) < 6) return;
            start.active = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
          moveTo(panEnd(start.end, dx, start.width, duration));
        }}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
        onPointerLeave={(event) => { if (!drag.current?.active) finishDrag(event); }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visible} margin={{ left: 0, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="ts_ms" type="number" domain={[window.start, window.end]} allowDataOverflow
              tickFormatter={time} minTickGap={45} />
            <YAxis domain={domain} allowDataOverflow width={48} />
            <Tooltip labelFormatter={(ms) => new Date(Number(ms)).toLocaleString()}
              formatter={(n, name) => [`${Number(n).toFixed(2)} ${unit}`, name]}
              contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 4 }}
              isAnimationActive={false} />
            <Line type="linear" dataKey="recorded" name="Recorded mean" stroke={smooth ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"}
              strokeOpacity={smooth ? 0.35 : 1} strokeWidth={smooth ? 1 : 2}
              dot={{ r: 1.5, strokeWidth: 0, fill: smooth ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))", fillOpacity: smooth ? 0.5 : 1 }}
              connectNulls={false} isAnimationActive={false} />
            {smooth && <Line type="linear" dataKey="smoothed" name="Lightly smoothed" stroke="hsl(var(--primary))"
              strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
        {!populated && <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8 pl-12 text-sm text-muted-foreground">
          <span className="rounded bg-card/90 px-3 py-2">No recorded {label.toLowerCase()} in this window</span>
        </div>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="sam-secondary !p-1.5" aria-label={`Earlier ${label.toLowerCase()}`}
          disabled={!canPan || window.end <= window.earliest + duration} onClick={() => moveTo(window.end - duration / 4)}><ChevronLeft size={16} /></button>
        <input type="range" className="min-w-0 flex-1 accent-primary" aria-label={`${label} time position`}
          min={window.earliest + duration} max={asOf} step="any" value={window.end} disabled={!canPan}
          aria-valuetext={`Window ending ${rangeTime(window.end)}`}
          onChange={(event) => moveTo(Number(event.target.value))} />
        <button type="button" className="sam-secondary !p-1.5" aria-label={`Later ${label.toLowerCase()}`}
          disabled={!canPan || window.end >= asOf} onClick={() => moveTo(window.end + duration / 4)}><ChevronRight size={16} /></button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {canPan ? "Drag sideways or use the slider to browse the last 24 hours." : "Showing the last 24 hours."}
        {smooth && " Faint line shows recorded means; smoothing keeps gaps."}
      </p>
    </section>
  );
}
