export type ChartReading = Record<string, number | null>;
export type ChartPoint = { ts_ms: number; recorded: number | null; smoothed: number | null };

export const BIN_MS = 5 * 60_000;
export const HISTORY_MS = 24 * 60 * 60_000;
export const DURATIONS = [
  { label: "30 minutes", ms: 30 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "3 hours", ms: 3 * 60 * 60_000 },
  { label: "6 hours", ms: 6 * 60 * 60_000 },
  { label: "12 hours", ms: 12 * 60 * 60_000 },
  { label: "24 hours", ms: HISTORY_MS },
];

const finite = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

// Keep the current bin dominant; never borrow across a missing bin or time gap.
// Apply this before clipping the window so panning does not change the values.
export function chartPoints(data: ChartReading[], metric: string): ChartPoint[] {
  const points = data.filter((row) => finite(row.ts_ms))
    .map((row) => ({ ts_ms: row.ts_ms as number, recorded: finite(row[metric]) ? row[metric] : null }))
    .sort((a, b) => a.ts_ms - b.ts_ms);
  return points.map((point, i) => {
    if (point.recorded === null) return { ...point, smoothed: null };
    let correction = 0;
    let weight = 0.7;
    for (const neighbor of [points[i - 1], points[i + 1]]) {
      if (neighbor && neighbor.recorded !== null && Math.abs(neighbor.ts_ms - point.ts_ms) === BIN_MS) {
        correction += (neighbor.recorded - point.recorded) * 0.15;
        weight += 0.15;
      }
    }
    return { ...point, smoothed: point.recorded + correction / weight };
  });
}

export function chartWindow(asOf: number, duration: number, requestedEnd: number | null) {
  const earliest = asOf - HISTORY_MS;
  const end = Math.min(asOf, Math.max(earliest + duration, requestedEnd ?? asOf));
  return { start: end - duration, end, earliest };
}

export function panEnd(end: number, deltaPixels: number, plotWidth: number, duration: number) {
  return end - deltaPixels / Math.max(1, plotWidth) * duration;
}

export function chartDomain(metric: string, points: ChartPoint[]): [number, number] {
  const [baseMin, baseMax, step] = metric === "heart_rate_bpm" ? [50, 120, 10]
    : metric === "skin_temperature_c" ? [25, 40, 1] : [0, 3, 1];
  let low = baseMin, high = baseMax;
  for (const point of points) {
    if (finite(point.recorded)) {
      low = Math.min(low, point.recorded);
      high = Math.max(high, point.recorded);
    }
    if (finite(point.smoothed)) {
      low = Math.min(low, point.smoothed);
      high = Math.max(high, point.smoothed);
    }
  }
  const padding = (baseMax - baseMin) * 0.05;
  return [
    low < baseMin ? Math.floor((low - padding) / step) * step : baseMin,
    high > baseMax ? Math.ceil((high + padding) / step) * step : baseMax,
  ];
}
