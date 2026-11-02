# SAM-Dash

SAM-Dash is the web dashboard and API for the SAM / DeliriumWatch university prototype. It receives recorded events from the companion Android phone/watch application, links watches to patients, and displays measurements, cognition task results and research assessments.

This repository is adapted from [kika1s1/patient-health-monitoring-system](https://github.com/kika1s1/patient-health-monitoring-system). The patient workflow, device integration, research API, graphs and deployment tooling have been customised for SAM.

This README describes the `main` branch. The separate scenario replay and private team demo branches are described below.

## Current features

- Searchable patient directory with grid/list layouts and a dedicated create/edit patient view.
- Patient widgets showing the latest recorded heart rate, skin temperature and movement, with reading age and a labelled status indicator.
- Patient charts showing five-minute means over the last 24 hours. Select windows from 30 minutes to 24 hours, drag or use the slider/keyboard to browse history, and return to live updates with **Latest**.
- Optional light chart smoothing with the original means still visible. Missing readings remain gaps; axis ranges expand to include outliers.
- Watch registration, per-device upload tokens, patient assignment and assignment history. Each assignment uses a fresh pseudonymous study ID.
- Cognition task summaries, individual trials and prompt outcomes received from the watch, including accuracy, reaction times and omissions/commissions where recorded.
- Manual recording of 4AT, CAM, CAM-ICU and clinical assessments, plus NDJSON event/assessment export. The UI exports the last seven days; the API accepts windows up to 31 days.
- Optional external model API integration. No trained model or weights are included.
- Account registration controlled by an operator-held registration code, cookie-based sign-in, and light/dark themes.

New patients start without fabricated measurements. The current watch integration does not supply ECG, blood pressure, respiration or SpO₂. Skin temperature is a peripheral measurement.

Without a configured model, patient widgets default to green and explicitly say **Default · no model**. That colour is not an assessment. The prototype does not provide a validated delirium diagnosis or prediction out of the box.

The repository retains some upstream components and API routes. Their presence does not mean that the original AI assistant, messaging, maps, profile/settings pages or ECG screens are part of the current dashboard navigation.

## Architecture

| Part | Implementation |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Zustand and React Router |
| API | Node.js, Express 5, Mongoose, bcrypt password hashing and JWT authentication |
| Database | MongoDB |
| Docker web service | Nginx serving the compiled frontend and proxying `/api/` to the API |
| Optional model service | Python/FastAPI adapter accepting a separately supplied trained artifact |
| Watch/phone connection | HTTPS JSON API; MQTT is not required by this integration |

The companion Android project is maintained separately and is not built by this repository.

## Quick start with Docker

Install Git, Docker Engine/Desktop and the Docker Compose plugin. The images use Node 22, MongoDB 8 and Nginx. Use current patched base images; the commands below explicitly pull them when building.

### 1. Clone the project

```bash
git clone https://github.com/Shadowdragon352/SAM-Dash.git sam-dash
cd sam-dash
```

### 2. Generate configuration

If Node.js is installed, run this from the repository root:

```bash
node docker/init-config.mjs
```

Alternatively, on Linux, use Docker without installing Node on the host:

```bash
sudo docker run --rm --pull=always \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  node:22-alpine node docker/init-config.mjs
```

The initializer creates `.env` with random secrets and preserves existing settings. Keep that file private and out of Git.

### 3. Build and start

Use both Compose files: the integration overlay supplies the registration, upload and model settings.

```bash
sudo docker compose -f compose.yaml -f compose.integration.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.integration.yaml build --pull
sudo docker compose -f compose.yaml -f compose.integration.yaml up -d
sudo docker compose -f compose.yaml -f compose.integration.yaml ps
```

Open `http://localhost:8080` on the host, or `http://SERVER-IP:8080` if the host firewall permits it. The current Compose file publishes the web port on all host interfaces. The generated `LISTEN_ADDRESS` setting is not used by that port mapping.

Web health is available at `/healthz`; `/api/healthz` checks the proxied API. MongoDB and the API have no published host ports in the supplied stack.

### 4. Create an account

There are no default login credentials. Read the registration code locally:

```bash
sed -n 's/^REGISTRATION_CODE=//p' .env
```

Open **Create account**, enter your details and that code, then use your email/password to sign in. The registration code is separate from a watch upload token.

Accounts and patient records are stored in MongoDB. Login cookies and JWTs expire one hour after sign-in; there is no automatic refresh-token or long-term remember-me flow. Accounts share the patient workspace; patient-level access control is not implemented.

## Configuration

| Setting | Purpose |
| --- | --- |
| `LOCAL_PORT` | Published web port; defaults to `8080`. |
| `MONGO_PASSWORD` | MongoDB credential used by Compose. Changing `.env` alone does not change a password already stored in MongoDB. |
| `JWT_SECRET` | Signs login tokens. Preserve it across normal updates; changing it invalidates existing tokens. |
| `REGISTRATION_CODE` | Required to create dashboard accounts. |
| `COOKIE_SECURE` | Defaults to `false` for local HTTP. Set to `true` for HTTPS access and recreate the API. |
| `INGEST_TOKEN` | Global provisioning/upload credential. Prefer a scoped per-device token for each watch. |
| `MODEL_URL` | Full prediction endpoint URL; empty disables external model calls. |
| `MODEL_API_TOKEN` | Bearer credential sent to the optional model endpoint. |

With Docker, Compose constructs `MONGODB_URI`. For a native installation, provide `MONGODB_URI`, `PORT` and `CORS_ORIGIN` directly in the root `.env` as required by your setup. They are read by Node; adding an arbitrary variable to `.env` does not automatically pass it through Compose unless a Compose service references it.

## Connect the phone and watch

1. Create/select the patient and open **Device links**.
2. Register the watch using the exact device ID shown by the companion app, and copy its issued token. The plaintext token is shown once; issuing another revokes the previous one.
3. Link the watch to the patient using a fresh study ID. Save that same study ID in the companion app. Include buffered events only when they belong to this patient.
4. In the phone app, enter the dashboard **base URL**, such as `https://dashboard.example.com`, and the device token. Do not append `/api/v1/ingest` to the base URL or add `Bearer ` to the token field.
5. Refresh the patient link in the phone app and start monitoring. The lookup can return the linked patient name.

Events are assigned using device ID, study ID and recording time. Unlink a watch before reassigning it, and use a new study ID for the next assignment. Historical events retain their previous assignment.

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| `POST /api/v1/ingest` | Receive batches of 1–100 events with UUID-based retry deduplication | Device/global Bearer token |
| `GET /api/v1/device-assignment?device_id=...` | Look up the current patient name and study ID | Device/global Bearer token |
| `/api/v1/research/devices` | Register/list devices; related routes issue tokens and manage assignments | Dashboard login |
| `GET /api/v1/research/patients/:id/overview` | Latest readings, 24-hour series, features, assessments and model result | Dashboard login |
| `/api/v1/research/patients/:id/cognition` | Task summaries/outcomes and related session trial routes | Dashboard login |
| `/api/v1/research/patients/:id/assessments` | Record research assessment labels | Dashboard login |
| `GET /api/v1/research/patients/:id/export` | Export events/assessments using `from`/`to` epoch milliseconds | Dashboard login |

See [event validation](server/src/delirium/contract.js) and [research routes](server/src/delirium/routes.js) for the exact request contracts. Run one API worker: ingestion and device handoffs are serialised within that process, not coordinated across multiple replicas.

## Optional prediction integration

Set `MODEL_URL` to an endpoint accepting the generated feature JSON and set `MODEL_API_TOKEN` to its Bearer credential. Recreate the API after configuration changes.

The optional adapter in [model-service/](model-service/) accepts a trained logistic-regression artifact at `model-service/models/model.json`. It does not train a model or ship usable weights. To run it, set `MODEL_URL=http://model:8000/predict` and start the Compose stack with `--profile model` before `up`.

The dashboard validates model responses and shows unavailable results when inference fails or data are insufficient. The external model owns the green/yellow/red banding policy through `status_level`; the supplied logistic adapter returns probability only and needs an appropriate banding extension to drive those colours. See [docs/MODEL_STATUS.md](docs/MODEL_STATUS.md) and the [artifact](model-service/artifact.schema.json) / [feature](model-service/features.schema.json) schemas.

## HTTPS and Cloudflare Tunnel

An existing tunnel can publish a hostname pointing to `http://127.0.0.1:8080` when cloudflared runs directly on the same host. If the connector runs elsewhere or in another container, use an address reachable from that connector; its `localhost` is not the dashboard host.

Route the whole hostname, including `/api/`, to the same web service. For HTTPS-only use, set `COOKIE_SECURE=true` in `.env` and recreate the API. Optional `compose.tunnel.yaml` and `compose.quick-tunnel.yaml` files are included for connector deployments; they are not needed when reusing a separately managed tunnel. This README reflects the current SAM implementation; `DOCKER.md` contains older upstream deployment notes that may describe superseded behaviour.

## Storage, updates and a second instance

MongoDB data are bind-mounted from `./mongo-data`, relative to the checkout, into `/data/db`. The declared named `mongo-data` volume is not the storage used by that service. Container rebuilds preserve the mounted database folder. Back up the database with MongoDB tools or a consistent stopped snapshot, and preserve the matching `.env`; copying a live database directory is not a reliable backup procedure.

To update an existing deployment:

```bash
git pull --ff-only
sudo docker compose -f compose.yaml -f compose.integration.yaml build --pull
sudo docker compose -f compose.yaml -f compose.integration.yaml up -d
```

For a second instance, use a separate checkout, generate its own `.env`, change `LOCAL_PORT` (for example to `8081`), and use a distinct Compose project name such as `-p sam-replay` in every Compose command. The separate folder gives it a separate `mongo-data`; the project name separates containers and networks. Separate hostnames avoid login-cookie collisions between instances on different ports of the same host.

Do not copy production secrets or a live database directory into Git.

## Running without Docker

Docker is optional. Install a current patched Node 22 runtime and MongoDB, then install dependencies from the repository root:

```bash
npm ci
npm --prefix client ci
node docker/init-config.mjs
```

Add a suitable `MONGODB_URI` to the root `.env` (for example `mongodb://127.0.0.1:27017/sam_dash` for an appropriately configured local development database). Docker's hostname `mongo` does not resolve to a native MongoDB installation.

For local development, run `npm run dev` from the root. This starts the API on port 5000 and Vite on port 8080; Vite proxies `/api` to the API. Those ports must be free. Configure `PORT`/`CORS_ORIGIN` if changing the API or browser origin, and adjust the Vite proxy when changing the API port.

For a native deployment, run `npm run build`, run the API with `npm start` under a service manager, and configure Nginx/Caddy to serve `client/dist`, fall back to `index.html` for frontend routes, and proxy `/api/` to Node. The `main` API does not serve the compiled frontend itself. The Docker Nginx configuration uses Docker DNS and needs adapting for native hosting.

## Checks

```bash
npm ci
npm test
npm --prefix client ci
npm --prefix client run check
npm --prefix client run build
cd client
node --test tests/*.test.mjs
```

The MongoDB integration test is skipped unless `TEST_MONGODB_URI` is set. Use a disposable test MongoDB instance: the test creates and drops its own database. Deployment checks should also cover login, creating an empty patient, device linking/upload retries, cognition results and the actual HTTPS/tunnel route.

## Demo branches

These are separate draft changes and are not included on `main`:

| Branch | Purpose |
| --- | --- |
| [`feature/sam-scenario-replay`](https://github.com/Shadowdragon352/SAM-Dash/tree/feature/sam-scenario-replay) / [PR #1](https://github.com/Shadowdragon352/SAM-Dash/pull/1) | Adds a signed-in replay page for local Colab `sam_replay.json` imports, including heart rate/SpO₂ playback and scripted observations. Imports stay in browser memory and do not populate patient records or call a prediction model. |
| [`feature/private-team-demo`](https://github.com/Shadowdragon352/SAM-Dash/tree/feature/private-team-demo) / [PR #2](https://github.com/Shadowdragon352/SAM-Dash/pull/2) | Builds on replay with five fully synthetic built-in scenarios, operator-created accounts, an email allowlist and a standalone Caddy HTTPS deployment. Private mode disables public signup, record mutations, live device integration and model calls. |

The private branch uses `compose.private.yaml` and its own setup guide rather than the normal integration overlay. Its direct-to-Caddy proxy assumptions need reviewing before placing it behind an existing Cloudflare tunnel. Branching or opening a PR does not deploy an instance.

## Project layout

| Path | Contents |
| --- | --- |
| `client/` | Frontend source, assets and chart tests |
| `server/src/` | Express API, authentication and database models |
| `server/src/delirium/` | Watch event validation, device assignment, feature extraction and research routes |
| `server/tests/` | Contract and MongoDB integration tests |
| `model-service/` | Optional model adapter, schemas and model tests |
| `docker/` | Image definitions, Nginx and configuration initializer |
| `compose*.yaml` | Deployment and optional service overlays |
| `docs/` | Model status documentation and inherited project material |

## Attribution and licensing status

SAM-Dash includes code from [Patient Health Monitoring System by kika1s1](https://github.com/kika1s1/patient-health-monitoring-system), alongside SAM-specific changes. Original code remains attributable to its respective authors.

Upstream's README declares **MIT**, but its root `package.json` declares **ISC** and no `LICENSE` file is present. This repository inherited those conflicting declarations: its root `package.json` still says ISC. The intended upstream licence and copyright notice need confirmation from the maintainer before adding a definitive licence file or making the metadata consistent. This README records that ambiguity rather than resolving it on the original authors' behalf.

Retain applicable upstream and dependency notices when distributing the project. Third-party packages and any separately obtained datasets have their own terms; this repository's licensing status does not replace them.
