import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBatch,
  assignmentFor,
  reading,
  hashToken,
  secretMatches,
} from "../src/delirium/contract.js";
import {
  buildFeatures,
  overview,
  rmssd,
  predict,
  validatePrediction,
} from "../src/delirium/features.js";
const now = 1760000000000;
const event = (
  type = "heart_rate",
  payload = { bpm: 72, status: null },
  source = "android",
) => ({
  event_id: "a1234567-1234-4234-8234-123456789abc",
  study_id: "DW-1",
  device_id: "watch-1",
  ts_ms: now,
  type,
  source,
  payload,
});
test("accepts actual Android/Samsung watch event shapes, including null sensor data", () => {
  assert.equal(validateBatch({ events: [event()] }, now).length, 1);
  assert.equal(
    validateBatch(
      {
        events: [
          event(
            "ppg_summary",
            { green_mean: null, valid_fraction: 0, sample_count: 50 },
            "samsung",
          ),
        ],
      },
      now,
    )[0].payload.green_mean,
    null,
  );
  assert.equal(
    validateBatch(
      {
        events: [
          event("cognition_summary", {
            session_id: "s1",
            task: "attention",
            accuracy: 0,
            median_rt_ms: null,
            rt_sd_ms: null,
            omissions: 4,
            commissions: 0,
            trials: 8,
          }),
        ],
      },
      now,
    ).length,
    1,
  );
});
test("rejects a whole invalid batch, repeated UUIDs, nonfinite values and clock errors", () => {
  for (const events of [
    [],
    [event(), event()],
    [event(), { ...event(), event_id: "bad" }],
    [event("movement_5s", { rms: Infinity })],
    [{ ...event(), ts_ms: now + 300001 }],
    [
      event("cognition_summary", {
        session_id: "s1",
        task: "attention",
        accuracy: 2,
        trials: 8,
      }),
    ],
  ]) {
    assert.throws(() => validateBatch({ events }, now));
  }
});
test("assignment requires device study and acquisition-time interval; handoffs do not relabel delayed events", () => {
  const device = {
    assignments: [
      { patientId: "A", studyId: "DW-1", from: now - 100, to: now },
      { patientId: "B", studyId: "DW-2", from: now, to: null },
    ],
  };
  assert.equal(
    assignmentFor(device, { ...event(), ts_ms: now - 1 }).patientId,
    "A",
  );
  assert.equal(assignmentFor(device, event()), null);
  assert.equal(
    assignmentFor(device, { ...event(), study_id: "DW-2" }).patientId,
    "B",
  );
});
test("invalid status is preserved as missing, skin temperature stays distinct from body temperature", () => {
  assert.equal(
    reading(event("heart_rate", { bpm: 90, status: 0 }, "samsung")),
    null,
  );
  assert.equal(
    reading(event("heart_rate", { bpm: 90, status: null }, "unknown")),
    null,
  );
  assert.equal(
    reading(event("temperature", { skin_temp_c: 35, status: null }, "samsung")),
    null,
  );
  assert.equal(
    reading(event("temperature", { skin_temp_c: 35, status: 0 }, "samsung"))
      .key,
    "skin_temperature_c",
  );
});
test("new patients have null features, no latest readings, and no generated chart values", () => {
  const result = overview([], now);
  assert.deepEqual(result.latest, {});
  assert.equal(result.features.values.heart_rate_mean_bpm, null);
  assert.equal(result.features.values.attention_accuracy, null);
  assert.equal(result.features.quality.movement_coverage, 0);
  assert.ok(result.series.every((row) => row.heart_rate_bpm === null));
});
test("features exclude future and old events, preserve zero cognition accuracy and omit absent reaction times", () => {
  const events = [
    event(),
    { ...event(), ts_ms: now + 1, payload: { bpm: 200 } },
    { ...event(), ts_ms: now - 86400001, payload: { bpm: 100 } },
    event("cognition_summary", {
      session_id: "s",
      task: "attention",
      accuracy: 0,
      median_rt_ms: null,
      rt_sd_ms: null,
      omissions: 4,
      commissions: 0,
      trials: 8,
    }),
  ];
  const result = buildFeatures(events, now);
  assert.equal(result.values.heart_rate_mean_bpm, 72);
  assert.equal(result.values.attention_accuracy, 0);
  assert.equal(result.values.attention_median_rt_ms, null);
});
test("HRV never bridges invalid beats, absent statuses, or packet boundaries", () => {
  assert.equal(
    rmssd(
      event(
        "heart_rate",
        { status: 1, ibi_ms: [800, 900, 1000], ibi_status: [0, 1, 0] },
        "samsung",
      ),
    ),
    null,
  );
  assert.equal(
    rmssd(
      event(
        "heart_rate",
        { status: 1, ibi_ms: [800, 900], ibi_status: [] },
        "samsung",
      ),
    ),
    null,
  );
  assert.equal(
    rmssd(
      event(
        "heart_rate",
        { status: 1, ibi_ms: [800, 900], ibi_status: [0, 0] },
        "samsung",
      ),
    ),
    100,
  );
});
test("token matching fails closed", () => {
  assert.ok(secretMatches("secret", hashToken("secret")));
  assert.equal(secretMatches("wrong", hashToken("secret")), false);
  assert.equal(secretMatches("secret", ""), false);
});
test("prediction contract rejects invalid probabilities and inconsistent horizons", () => {
  const p = {
    schema_version: "delirium-watch.prediction.v1",
    status: "ok",
    probability: 0.2,
    target: "incident_delirium",
    horizon_hours: 24,
    model_version: "trained-v1",
  };
  assert.equal(validatePrediction(p).probability, 0.2);
  for (const row of [
    { ...p, probability: NaN },
    { ...p, probability: 1.1 },
    { ...p, horizon_hours: 0 },
    { ...p, target: "current_delirium" },
  ])
    assert.throws(() => validatePrediction(row));
});
test("no model, failed model and invalid response produce unavailable rather than a dummy probability", async () => {
  const previous = process.env.MODEL_URL;
  try {
    delete process.env.MODEL_URL;
    assert.equal(
      (await predict(buildFeatures([event()], now))).status,
      "unavailable",
    );
    process.env.MODEL_URL = "http://model/predict";
    assert.equal(
      (
        await predict(buildFeatures([event()], now), async () => {
          throw new Error("timeout");
        })
      ).status,
      "unavailable",
    );
    assert.equal(
      (
        await predict(buildFeatures([event()], now), async () => ({
          ok: true,
          text: async () => JSON.stringify({ probability: 0.5 }),
        }))
      ).status,
      "unavailable",
    );
  } finally {
    if (previous === undefined) delete process.env.MODEL_URL;
    else process.env.MODEL_URL = previous;
  }
});
