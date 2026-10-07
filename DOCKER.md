# Docker + Cloudflare Tunnel deployment

These files target https://github.com/kika1s1/patient-health-monitoring-system
(reviewed main commit 8258ff7). Copy their contents into the **repository root**,
next to package.json, client/ and server/. They do not replace application source.

The stack builds the React frontend, serves it using nginx, proxies /api/* to the
Node/Express server, and persists MongoDB in a named volume. MongoDB and the API
have no published host ports. The website is available only on host localhost:8080
until a tunnel is enabled. Docker health checks control startup order.

This deploys the existing dashboard. It does not add MQTT or a DeliriumWatch
/api/v1/ingest adapter. The main dashboard still displays upstream demo vitals.

## 1. Prepare the repository

Use Docker Desktop with Linux containers on Windows, or Docker Engine + the
Compose plugin on Linux. Keep the project outside OneDrive.

```bash
git clone https://github.com/kika1s1/patient-health-monitoring-system.git
cd patient-health-monitoring-system
```

Extract **PatientDashboard-Docker.zip** and copy its contents here. Add these
entries to the repository's existing .gitignore (do not overwrite that file):

```gitignore
.env
secrets/*.txt
```

Generate independent database and JWT credentials using Node (if installed):

```bash
node docker/init-config.mjs
```

Or use Docker to run the generator. On **Windows PowerShell**:

```powershell
docker run --rm -v "${PWD}:/work" -w /work node:22-alpine node docker/init-config.mjs
```

On **Linux**:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:22-alpine node docker/init-config.mjs
```

The generator preserves an existing .env. If you already have one, retain its
settings and add MONGO_PASSWORD and JWT_SECRET as needed. The supplied MongoDB
URI interpolates the password, so use a random **hex/alphanumeric** password.
Do not use the placeholder values from .env.example. LOCAL_PORT defaults to 8080.

## 2. Start locally

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Open http://localhost:8080. Check the proxied API at
http://localhost:8080/api/healthz (it should return "API Running"). Local HTTP is useful
for viewing the dashboard; exercise production secure-cookie authentication over
the tunnel's HTTPS hostname.

No Gemini API key is bundled. The upstream AI feature is not configured by this
package. Do not put a secret Gemini key in Vite build variables; these become
public browser JavaScript.

## 3. Permanent Cloudflare Tunnel

1. In Cloudflare, create a **remotely managed cloudflared tunnel** and select the
   Docker connector instructions.
2. Copy only the tunnel token into **secrets/cloudflared-token.txt**. The file
   should contain the token alone; do not include the docker command or --token.
   Save as UTF-8 without a BOM (plain ASCII is sufficient). Do not commit it.
3. Configure a published application/public hostname, for example:
   - Hostname: **dashboard.yourdomain.com**
   - Service type: **HTTP**
   - Service URL: **web:8080** (equivalently http://web:8080)
   - Path: leave empty so both the website and /api use the same route.
4. Because upstream's /api/v1/utility/bluetooth-data route is unauthenticated and
   its dashboard login gate is disabled, protect the hostname with a **Cloudflare
   Access application and an allow policy for your team** before putting real
   records into the system. This is separate from the tunnel connector token.
5. Start the connector:

```bash
docker compose -f compose.yaml -f compose.tunnel.yaml config --quiet
docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build
docker compose -f compose.yaml -f compose.tunnel.yaml logs -f cloudflared
```

Open https://dashboard.yourdomain.com. Cloudflared runs inside Docker, so the
origin is **web:8080**, not localhost:8080. No inbound router port-forwarding or
host TLS certificate is needed. This configuration uses HTTP/2 for the outbound
tunnel, which avoids relying on outbound UDP/QUIC on institutional networks.
The network still needs to permit Cloudflare Tunnel traffic.

The connector token is mounted as a Compose secret and read via --token-file,
not embedded in the compose file. Compose file secrets are local file mounts;
keep the host token file private and readable by the container. On Linux, the
cloudflared image's non-root user must be able to read it; use an appropriate
readable group or file permission within a protected secrets directory.

## Optional: temporary demo URL without a domain

For a short-lived demo with **sample data only**, run a Quick Tunnel instead.
No connector token or Cloudflare DNS domain is needed:

```bash
docker compose -f compose.yaml -f compose.quick-tunnel.yaml up -d --build
docker compose -f compose.yaml -f compose.quick-tunnel.yaml logs -f cloudflared
```

The logs print a random https://...trycloudflare.com URL. That URL can change
when the connector restarts. Do not run the quick and permanent tunnel overrides
together; they deliberately share the service name cloudflared. To switch, stop
the previous configuration and start the other one.

## Operation

Use the same -f options you started with when managing the complete stack:

```bash
# Permanent tunnel example:
docker compose -f compose.yaml -f compose.tunnel.yaml logs --tail=100 api web mongo cloudflared
docker compose -f compose.yaml -f compose.tunnel.yaml down
```

`down` preserves MongoDB data. Do not add `-v` unless you intend to delete the
database. Keep .env with the volume: changing MONGO_PASSWORD does not change
credentials already initialized inside MongoDB. To rotate it, update the Mongo
user through MongoDB before updating .env and recreating the API.

The frontend is compiled into its image. After source changes, run the same
`up -d --build` command. If port 8080 is occupied, change LOCAL_PORT in .env; the
Cloudflare origin remains web:8080. Commit the compose/Docker/nginx/script/docs
files and .env.example, but not .env or the tunnel token.

For image updates, use `docker compose ... pull` and then `up -d --build`.
The package uses official Node 22 Alpine, MongoDB 8.0, nginx stable Alpine and
cloudflared images. Pin image digests in your deployment if repeatable image
versions are required.

## Verification

See VALIDATION.md for the checks completed in the generation environment. No
Docker daemon or Cloudflare account is available here; image builds, running
containers, database persistence and a live tunnel must be checked on your host.

## Official references

- https://developers.cloudflare.com/tunnel/get-started/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/
- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
