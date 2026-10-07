import express from "express";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import protectedRoute from "../middleware/auth.middleware.js";
import Patient from "../models/Patient.js";
import { Device, WatchEvent, Assessment } from "./models.js";
import {
  validateBatch,
  assignmentFor,
  hashToken,
  secretMatches,
  text,
  fail,
  number,
} from "./contract.js";
import { overview, predict } from "./features.js";
export const ingestRouter = express.Router();
export const researchRouter = express.Router();
const objectId = (value) => {
  if (!mongoose.isValidObjectId(value)) fail("Invalid patient ID");
  return value;
};
const canonical = (value) =>
  value && typeof value === "object"
    ? Array.isArray(value)
      ? value.map(canonical)
      : Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
    : value;
const contentHash = (event) => hashToken(JSON.stringify(canonical(event)));
function bearer(req) {
  return req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] || "";
}
function globalKey(token) {
  return [
    process.env.INGEST_TOKEN,
    ...(process.env.VALID_API_KEYS || "").split(","),
  ]
    .filter(Boolean)
    .some((key) => secretMatches(token, hashToken(key.trim())));
}
async function deviceAuth(req, ids) {
  const token = bearer(req);
  if (!token) fail("A device Bearer token is required", 401);
  if (globalKey(token)) return;
  if (ids.length !== 1)
    fail("Device token can access only its own device", 403);
  const device = await Device.findOne({ deviceId: ids[0] }).select(
    "+tokenHash",
  );
  if (!device?.tokenHash || !secretMatches(token, device.tokenHash))
    fail("Invalid device token", 401);
}
// The supplied deployment runs one Node API worker. Serialize ingestion/link changes
// so a handoff cannot race an upload. Do not scale API replicas without DB transactions.
let mutation = Promise.resolve();
const mutate = (fn) => {
  const operation = mutation.then(fn);
  mutation = operation.catch(() => {});
  return operation;
};
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
ingestRouter.post(
  "/ingest",
  handle(async (req, res) => {
    const events = validateBatch(req.body),
      ids = [...new Set(events.map((e) => e.device_id))];
    await deviceAuth(req, ids);
    const result = await mutate(async () => {
      const existing = await WatchEvent.find({
        event_id: { $in: events.map((e) => e.event_id) },
      })
        .select("event_id contentHash")
        .lean();
      for (const e of existing)
        if (
          e.contentHash !==
          contentHash(events.find((row) => row.event_id === e.event_id))
        )
          fail("An event UUID already exists with different content", 409);
      const devices = new Map();
      for (const id of ids) {
        const own = events.filter((e) => e.device_id === id);
        const device = await Device.findOneAndUpdate(
          { deviceId: id },
          {
            $setOnInsert: { label: "", assignments: [] },
            $min: { firstSeen: Math.min(...own.map((e) => e.ts_ms)) },
            $max: { lastSeen: Math.max(...own.map((e) => e.ts_ms)) },
            $addToSet: {
              studyIds: { $each: [...new Set(own.map((e) => e.study_id))] },
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: false },
        );
        devices.set(id, device);
      }
      const operations = events.map((e) => {
        const assignment = assignmentFor(devices.get(e.device_id), e);
        return {
          updateOne: {
            filter: { event_id: e.event_id },
            update: {
              $setOnInsert: {
                ...e,
                contentHash: contentHash(e),
                patientId: assignment?.patientId || null,
                assignmentId: assignment?._id || null,
              },
            },
            upsert: true,
          },
        };
      });
      // A failed write returns non-2xx, retaining the whole batch on the phone. Retrying
      // a partially persisted batch is safe because the UUID index is unique.
      const saved = await WatchEvent.bulkWrite(operations, { ordered: true });
      const unassigned = await WatchEvent.countDocuments({
        event_id: { $in: events.map((e) => e.event_id) },
        patientId: null,
      });
      return {
        accepted: events.length,
        inserted: saved.upsertedCount,
        duplicates: events.length - saved.upsertedCount,
        unassigned,
        acknowledged_event_ids: events.map((e) => e.event_id),
      };
    });
    res.json(result);
  }),
);
ingestRouter.get(
  "/device-assignment",
  handle(async (req, res) => {
    const id = text(req.query.device_id, "device_id");
    await deviceAuth(req, [id]);
    const device = await Device.findOne({ deviceId: id }).lean();
    const current = device?.assignments.find((a) => a.to == null);
    const patient = current
      ? await Patient.findById(current.patientId).select("fullName").lean()
      : null;
    res.json({
      device_id: id,
      linked: !!patient,
      patient_name: patient?.fullName || null,
      study_id: patient ? current.studyId : null,
    });
  }),
);
researchRouter.use(protectedRoute);
researchRouter.get(
  "/devices",
  handle(async (req, res) => {
    const devices = await Device.find().sort({ lastSeen: -1 }).lean();
    res.json({ devices });
  }),
);
researchRouter.post(
  "/devices",
  handle(async (req, res) => {
    const id = text(req.body.deviceId, "deviceId"),
      label = String(req.body.label || "")
        .trim()
        .slice(0, 100);
    const device = await mutate(() =>
      Device.findOneAndUpdate(
        { deviceId: id },
        { $set: { label }, $setOnInsert: { assignments: [], studyIds: [] } },
        { upsert: true, new: true },
      ),
    );
    res.status(201).json(device);
  }),
);
researchRouter.post(
  "/devices/:id/token",
  handle(async (req, res) => {
    const token = randomBytes(32).toString("hex");
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.id },
      { $set: { tokenHash: hashToken(token) } },
    );
    if (!device) fail("Device not found", 404);
    res.json({
      token,
      message:
        "Copy this token into the phone; it will not be displayed again. Previous device token is revoked.",
    });
  }),
);
researchRouter.put(
  "/devices/:id/assignment",
  handle(async (req, res) => {
    const patientId = objectId(req.body.patientId),
      studyId = text(req.body.studyId, "studyId");
    if (studyId === "UNASSIGNED") fail("Choose a fresh pseudonymous study ID");
    if (!(await Patient.exists({ _id: patientId })))
      fail("Patient not found", 404);
    const result = await mutate(async () => {
      const device = await Device.findOne({ deviceId: req.params.id });
      if (!device) fail("Device not found", 404);
      if (device.assignments.some((a) => a.to == null))
        fail("Unlink the current patient before linking again", 409);
      if (device.assignments.some((a) => a.studyId === studyId))
        fail(
          "Use a fresh study ID for each assignment; historical IDs cannot be reused",
          409,
        );
      const now = Date.now();
      let from = now;
      if (req.body.includeBuffered === true) {
        const oldest = await WatchEvent.findOne({
          device_id: device.deviceId,
          study_id: studyId,
          patientId: null,
          ts_ms: { $lte: now },
        })
          .sort({ ts_ms: 1 })
          .select("ts_ms")
          .lean();
        if (oldest) from = oldest.ts_ms;
      }
      // Explicit buffered import never crosses another assignment interval.
      if (device.assignments.some((a) => a.to > from))
        fail(
          "Buffered data overlaps a past assignment; link from now instead",
          409,
        );
      device.assignments.push({
        patientId,
        studyId,
        from,
        to: null,
        linkedBy: req.user._id,
      });
      await device.save();
      const assignment = device.assignments.at(-1);
      const backfilled = await WatchEvent.updateMany(
        {
          device_id: device.deviceId,
          study_id: studyId,
          patientId: null,
          ts_ms: { $gte: from, $lte: now },
        },
        { $set: { patientId, assignmentId: assignment._id } },
      );
      return { device, backfilled: backfilled.modifiedCount };
    });
    res.json(result);
  }),
);
researchRouter.delete(
  "/devices/:id/assignment",
  handle(async (req, res) => {
    const device = await mutate(async () => {
      const found = await Device.findOne({ deviceId: req.params.id });
      if (!found) fail("Device not found", 404);
      const active = found.assignments.find((a) => a.to == null);
      if (active) {
        active.to = Date.now();
        await found.save();
      }
      return found;
    });
    res.json(device);
  }),
);
const loadWindow = async (patientId, asOf, hours = 24) => {
  const events = await WatchEvent.find({
    patientId,
    ts_ms: { $gte: asOf - hours * 3_600_000, $lte: asOf },
  })
    .select("-payload.raw -contentHash -__v")
    .sort({ ts_ms: -1 })
    .limit(200001)
    .lean();
  return { events: events.slice(0, 200000), truncated: events.length > 200000 };
};
researchRouter.get(
  "/patients/:id/overview",
  handle(async (req, res) => {
    const patientId = objectId(req.params.id),
      now = Date.now();
    if (!(await Patient.exists({ _id: patientId })))
      fail("Patient not found", 404);
    const { events, truncated } = await loadWindow(patientId, now);
    const data = overview(events, now);
    const devices = await Device.find({
      "assignments.patientId": patientId,
    }).lean();
    const assessments = await Assessment.find({ patientId })
      .sort({ ts_ms: -1 })
      .limit(100)
      .lean();
    res.json({
      ...data,
      as_of_ms: now,
      truncated,
      devices,
      assessments,
      prediction: {
        ...(truncated
          ? { status: "unavailable", reason: "Window exceeds event limit" }
          : await predict(data.features)),
        model_configured: Boolean(process.env.MODEL_URL),
      },
    });
  }),
);
researchRouter.get(
  "/patients/:id/cognition",
  handle(async (req, res) => {
    const patientId = objectId(req.params.id);
    const filter = {
      patientId,
      type: { $in: ["cognition_summary", "cognition_prompt_outcome"] },
    };
    const total = await WatchEvent.countDocuments(filter);
    const events = await WatchEvent.find(filter)
      .select("-contentHash")
      .sort({ ts_ms: -1 })
      .limit(500)
      .lean();
    res.json({ events, total, truncated: total > 500 });
  }),
);
researchRouter.get(
  "/patients/:id/cognition/:session/trials",
  handle(async (req, res) => {
    const events = await WatchEvent.find({
      patientId: objectId(req.params.id),
      type: "cognition_trial",
      "payload.session_id": text(req.params.session, "session"),
    })
      .select("-contentHash")
      .sort({ ts_ms: 1 })
      .limit(2001)
      .lean();
    res.json({
      events: events.slice(0, 2000),
      truncated: events.length > 2000,
    });
  }),
);
researchRouter.post(
  "/patients/:id/assessments",
  handle(async (req, res) => {
    const patientId = objectId(req.params.id),
      b = req.body;
    if (!(await Patient.exists({ _id: patientId })))
      fail("Patient not found", 404);
    if (
      !Number.isSafeInteger(b.ts_ms) ||
      b.ts_ms <= 0 ||
      b.ts_ms > Date.now() + 300_000
    )
      fail("Invalid assessment time");
    if (
      !["4AT", "CAM", "CAM-ICU", "clinical"].includes(b.instrument) ||
      !["present", "absent", "uncertain"].includes(b.delirium)
    )
      fail("Invalid assessment");
    if (
      b.score != null &&
      (number(b.score) === null ||
        (b.instrument === "4AT" &&
          (!Number.isInteger(b.score) || b.score < 0 || b.score > 12)))
    )
      fail("Invalid assessment score");
    const assessment = await Assessment.create({
      patientId,
      ts_ms: b.ts_ms,
      instrument: b.instrument,
      delirium: b.delirium,
      score: b.score ?? null,
      notes: String(b.notes || "").slice(0, 2000),
      recordedBy: req.user._id,
    });
    res.status(201).json(assessment);
  }),
);
researchRouter.get(
  "/patients/:id/export",
  handle(async (req, res) => {
    const patientId = objectId(req.params.id);
    const from = Number(req.query.from),
      to = Number(req.query.to);
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from <= 0 ||
      to <= from ||
      to - from > 31 * 86400000
    )
      fail("Export needs from/to epoch milliseconds covering at most 31 days");
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="watch-events.ndjson"',
    );
    const cursor = WatchEvent.find({
      patientId,
      ts_ms: { $gte: from, $lt: to },
    })
      .select("-contentHash -__v")
      .sort({ ts_ms: 1 })
      .lean()
      .cursor();
    try {
      for await (const event of cursor) {
        if (res.destroyed) break;
        if (
          !res.write(JSON.stringify({ record_type: "event", ...event }) + "\n")
        ) {
          await new Promise((resolve) => {
            const done = () => {
              res.off("drain", done);
              res.off("close", done);
              resolve();
            };
            res.once("drain", done);
            res.once("close", done);
          });
        }
      }
      if (!res.destroyed) {
        const assessments = await Assessment.find({
          patientId,
          ts_ms: { $gte: from, $lt: to },
        }).lean();
        for (const a of assessments)
          res.write(JSON.stringify({ record_type: "assessment", ...a }) + "\n");
        res.end();
      }
    } finally {
      await cursor.close();
    }
  }),
);

