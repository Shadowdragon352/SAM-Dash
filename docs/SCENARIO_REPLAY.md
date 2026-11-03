# Colab scenario replay

Sign in to SAM, select **Scenario replay** in the header, and import `sam_replay.json` extracted from `sam_dashboard_scenarios.zip`. Choose a scenario, play one hourly row per second, scrub the step slider, or reset. Playback stops at the final row; changing scenarios resets it.

The JSON is read locally in the browser. It is not sent to the API, added to patient records, persisted, or used by the model service. Reloading or leaving the page clears it. Importing another file clears the old replay, including on validation failure.

Required format: the Colab scenario export with explicit `SCRIPTED SYNTHETIC` observation provenance, supported vital provenance, `clinical_prediction: false`, numeric hour and age, numeric-or-null heart rate and SpO2, and boolean synthetic observation fields. Import is limited to 5 MB and 10,000 rows. Duplicate hours within a scenario are rejected.

Recorded ICU vital signs are not smartwatch data. All baseline histories, behavioural changes, medication context and dropout events are synthetic. Source identity/provenance declarations are validated as metadata, not independently authenticated. The importer does not trust exported message text; messages are derived from typed scenario fields. Concurrent baseline, change, medication and data-quality messages remain visible. Charts retain null gaps and display only rows reached in playback.

No SAD probability, clinical threshold, clinical diagnosis or validated warning algorithm is provided. A missing prompt does not establish stability. Do not configure the experimental sepsis model as an incident-delirium model. See the PhysioNet 2019 source: https://physionet.org/content/challenge-2019/1.0.0/ ; Reyna et al. (2019), DOI:10.13026/v64v-d857, CC BY 4.0. No source patient dataset is committed in this change.

Validation: `npm run build` and `node --test tests/*.test.mjs` from `client/`. Manual check: import the Colab JSON, confirm all five scenarios, verify Play/Pause/Reset, switch scenarios during playback, verify null chart gaps, and confirm invalid import clears the previous case.
