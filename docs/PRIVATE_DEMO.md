# Private team web demo

This branch prepares a sign-in-only SAM-Dash website. It does not create a hosted URL. Hosting has not been purchased or provisioned. Use only synthetic demonstration data, not patient information.

## Access boundaries

HTTP signup is disabled regardless of old registration codes. Operators create named accounts; there are no default credentials. TEAM_EMAILS is enforced at login and every authenticated request. Accounts share this sandbox; this is not a hospital role or patient-assignment permission system. The retained `doctor` database role does not verify professional status.

Private mode opens five built-in fully invented scenarios. File import is hidden. Readings, ages, baseline descriptions and observations are synthetic. Record mutations, live device ingest/assignment queries and model integration are disabled. The private deployment uses its own database volume rather than the laptop database.

Login, frontend assets and a minimal health response remain public. Patient/research API data require authentication. `noindex` is only an indexing hint. If even the frontend assets must be inaccessible, add an identity-aware gateway; this stack provides application-level access control, not network-level privacy.

Sessions last one hour. Cookies use Secure, HttpOnly and SameSite=Strict. Password reset invalidates that account's private-demo sessions. Browser mutations require the configured HTTPS Origin. Security headers prevent framing and external connections in private mode; third-party AI and map requests are blocked. Sign-in is limited to 10 attempts per IP per 15 minutes with bounded in-memory storage. Restart resets the limiter. Run one API worker; scaling requires shared limiting and a reviewed trust model.

This is not clinical validation, healthcare compliance or a production security certification. Physical watch transfer remains outside this demo.

## Hosting prerequisites

Provide a Docker-capable server and an operator-controlled hostname. Point its DNS A/AAAA record to the server. Permit inbound TCP 80/443 only; do not expose Node or MongoDB ports. This baseline assumes Caddy is the only proxy directly receiving internet traffic. Caddy manages HTTPS certificates and redirects HTTP to HTTPS. Do not insert a CDN or another proxy without revisiting forwarded-header trust.

From the repository root on branch `feature/private-team-demo`:

```sh
node docker/init-private.mjs demo.yourdomain.com "you@example.com,teammate@example.com"
docker compose --env-file .env.private -f compose.private.yaml up -d --build
```

The initializer creates ignored `.env.private` with independent random database/JWT secrets and refuses to overwrite it. Never commit or paste that file. `docker/private.env.example` documents its settings. Preserve a private backup. Changing MONGO_PASSWORD in the file does not rotate credentials inside an existing database volume.

Use this standalone compose file, not an overlay onto the laptop compose stack. Only Caddy publishes ports; Node runs as a non-root user. Separate named volumes hold the database and TLS state. Do not run `down -v` unless intentionally deleting them.

## Individual accounts

Once containers are healthy:

```sh
docker compose --env-file .env.private -f compose.private.yaml exec api node server/scripts/team-account.mjs create you@example.com "Your Name"
```

The email must appear in TEAM_EMAILS. The terminal prompts for a hidden password of at least 12 characters and at most 72 UTF-8 bytes. Passwords are never command arguments. Share each person's credentials privately; no invitation email is sent automatically.

Reset a password and revoke its old sessions:

```sh
docker compose --env-file .env.private -f compose.private.yaml exec api node server/scripts/team-account.mjs reset-password you@example.com
```

Remove a member's email from TEAM_EMAILS in `.env.private`, then:

```sh
docker compose --env-file .env.private -f compose.private.yaml up -d --force-recreate api
```

Their existing sessions lose API access. Keep the email off the list; re-adding it permits that account again. Rotate JWT_SECRET and recreate the API for global emergency sign-out. No MFA or self-service reset email is bundled.

## Hosted acceptance

1. A private browser sees sign-in without a Create account link. Unauthenticated `/api/v1/patients` and `/api/v1/research/devices` return 401. Signup returns 403.
2. An approved account sees the synthetic-only replay. Check all five scenarios, reset, stopping at the last step, missing readings and sign-out.
3. Check the cookie flags and `Cache-Control: no-store` on private API responses. Cross-origin sign-in, device uploads and record changes must fail.
4. Remove a test member and recreate the API; its existing session must fail. Reset another test account's password; its old session must return 401.
5. Verify valid TLS, HTTP-to-HTTPS redirect and no public database/API ports.

For updates, pull the branch and rebuild with the same environment file. Before important updates, take and restore-test an encrypted database backup. Account identifiers and password hashes are private; define retention and access. Do not log request bodies, tokens or cookies. This compose setup does not enable HTTP access logging.

## Verification

```sh
npm ci
npm test
npm --prefix client ci
npm --prefix client run build
node --test client/tests/*.test.mjs
```

For a private local build in PowerShell, set `$env:VITE_PRIVATE_DEMO = "true"` before building, then `Remove-Item Env:VITE_PRIVATE_DEMO` afterwards. New Express tests use a mocked user store; existing Mongo integration requires TEST_MONGODB_URI and creates/drops its own disposable database. Never point integration tests at production. Hosted browser acceptance and real certificate issuance must still be performed on the chosen server.

References: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [reverse proxy and forwarded headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Verification recorded for this change

- All 15 API/contract/access tests, including existing Mongo integration and a new private production-entry-point test, passed against a disposable MongoDB with Unix sockets disabled for this runtime.
- Frontend chart/replay suite: 14 passed. Total: 29 passing tests.
- Normal and private production builds and TypeScript checks passed. Targeted lint passed.
- Standalone Compose YAML parsed; only Caddy publishes ports. The Caddy binary accepted the HTTPS configuration.
- Browser automation could not start because the Chromium download was incomplete. No hosted browser acceptance, Docker image build or actual certificate issuance is claimed.
