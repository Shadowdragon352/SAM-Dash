"""Optional research inference API. No model/weights are shipped."""
import hmac
import json
import math
import os
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt

app = FastAPI(title="DeliriumWatch model adapter", version="1")

class Features(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal["delirium-watch.features.v1"]
    as_of_ms: StrictInt = Field(gt=0)
    window_start_ms: StrictInt = Field(gt=0)
    window_hours: StrictInt = Field(ge=1, le=168)
    values: dict[str, StrictFloat | StrictInt | None]
    quality: dict

class Term(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    feature: str
    coefficient: float
    mean: float
    scale: float = Field(gt=0)
    impute: float
    missing_coefficient: float = 0

class Artifact(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    format: Literal["delirium-watch.logistic.v1"]
    feature_schema_version: Literal["delirium-watch.features.v1"]
    model_version: str = Field(min_length=1, max_length=100)
    target: Literal["incident_delirium", "current_delirium"]
    horizon_hours: float = Field(ge=0, le=168)
    window_hours: int = Field(ge=1, le=168)
    intercept: float
    terms: list[Term] = Field(min_length=1)
    min_movement_coverage: float = Field(ge=0, le=1)
    min_heart_rate_minute_coverage: float = Field(ge=0, le=1)
    max_event_age_hours: float = Field(gt=0, le=168)
    required_features: list[str]
    training_description: str = Field(min_length=1)
    validation_description: str = Field(min_length=1)

def unavailable(reason):
    return {"status": "unavailable", "reason": reason}

def infer(features: Features, artifact: Artifact):
    if ((artifact.target == "current_delirium" and artifact.horizon_hours != 0)
        or (artifact.target == "incident_delirium" and artifact.horizon_hours <= 0)):
        return unavailable("Model target/horizon is inconsistent")
    if features.window_hours != artifact.window_hours or features.window_start_ms >= features.as_of_ms:
        return unavailable("Feature window does not match the trained model")
    q = features.quality
    required_quality = ("event_count", "last_event_ms", "movement_coverage", "heart_rate_minute_coverage")
    if any(not isinstance(q.get(k), (int, float)) or isinstance(q.get(k), bool) or not math.isfinite(q[k]) for k in required_quality):
        return unavailable("Missing or invalid recording quality")
    if q["event_count"] <= 0 or q["last_event_ms"] > features.as_of_ms or features.as_of_ms - q["last_event_ms"] > artifact.max_event_age_hours * 3600000:
        return unavailable("Insufficient recent recorded data")
    if q["movement_coverage"] < artifact.min_movement_coverage or q["heart_rate_minute_coverage"] < artifact.min_heart_rate_minute_coverage:
        return unavailable("Recording coverage is below this model's requirements")
    if any(features.values.get(key) is None for key in artifact.required_features):
        return unavailable("A required model signal is missing")
    if any(term.feature not in features.values for term in artifact.terms) or len({t.feature for t in artifact.terms}) != len(artifact.terms):
        return unavailable("Model feature names are incompatible")
    z = artifact.intercept
    for term in artifact.terms:
        value = features.values[term.feature]
        missing = value is None
        z += term.coefficient * (((term.impute if missing else value) - term.mean) / term.scale)
        if missing:
            z += term.missing_coefficient
    if not math.isfinite(z):
        return unavailable("Model calculation is not finite")
    probability = 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))
    return {"schema_version": "delirium-watch.prediction.v1", "status": "ok", "probability": probability,
            "target": artifact.target, "horizon_hours": artifact.horizon_hours, "model_version": artifact.model_version,
            "intended_use": "research"}

@app.get("/health")
def health():
    return {"ok": True, "model_file_present": Path(os.getenv("MODEL_FILE", "/models/model.json")).is_file()}

@app.post("/predict")
def predict(features: Features, authorization: str | None = Header(default=None)):
    key = os.getenv("MODEL_API_TOKEN", "")
    if not key or not hmac.compare_digest(authorization or "", f"Bearer {key}"):
        raise HTTPException(401, "A model API token is required")
    path = Path(os.getenv("MODEL_FILE", "/models/model.json"))
    if not path.is_file():
        return unavailable("No trained model artifact installed")
    try:
        artifact = Artifact.model_validate(json.loads(path.read_text()))
    except Exception:
        return unavailable("Model artifact is invalid")
    return infer(features, artifact)
