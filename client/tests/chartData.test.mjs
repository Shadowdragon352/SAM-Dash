import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Run with: node --test tests/chartData.test.mjs
// Compile the dependency-free helper in memory using the existing TypeScript dependency.
const source = readFileSync(new URL("../src/components/chartData.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020,
} });
const { BIN_MS, HISTORY_MS, chartPoints, chartWindow, chartDomain, panEnd } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const reading = (index, value) => ({ ts_ms: index * BIN_MS, heart_rate_bpm: value });

test("light smoothing keeps peaks dominant and never modifies recorded values", () => {
  const rows = [reading(0, 60), reading(1, 100), reading(2, 60)];
  const original = structuredClone(rows);
  const points = chartPoints(rows, "heart_rate_bpm");
  assert.equal(points[1].recorded, 100);
  assert.equal(points[1].smoothed, 88);
  assert.deepEqual(rows, original);
});

test("missing readings, nonfinite values and timestamp gaps are not smoothed across", () => {
  const points = chartPoints([reading(0, 60), reading(1, null), reading(2, 100), reading(4, 80), reading(5, NaN)], "heart_rate_bpm");
  assert.equal(points[0].smoothed, 60);
  assert.equal(points[1].smoothed, null);
  assert.equal(points[2].smoothed, 100);
  assert.equal(points[3].smoothed, 80);
  assert.equal(points[4].smoothed, null);
});

test("sorting, invalid timestamps and isolated readings are handled", () => {
  const points = chartPoints([reading(2, 70), { ts_ms: NaN, heart_rate_bpm: 100 }, reading(0, 60)], "heart_rate_bpm");
  assert.deepEqual(points.map((p) => p.ts_ms), [0, 2 * BIN_MS]);
  assert.deepEqual(points.map((p) => p.smoothed), [60, 70]);
});

test("smoothing is stable as the visible window pans", () => {
  const points = chartPoints([reading(0, 60), reading(1, 100), reading(2, 60)], "heart_rate_bpm");
  const firstWindow = points.filter((p) => p.ts_ms >= BIN_MS);
  const secondWindow = points.filter((p) => p.ts_ms <= BIN_MS);
  assert.equal(firstWindow[0].smoothed, secondWindow.at(-1).smoothed);
});

test("axes retain baseline ranges for empty data and ordinary values", () => {
  assert.deepEqual(chartDomain("heart_rate_bpm", []), [50, 120]);
  assert.deepEqual(chartDomain("heart_rate_bpm", chartPoints([reading(0, 70), reading(1, 90)], "heart_rate_bpm")), [50, 120]);
  assert.deepEqual(chartDomain("skin_temperature_c", []), [25, 40]);
  assert.deepEqual(chartDomain("movement_rms_ms2", []), [0, 3]);
});

test("axes expand to retain original extremes even when smoothing reduces them", () => {
  const points = chartPoints([reading(0, 35), reading(1, 180), reading(2, 60)], "heart_rate_bpm");
  const [low, high] = chartDomain("heart_rate_bpm", points);
  assert.ok(low < 35 && high > 180);
  assert.ok(points[1].smoothed < points[1].recorded);
  assert.ok(chartDomain("skin_temperature_c", [{ recorded: 42, smoothed: 39 }])[1] > 42);
  assert.ok(chartDomain("movement_rms_ms2", [{ recorded: 7, smoothed: 5 }])[1] > 7);
});

test("time windows clamp at both boundaries and 24 hours cannot pan", () => {
  const asOf = 2 * HISTORY_MS, duration = HISTORY_MS / 4;
  assert.deepEqual(chartWindow(asOf, duration, null), { start: asOf - duration, end: asOf, earliest: asOf - HISTORY_MS });
  assert.equal(chartWindow(asOf, duration, 0).end, asOf - HISTORY_MS + duration);
  assert.equal(chartWindow(asOf, duration, asOf + 1000).end, asOf);
  assert.equal(chartWindow(asOf, HISTORY_MS, 0).end, asOf);
});

test("live windows follow refreshes while historical windows stay still", () => {
  const asOf = 2 * HISTORY_MS, duration = HISTORY_MS / 4, historical = asOf - duration;
  assert.equal(chartWindow(asOf + BIN_MS, duration, null).end, asOf + BIN_MS);
  assert.equal(chartWindow(asOf + BIN_MS, duration, historical).end, historical);
  assert.equal(chartWindow(asOf, HISTORY_MS, historical).end, asOf);
  assert.equal(chartWindow(asOf, duration, historical).end, historical);
});

test("dragging right moves backward by the matching fraction of the window", () => {
  assert.equal(panEnd(1000, 50, 200, 400), 900);
  assert.equal(panEnd(1000, -50, 200, 400), 1100);
  assert.ok(Number.isFinite(panEnd(1000, 50, 0, 400)));
});
