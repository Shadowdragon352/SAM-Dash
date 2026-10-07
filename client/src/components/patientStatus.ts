export type PatientPrediction = {
  status: string;
  model_configured?: boolean;
  status_level?: "green" | "yellow" | "red";
  reason?: string;
  probability?: number;
  model_version?: string;
};

export function patientStatus(prediction?: PatientPrediction, failed = false) {
  if (failed) return { colour: "yellow", label: "Refresh unavailable", detail: "The patient summary could not refresh." };
  if (!prediction) return { colour: "grey", label: "Loading status", detail: "Waiting for the patient summary." };
  if (prediction.model_configured === false)
    return { colour: "green", label: "Default · no model", detail: "Green is the configured default. No model assessment has been made." };
  if (prediction.status !== "ok")
    return { colour: "yellow", label: "Model unavailable", detail: prediction.reason || "A model assessment is unavailable." };
  if (!prediction.status_level)
    return { colour: "yellow", label: "Model band missing", detail: "The model returned a probability but did not supply a status_level." };
  return {
    colour: prediction.status_level,
    label: `Model · ${prediction.status_level}`,
    detail: `${prediction.model_version || "Research model"}${typeof prediction.probability === "number" ? ` · ${(prediction.probability * 100).toFixed(0)}% estimated probability` : ""}. Research output, not a diagnosis.`,
  };
}
