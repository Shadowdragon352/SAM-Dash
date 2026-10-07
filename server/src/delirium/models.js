import mongoose from "mongoose";
const { Schema } = mongoose;
const assignment = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    studyId: { type: String, required: true },
    from: { type: Number, required: true },
    to: { type: Number, default: null },
    linkedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);
const device = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    label: { type: String, default: "" },
    tokenHash: { type: String, select: false },
    firstSeen: Number,
    lastSeen: Number,
    studyIds: [String],
    assignments: [assignment],
  },
  { timestamps: true },
);
const event = new Schema(
  {
    event_id: { type: String, required: true, unique: true },
    device_id: { type: String, required: true },
    study_id: { type: String, required: true },
    ts_ms: { type: Number, required: true },
    contentHash: { type: String, required: true },
    type: { type: String, required: true },
    source: String,
    payload: { type: Schema.Types.Mixed, required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", default: null },
    assignmentId: Schema.Types.ObjectId,
    receivedAt: { type: Date, default: Date.now },
  },
  { minimize: false },
);
event.index({ patientId: 1, ts_ms: -1 });
event.index({ device_id: 1, study_id: 1, ts_ms: 1 });
const assessment = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    ts_ms: { type: Number, required: true },
    instrument: {
      type: String,
      enum: ["4AT", "CAM", "CAM-ICU", "clinical"],
      required: true,
    },
    score: { type: Number, default: null },
    delirium: {
      type: String,
      enum: ["present", "absent", "uncertain"],
      required: true,
    },
    notes: { type: String, maxlength: 2000 },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
assessment.index({ patientId: 1, ts_ms: -1 });
export const Device = mongoose.model("WatchDevice", device);
export const WatchEvent = mongoose.model("WatchEvent", event);
export const Assessment = mongoose.model("DeliriumAssessment", assessment);
