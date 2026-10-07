import importlib.util
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
spec = importlib.util.spec_from_file_location('model_adapter', Path(__file__).with_name('main.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Features, Artifact, infer = module.Features, module.Artifact, module.infer

def features(**changes):
    body = dict(schema_version='delirium-watch.features.v1', as_of_ms=1760000000000, window_start_ms=1760000000000-86400000, window_hours=24,
                values={'heart_rate_mean_bpm': 80., 'attention_accuracy': None}, quality={'event_count': 10, 'last_event_ms': 1760000000000, 'movement_coverage': .8, 'heart_rate_minute_coverage': .8})
    body.update(changes)
    return Features.model_validate(body)

def artifact(**changes):
    # Artificial coefficients are test fixtures only; not deployment artifacts.
    body = dict(format='delirium-watch.logistic.v1', feature_schema_version='delirium-watch.features.v1', model_version='unit-test-fixture', target='incident_delirium', horizon_hours=24., window_hours=24, intercept=-1.,
                terms=[dict(feature='heart_rate_mean_bpm', coefficient=.2, mean=70., scale=10., impute=70.)], min_movement_coverage=.5, min_heart_rate_minute_coverage=.5, max_event_age_hours=1., required_features=['heart_rate_mean_bpm'], training_description='Test fixture only', validation_description='Test fixture only')
    body.update(changes)
    return Artifact.model_validate(body)

def test_fixture_formula():
    result = infer(features(), artifact())
    assert result['status'] == 'ok'
    assert result['probability'] == pytest.approx(.3100255189)
    assert result['intended_use'] == 'research'

def test_missing_and_stale_recordings_fail_closed():
    assert infer(features(values={'heart_rate_mean_bpm': None}), artifact())['status'] == 'unavailable'
    assert infer(features(quality={'event_count': 0}), artifact())['status'] == 'unavailable'
    assert infer(features(quality={'event_count': 10, 'last_event_ms': 1760000000000-7200000, 'movement_coverage': .8, 'heart_rate_minute_coverage': .8}), artifact())['status'] == 'unavailable'
    assert infer(features(), artifact(min_movement_coverage=.9))['status'] == 'unavailable'

def test_wrong_feature_schema_or_nonfinite_values_are_rejected():
    for body in [dict(schema_version='wrong'), dict(values={'heart_rate_mean_bpm': float('nan')})]:
        with pytest.raises(Exception): features(**body)

def test_inconsistent_target_window_and_artifact_are_rejected():
    assert infer(features(), artifact(horizon_hours=0))['status'] == 'unavailable'
    assert infer(features(), artifact(window_hours=6))['status'] == 'unavailable'
    with pytest.raises(Exception): artifact(intercept=float('nan'))

def test_api_requires_token_and_no_model_returns_unavailable(tmp_path, monkeypatch):
    monkeypatch.setenv('MODEL_API_TOKEN', 'test-model-secret')
    monkeypatch.setenv('MODEL_FILE', str(tmp_path/'missing.json'))
    client = TestClient(module.app)
    assert client.post('/predict', json=features().model_dump()).status_code == 401
    result = client.post('/predict', json=features().model_dump(), headers={'Authorization': 'Bearer test-model-secret'})
    assert result.status_code == 200
    assert result.json()['status'] == 'unavailable'
    file = tmp_path/'trained-fixture.json'
    file.write_text(artifact().model_dump_json())
    monkeypatch.setenv('MODEL_FILE', str(file))
    result = client.post('/predict', json=features().model_dump(), headers={'Authorization': 'Bearer test-model-secret'})
    assert result.json()['model_version'] == 'unit-test-fixture'
