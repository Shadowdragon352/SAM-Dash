import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import { Device } from "../delirium/models.js";
import { fail } from "../delirium/contract.js";
const allowed = [
  "age",
  "gender",
  "contactInfo",
  "medicalHistorySummary",
  "emergencyContact",
  "location",
  "room",
  "condition",
  "additionalInfo",
  "recentVisits",
];
function fields(body) {
  const result = {};
  if (body.name !== undefined || body.fullName !== undefined) {
    const name = body.name ?? body.fullName;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 200)
      fail("Patient name is required (up to 200 characters)");
    result.fullName = name.trim();
  }
  for (const key of allowed)
    if (body[key] !== undefined) result[key] = body[key];
  return result;
}
function id(value) {
  if (!mongoose.isValidObjectId(value)) fail("Invalid patient ID");
  return value;
}
export async function createPatient(req, res, next) {
  try {
    const data = fields(req.body);
    if (!data.fullName) fail("Patient name is required");
    res.status(201).json(await Patient.create(data));
  } catch (e) {
    next(e);
  }
}
export async function getAllPatients(req, res, next) {
  try {
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page) || 1)),
      limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const search = String(req.query.search || "")
      .slice(0, 200)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = search ? { fullName: { $regex: search, $options: "i" } } : {};
    const [patients, count] = await Promise.all([
      Patient.find(query)
        .sort({ fullName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Patient.countDocuments(query),
    ]);
    res.json({
      patients,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalPatients: count,
    });
  } catch (e) {
    next(e);
  }
}
export async function getPatientById(req, res, next) {
  try {
    const patient = await Patient.findById(id(req.params.id));
    if (!patient) fail("Patient not found", 404);
    res.json(patient);
  } catch (e) {
    next(e);
  }
}
export async function updatePatient(req, res, next) {
  try {
    const patient = await Patient.findByIdAndUpdate(
      id(req.params.id),
      { $set: fields(req.body) },
      { new: true, runValidators: true },
    );
    if (!patient) fail("Patient not found", 404);
    res.json(patient);
  } catch (e) {
    next(e);
  }
}
export async function deletePatient(req, res, next) {
  try {
    const patient = await Patient.findById(id(req.params.id));
    if (!patient) fail("Patient not found", 404);
    if (await Device.exists({ "assignments.patientId": patient._id }))
      fail(
        "This patient has device history. Retain the patient to preserve attribution.",
        409,
      );
    await patient.deleteOne();
    res.status(204).end();
  } catch (e) {
    next(e);
  }
}
