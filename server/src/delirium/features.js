import { number, reading } from "./contract.js";
const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const sd = (values) =>
  values.length > 1
    ? Math.sqrt(mean(values.map((v) => (v - mean(values)) ** 2)))
    : null;
export const FEATURE_VERSION = "delirium-watch.features.v1";
// IBI pairs are only formed within a sensor packet: no pairing across gaps or bad beats.
export function rmssd(event) {
  const p = event.payload;
  if (
    event.source !== "samsung" ||
    p.status !== 1 ||
    !Array.isArray(p.ibi_ms) ||
    !Array.isArray(p.ibi_status)
  )
    return null;
  const differences = [];
  for (let i = 1; i < p.ibi_ms.length; i++) {
    const a = p.ibi_ms[i - 1],
      b = p.ibi_ms[i];
    if (
      p.ibi_status[i - 1] === 0 &&
      p.ibi_status[i] === 0 &&
      number(a) !== null &&
      number(b) !== null &&
      a >= 300 &&
      a <= 2000 &&
      b >= 300 &&
      b <= 2000
    )
      differences.push((b - a) ** 2);
  }
  return differences.length ? Math.sqrt(mean(differences)) : null;
}
export function buildFeatures(events, asOf, hours = 24) {
  const from = asOf - hours * 3_600_000;
  const rows = events
    .filter((e) => e.ts_ms >= from && e.ts_ms <= asOf)
    .sort((a, b) => a.ts_ms - b.ts_ms);
  const hr = [],
    temp = [],
    move = [],
    active = [],
    hrv = [],
    quality = [];
  const tasks = {};
  const movementSlots = new Set(),
    hrMinutes = new Set();
  for (const e of rows) {
    const r = reading(e),
      p = e.payload;
    if (r?.key === "heart_rate_bpm") {
      hr.push(r.value);
      hrMinutes.add(Math.floor(e.ts_ms / 60_000));
    }
    if (r?.key === "skin_temperature_c") temp.push(r.value);
    if (r?.key === "movement_rms_ms2") {
      move.push(r.value);
      movementSlots.add(Math.floor(e.ts_ms / 5000));
      if (number(p.active_fraction) !== null) active.push(p.active_fraction);
    }
    if (r?.key === "ppg_valid_fraction") quality.push(r.value);
    if (e.type === "heart_rate") {
      const value = rmssd(e);
      if (value !== null) hrv.push(value);
    }
    if (e.type === "cognition_summary") tasks[p.task] = e;
  }
  const values = {
    heart_rate_mean_bpm: mean(hr),
    heart_rate_sd_bpm: sd(hr),
    skin_temperature_mean_c: mean(temp),
    skin_temperature_sd_c: sd(temp),
    movement_rms_mean_ms2: mean(move),
    movement_rms_sd_ms2: sd(move),
    active_fraction_mean: mean(active),
    // Packet RMSSD mean is deliberately named distinctly from pooled, continuous HRV.
    ibi_packet_rmssd_mean_ms: mean(hrv),
    ppg_valid_fraction_mean: mean(quality),
  };
  // Compare the latest six hours with the preceding part of the 24-hour window.
  // These are measured changes, not clinical thresholds or a presumed healthy baseline.
  for (const key of [
    "heart_rate_bpm",
    "skin_temperature_c",
    "movement_rms_ms2",
  ]) {
    const recent = [],
      previous = [];
    for (const e of rows) {
      const r = reading(e);
      if (r?.key !== key) continue;
      (e.ts_ms >= asOf - 6 * 3_600_000 ? recent : previous).push(r.value);
    }
    values[`${key}_recent6h_mean`] = mean(recent);
    values[`${key}_previous18h_mean`] = mean(previous);
    values[`${key}_recent6h_minus_previous18h`] =
      recent.length && previous.length ? mean(recent) - mean(previous) : null;
  }
  for (const outcome of [
    "declined",
    "interrupted",
    "completed",
    "notification_blocked",
  ]) {
    values[`cognition_${outcome}_count`] = rows.filter(
      (e) =>
        e.type === "cognition_prompt_outcome" && e.payload.outcome === outcome,
    ).length;
  }
  for (const task of ["attention", "one_back"]) {
    const e = tasks[task],
      p = e?.payload;
    values[`${task}_accuracy`] = number(p?.accuracy);
    values[`${task}_median_rt_ms`] = number(p?.median_rt_ms);
    values[`${task}_rt_sd_ms`] = number(p?.rt_sd_ms);
    values[`${task}_omissions`] = number(p?.omissions);
    values[`${task}_commissions`] = number(p?.commissions);
    values[`${task}_age_hours`] = e ? (asOf - e.ts_ms) / 3_600_000 : null;
  }
  return {
    schema_version: FEATURE_VERSION,
    as_of_ms: asOf,
    window_start_ms: from,
    window_hours: hours,
    values,
    quality: {
      event_count: rows.length,
      last_event_ms: rows.at(-1)?.ts_ms ?? null,
      heart_rate_samples: hr.length,
      skin_temperature_samples: temp.length,
      movement_windows: move.length,
      ibi_packets_with_rmssd: hrv.length,
      cognition_summaries: Object.keys(tasks).length,
      movement_coverage: Math.min(1, movementSlots.size / (hours * 720)),
      heart_rate_minute_coverage: Math.min(1, hrMinutes.size / (hours * 60)),
      missing_features: Object.keys(values).filter((k) => values[k] === null),
    },
  };
}
export function overview(events, asOf, hours = 24) {
  const features = buildFeatures(events, asOf, hours),
    latest = {},
    bins = new Map();
  const start = Math.floor(features.window_start_ms / 300_000) * 300_000;
  for (let t = start; t <= asOf; t += 300_000)
    bins.set(t, {
      ts_ms: t,
      heart_rate_bpm: null,
      skin_temperature_c: null,
      movement_rms_ms2: null,
      ppg_valid_fraction: null,
    });
  const sums = new Map();
  for (const e of events) {
    if (e.ts_ms < features.window_start_ms || e.ts_ms > asOf) continue;
    const r = reading(e);
    if (!r) continue;
    if (!latest[r.key] || latest[r.key].ts_ms < e.ts_ms)
      latest[r.key] = {
        value: r.value,
        ts_ms: e.ts_ms,
        device_id: e.device_id,
        source: e.source,
      };
    const bin = Math.floor(e.ts_ms / 300_000) * 300_000,
      id = `${bin}/${r.key}`;
    const sum = sums.get(id) || [0, 0];
    sum[0] += r.value;
    sum[1]++;
    sums.set(id, sum);
    if (bins.has(bin)) bins.get(bin)[r.key] = sum[0] / sum[1];
  }
  return { latest, series: [...bins.values()], features };
}
export function validatePrediction(result) {
  if (result?.status === "unavailable")
    return {
      status: "unavailable",
      reason: String(result.reason || "Model unavailable").slice(0, 500),
    };
  if (
    result?.status !== "ok" ||
    result.schema_version !== "delirium-watch.prediction.v1" ||
    number(result.probability) === null ||
    result.probability < 0 ||
    result.probability > 1 ||
    !["incident_delirium", "current_delirium"].includes(result.target) ||
    typeof result.model_version !== "string" ||
    !result.model_version.trim() ||
    number(result.horizon_hours) === null ||
    result.horizon_hours < 0 ||
    result.horizon_hours > 168 ||
    (result.target === "incident_delirium" && result.horizon_hours === 0) ||
    (result.target === "current_delirium" && result.horizon_hours !== 0)
  )
    throw new Error("Invalid model response");
  return {
    status: "ok",
    schema_version: result.schema_version,
    probability: result.probability,
    target: result.target,
    horizon_hours: result.horizon_hours,
    model_version: result.model_version.slice(0, 100),
    intended_use: "research",
  };
}
export async function predict(features, fetcher = fetch) {
  if (!process.env.MODEL_URL)
    return { status: "unavailable", reason: "No trained model configured" };
  if (!features.quality.event_count)
    return {
      status: "unavailable",
      reason: "No recorded data in the feature window",
    };
  try {
    const url = new URL(process.env.MODEL_URL);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Invalid MODEL_URL");
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MODEL_API_TOKEN
          ? { Authorization: `Bearer ${process.env.MODEL_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(features),
    });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    let body;
    if (response.body) {
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 64_000) throw new Error("Model response too large");
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString("utf8");
    } else {
      body = await response.text();
      if (body.length > 64_000) throw new Error("Model response too large");
    }
    return {
      ...validatePrediction(JSON.parse(body)),
      as_of_ms: features.as_of_ms,
    };
  } catch {
    return {
      status: "unavailable",
      reason: "Model request failed or returned an invalid response",
    };
  }
}
