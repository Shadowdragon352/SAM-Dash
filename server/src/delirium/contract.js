import { createHash, timingSafeEqual } from "node:crypto";
export const TYPES = new Set([
  "movement_5s",
  "heart_rate",
  "ppg_summary",
  "temperature",
  "cognition_trial",
  "cognition_summary",
  "cognition_prompt_outcome",
  "monitoring_state",
]);
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export const secretMatches = (value, hash) =>
  typeof hash === "string" &&
  hash.length === 64 &&
  timingSafeEqual(Buffer.from(hashToken(value)), Buffer.from(hash));
export const fail = (message, status = 400) => {
  const error = new Error(message);
  error.statusCode = status;
  throw error;
};
export function text(value, name, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(`${name} must be a nonempty string of at most ${max} characters`);
  return value.trim();
}
function finiteTree(value, depth = 0) {
  if (depth > 10) fail("Payload nesting is too deep");
  if (typeof value === "number" && !Number.isFinite(value))
    fail("Numbers must be finite");
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        key.startsWith("$") ||
        key.includes(".")
      )
        fail("Unsupported payload key");
      finiteTree(item, depth + 1);
    }
  }
}
export const number = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
function optionalNumber(p, key, min, max, integer = false) {
  if (p[key] === undefined || p[key] === null) return;
  if (
    number(p[key]) === null ||
    p[key] < min ||
    p[key] > max ||
    (integer && !Number.isInteger(p[key]))
  )
    fail(`Invalid ${key}`);
}
export function validateBatch(body, now = Date.now()) {
  if (
    !Array.isArray(body?.events) ||
    body.events.length < 1 ||
    body.events.length > 100
  )
    fail("events must contain 1–100 events");
  const ids = new Set();
  return body.events.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      fail("Each event must be an object");
    const event_id = text(row.event_id, "event_id").toLowerCase();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        event_id,
      )
    )
      fail("event_id must be a UUID");
    if (ids.has(event_id)) fail("Repeated event_id within batch");
    ids.add(event_id);
    const study_id = text(row.study_id, "study_id"),
      device_id = text(row.device_id, "device_id");
    if (
      !Number.isSafeInteger(row.ts_ms) ||
      row.ts_ms <= 0 ||
      row.ts_ms > now + 300_000
    )
      fail("Invalid ts_ms; check the watch clock");
    if (!TYPES.has(row.type)) fail("Unsupported event type");
    const p = row.payload;
    if (!p || typeof p !== "object" || Array.isArray(p))
      fail("payload must be an object");
    finiteTree(p);
    if (JSON.stringify(p).length > 128_000) fail("Event payload is too large");
    if (row.type === "heart_rate") {
      optionalNumber(p, "bpm", 1, 300);
      optionalNumber(p, "status", -1000, 1000, true);
      for (const key of ["ibi_ms", "ibi_status"])
        if (
          p[key] !== undefined &&
          (!Array.isArray(p[key]) ||
            p[key].length > 1000 ||
            p[key].some((v) => v !== null && number(v) === null))
        )
          fail(`Invalid ${key}`);
    }
    if (row.type === "temperature") {
      optionalNumber(p, "skin_temp_c", -20, 70);
      optionalNumber(p, "ambient_temp_c", -50, 100);
    }
    if (row.type === "movement_5s") {
      for (const key of ["rms", "mad", "sd", "peak", "jerk_rms"])
        optionalNumber(p, key, 0, 1e6);
      optionalNumber(p, "active_fraction", 0, 1);
      optionalNumber(p, "duration_ms", 0, 60_000);
    }
    if (row.type === "ppg_summary") optionalNumber(p, "valid_fraction", 0, 1);
    if (
      row.type === "cognition_prompt_outcome" &&
      ![
        "presented",
        "notification_blocked",
        "started",
        "interrupted",
        "declined",
        "completed",
      ].includes(p.outcome)
    )
      fail("Unknown cognition outcome");
    if (
      row.type.startsWith("cognition_") &&
      row.type !== "cognition_prompt_outcome"
    ) {
      text(p.session_id, "session_id");
      if (!["attention", "one_back"].includes(p.task))
        fail("Unknown cognition task");
      optionalNumber(p, "rt_ms", 0, 60_000);
      optionalNumber(p, "median_rt_ms", 0, 60_000);
      optionalNumber(p, "rt_sd_ms", 0, 60_000);
      if (row.type === "cognition_summary") {
        if (
          number(p.accuracy) === null ||
          !Number.isInteger(p.trials) ||
          p.trials < 1
        )
          fail("Cognition summary needs accuracy and trials");
        optionalNumber(p, "accuracy", 0, 1);
        for (const key of ["omissions", "commissions"])
          optionalNumber(p, key, 0, p.trials, true);
        optionalNumber(p, "trials", 1, 1000, true);
      }
      if (row.type === "cognition_trial") {
        if (
          !Number.isInteger(p.trial_index) ||
          p.trial_index < 0 ||
          p.trial_index > 1000 ||
          typeof p.correct !== "boolean"
        )
          fail("Invalid cognition trial");
      }
    }
    return {
      event_id,
      study_id,
      device_id,
      ts_ms: row.ts_ms,
      type: row.type,
      source: text(row.source || "watch", "source", 80),
      payload: p,
    };
  });
}
export function assignmentFor(device, event) {
  return (
    device.assignments?.find(
      (a) =>
        a.studyId === event.study_id &&
        event.ts_ms >= a.from &&
        (a.to == null || event.ts_ms < a.to),
    ) || null
  );
}
export function reading(event) {
  const p = event.payload;
  switch (event.type) {
    case "heart_rate":
      return ((event.source === "android" && p.status == null) ||
        (event.source === "samsung" && p.status === 1)) &&
        number(p.bpm) !== null &&
        p.bpm > 0
        ? { key: "heart_rate_bpm", value: p.bpm }
        : null;
    case "temperature":
      return p.status === 0 && number(p.skin_temp_c) !== null
        ? { key: "skin_temperature_c", value: p.skin_temp_c }
        : null;
    case "movement_5s":
      return number(p.rms) !== null
        ? { key: "movement_rms_ms2", value: p.rms }
        : null;
    case "ppg_summary":
      return number(p.valid_fraction) !== null
        ? { key: "ppg_valid_fraction", value: p.valid_fraction }
        : null;
    default:
      return null;
  }
}
