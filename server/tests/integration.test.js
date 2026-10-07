import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import authRoutes from "../src/routes/authRoutes.js";
import patientRoutes from "../src/routes/patientRoutes.js";
import { researchRouter, ingestRouter } from "../src/delirium/routes.js";
import { Device, WatchEvent, Assessment } from "../src/delirium/models.js";
import User from "../src/models/User.js";
import Patient from "../src/models/Patient.js";
import errorHandler from "../src/utils/errorHandler.js";

test(
  "real Mongo API: auth, empty patients, linking, retries, cognition, handoff, late upload, model and export",
  { skip: !process.env.TEST_MONGODB_URI },
  async () => {
    process.env.JWT_SECRET = "test-only-jwt-secret";
    process.env.INGEST_TOKEN = "test-only-provisioning-secret";
    process.env.REGISTRATION_CODE = "test-only-registration";
    process.env.COOKIE_SECURE = "false";
    delete process.env.MODEL_URL;
    await mongoose.connect(process.env.TEST_MONGODB_URI, {
      dbName: `integration_${randomUUID().replace(/-/g, "")}`,
    });
    await Promise.all([
      Device.init(),
      WatchEvent.init(),
      Assessment.init(),
      User.init(),
      Patient.init(),
    ]);
    const app = express();
    app.use(express.json({ limit: "8mb" }));
    app.use(cookieParser());
    app.use("/api/v1/auth", authRoutes);
    app.use("/api/v1/patients", patientRoutes);
    app.use("/api/v1/research", researchRouter);
    app.use("/api/v1", ingestRouter);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    let cookie = "";
    const call = async (path, method = "GET", body, deviceToken) => {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(deviceToken
            ? { Authorization: `Bearer ${deviceToken}` }
            : cookie
              ? { Cookie: cookie }
              : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await r.text();
      return {
        status: r.status,
        data: text ? JSON.parse(text) : null,
        headers: r.headers,
      };
    };
    const row = (
      study_id = "DW-A",
      type = "heart_rate",
      payload = { bpm: 72, status: null },
      ts_ms = Date.now() - 1000,
    ) => ({
      event_id: randomUUID(),
      device_id: "watch-1",
      study_id,
      ts_ms,
      type,
      source: "android",
      payload,
    });
    try {
      assert.equal((await call("/research/devices")).status, 401);
      assert.equal(
        (
          await call("/auth/signup", "POST", {
            fullName: "Researcher",
            email: "test@example.com",
            password: "test-password",
          })
        ).status,
        403,
      );
      const signed = await call("/auth/signup", "POST", {
        fullName: "Researcher",
        email: "test@example.com",
        password: "test-password",
        registrationCode: process.env.REGISTRATION_CODE,
        role: "admin",
      });
      assert.equal(signed.status, 201);
      assert.equal(signed.data.role, "doctor");
      cookie = signed.headers.get("set-cookie").split(";")[0];
      assert.equal((await call("/patients")).status, 200);
      const a = (
        await call("/patients", "POST", { name: "Patient A", age: 70 })
      ).data;
      const b = (await call("/patients", "POST", { name: "Patient B" })).data;
      assert.equal(a.status, "unknown");
      const empty = (await call(`/research/patients/${a._id}/overview`)).data;
      assert.deepEqual(empty.latest, {});
      assert.equal(empty.prediction.status, "unavailable");
      const hr = row();
      assert.equal(
        (await call("/ingest", "POST", { events: [hr] })).status,
        401,
      ); // Cookie is not a device credential.
      const ingested = await call(
        "/ingest",
        "POST",
        { events: [hr] },
        process.env.INGEST_TOKEN,
      );
      assert.equal(ingested.status, 200);
      assert.equal(ingested.data.unassigned, 1);
      const retry = await call(
        "/ingest",
        "POST",
        { events: [hr] },
        process.env.INGEST_TOKEN,
      );
      assert.equal(retry.data.inserted, 0);
      assert.equal(retry.data.duplicates, 1);
      assert.equal(
        (
          await call(
            "/ingest",
            "POST",
            { events: [{ ...hr, payload: { bpm: 120 } }] },
            process.env.INGEST_TOKEN,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call("/research/devices/watch-1/assignment", "PUT", {
            patientId: a._id,
            studyId: "DW-A",
            includeBuffered: true,
          })
        ).data.backfilled,
        1,
      );
      const scoped = (await call("/research/devices/watch-1/token", "POST", {}))
        .data.token;
      assert.equal(
        (
          await call(
            "/device-assignment?device_id=watch-1",
            "GET",
            undefined,
            scoped,
          )
        ).data.patient_name,
        "Patient A",
      );
      assert.equal(
        (
          await call(
            "/device-assignment?device_id=watch-2",
            "GET",
            undefined,
            scoped,
          )
        ).status,
        401,
      );
      const cognition = [
        row("DW-A", "cognition_trial", {
          session_id: "session-1",
          task: "attention",
          trial_index: 0,
          expected: "tap",
          response: "tap",
          correct: true,
          rt_ms: 400,
        }),
        row("DW-A", "cognition_summary", {
          session_id: "session-1",
          task: "attention",
          accuracy: 1,
          median_rt_ms: 400,
          rt_sd_ms: null,
          omissions: 0,
          commissions: 0,
          trials: 1,
        }),
        row("DW-A", "cognition_prompt_outcome", {
          session_id: "session-1",
          outcome: "completed",
          prompt_id: 1,
        }),
      ];
      const stored = await call(
        "/ingest",
        "POST",
        { events: cognition },
        scoped,
      );
      assert.equal(stored.status, 200);
      assert.equal(stored.data.unassigned, 0);
      assert.equal(
        (await call(`/research/patients/${a._id}/cognition`)).data.events
          .length,
        2,
      );
      assert.equal(
        (await call(`/research/patients/${a._id}/cognition/session-1/trials`))
          .data.events[0].payload.rt_ms,
        400,
      );
      const invalid = row("DW-A", "heart_rate", { bpm: 400 });
      const before = await WatchEvent.countDocuments();
      assert.equal(
        (await call("/ingest", "POST", { events: [row(), invalid] }, scoped))
          .status,
        400,
      );
      assert.equal(await WatchEvent.countDocuments(), before);
      const delayed = row("DW-A");
      await call("/research/devices/watch-1/assignment", "DELETE");
      assert.equal(
        (
          await call("/research/devices/watch-1/assignment", "PUT", {
            patientId: b._id,
            studyId: "DW-A",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call("/research/devices/watch-1/assignment", "PUT", {
            patientId: b._id,
            studyId: "DW-B",
          })
        ).status,
        200,
      );
      assert.equal(
        (await call("/ingest", "POST", { events: [delayed] }, scoped)).status,
        200,
      );
      assert.equal(
        String(
          (await WatchEvent.findOne({ event_id: delayed.event_id })).patientId,
        ),
        a._id,
      );
      const fresh = row(
        "DW-B",
        "heart_rate",
        { bpm: 85, status: null },
        Date.now(),
      );
      await call("/ingest", "POST", { events: [fresh] }, scoped);
      const dataB = (await call(`/research/patients/${b._id}/overview`)).data;
      assert.equal(dataB.latest.heart_rate_bpm.value, 85);
      assert.equal(dataB.features.values.attention_accuracy, null);
      assert.equal(
        (await call(`/patients/${a._id}`, "PUT", { name: "Patient A renamed" }))
          .data.fullName,
        "Patient A renamed",
      );
      assert.equal((await call(`/patients/${a._id}`, "DELETE")).status, 409);
      assert.equal(
        (
          await call(`/research/patients/${a._id}/assessments`, "POST", {
            ts_ms: Date.now(),
            instrument: "4AT",
            score: 13,
            delirium: "uncertain",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await call(`/research/patients/${a._id}/assessments`, "POST", {
            ts_ms: Date.now(),
            instrument: "4AT",
            score: 4,
            delirium: "uncertain",
            notes: "Screened; diagnosis not inferred",
          })
        ).status,
        201,
      );
      const exported = await fetch(
        `${base}/research/patients/${a._id}/export?from=${Date.now() - 86400000}&to=${Date.now() + 1}`,
        { headers: { Cookie: cookie } },
      );
      const records = (await exported.text())
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.ok(
        records.some(
          (r) => r.record_type === "assessment" && r.delirium === "uncertain",
        ),
      );
      assert.ok(records.some((r) => r.type === "cognition_trial"));
      assert.ok(records.every((r) => !r.contentHash));
      const oldToken = scoped,
        rotated = (await call("/research/devices/watch-1/token", "POST", {}))
          .data.token;
      assert.equal(
        (
          await call(
            "/device-assignment?device_id=watch-1",
            "GET",
            undefined,
            oldToken,
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await call(
            "/device-assignment?device_id=watch-1",
            "GET",
            undefined,
            rotated,
          )
        ).data.patient_name,
        "Patient B",
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  },
);
