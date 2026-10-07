# Patient widget status

The patient home page supports grid and list layouts, with the latest recorded
heart rate, skin temperature and movement readings. No values are fabricated.
The view shows 12 patients per page, refreshes summaries every 30 seconds and
allows at most three concurrent summary requests. A reading older than five
minutes is labelled as an older reading.

The overview API adds `prediction.model_configured`, derived from `MODEL_URL`.
When no model is configured, widgets display green with the label
`Default · no model`. This default is not a model assessment.

To control the indicator, a model API can add the optional `status_level` field
to its existing prediction response:

```json
{
  "schema_version": "delirium-watch.prediction.v1",
  "status": "ok",
  "probability": 0.42,
  "target": "incident_delirium",
  "horizon_hours": 24,
  "model_version": "your-trained-model",
  "status_level": "yellow"
}
```

Accepted levels are exactly `green`, `yellow` and `red`. The API validates and
passes through that field. The model service owns the banding policy; the
dashboard does not infer a band from probability or invent clinical cutoffs.
The optional logistic adapter still returns probability only, so its trained
deployment must be extended to supply a validated band before colour banding
is used. Models without this field continue to work and show `Model band missing`.

While loading, the indicator is grey. A configured model that cannot produce a
result, a missing band, or a failed refresh displays yellow with a specific
label rather than a green model assessment. Colour is always accompanied by
text. Existing prediction results remain research outputs, not diagnoses.

Deploy this update by rebuilding both `api` and `web`; the frontend requires
the new model-configuration metadata from the API.
