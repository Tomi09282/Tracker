# Deployment

This stack deploys as a **single stateful box**: one Node/Express process (or a small `cluster.js` fan-out), one encrypted SQLite file on a persistent disk. It is not stateless — the DB lives on local disk in WAL mode, so you scale *up* (bigger box, more web workers) rather than *out* across machines. That keeps everything below simple: one Docker image, one reverse proxy terminating TLS, one systemd unit supervising the process.

Three rules drive every choice here:
- **The native addon is compiled, never trusted from a cache.** `better-sqlite3-multiple-ciphers` has a C++ addon; it must be built against the exact runtime Node/ABI, in a build stage with toolchain, then copied into a slim runtime with none.
- **Secrets never enter the image.** `DB_MASTER_KEY`, `JWT_SECRET` et al. are injected at run time (see [env-and-secrets.md](env-and-secrets.md)). A leaked image must reveal nothing.
- **The container is cattle; `./data` and `./logs` are pets.** Everything mutable lives on named volumes so a redeploy never touches the encrypted DB or the audit log.

## 1. Dockerfile (multi-stage)

```dockerfile
# --- build stage: has the toolchain to compile the native SQLite addon ---
FROM node:22-bookworm-slim AS build
# python3 + build-essential are needed for node-gyp to compile better-sqlite3-multiple-ciphers.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy manifests first so the (slow) native compile layer caches until deps actually change.
COPY package.json package-lock.json ./
# Build against prod deps only; the addon is compiled here, once, for this Node/ABI.
RUN npm ci --omit=dev
COPY . .
# If the frontend ships in this image, build it in its own stage: the Vite app has its own
# package.json and vite is a devDependency, so this --omit=dev install cannot run `vite build`.
# Run `npm ci && npm run build` there and COPY the dist/ across (see frontend-conventions.md).

# --- runtime stage: slim, no compiler, non-root ---
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# node:* images ship an unprivileged "node" user (uid 1000) — run as it, never root.
# Pre-create the mount points and hand them to node so the volumes are writable.
RUN mkdir -p /app/data /app/logs && chown -R node:node /app
# Bring the whole built tree across (includes the already-compiled node_modules); no build
# tools land in this stage. The chown keeps everything owned by the unprivileged user.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000

# HEALTHCHECK hits /readyz — the readiness probe from observability.md that runs `SELECT 1`
# through the DB pool, so it fails when the DB key is wrong. (/healthz is liveness-only and
# never touches the DB.) node's built-in fetch means no curl/wget needed in the slim image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# cluster.js is PID 1's child; it supervises the web workers (see cluster-scaling.md). For a
# single-process box use ["node","run-server.js"] instead. Exec form → signals reach node directly.
CMD ["node", "cluster.js"]
```

Both probes ship in the health router from [observability.md](observability.md), mounted **public, un-authenticated, un-rate-limited** before the auth-bearing routers. Deployment gating must use `/readyz`, which exercises the DB pool (`await db.get('SELECT 1')`) — `/healthz` is deliberately liveness-only (no I/O, so a transient DB blip doesn't get the process killed), which means it would report healthy while the DB key is wrong.

## 2. .dockerignore

Keep the build context tiny and — critically — keep secrets and local state out of the image entirely.

```
node_modules
.git
.env
.env.*
!.env.example
data
logs
*.db
*.db-wal
*.db-shm
dist
npm-debug.log
Dockerfile
.dockerignore
```

`node_modules` is excluded so the host's (possibly wrong-ABI, e.g. Windows-built) modules never shadow the freshly compiled ones. `data`, `logs`, and `*.db*` are excluded so a developer's local encrypted database is never baked into a shipped image.

## 3. Reverse proxy + automatic TLS

Caddy terminates TLS (auto-provisioning and renewing certs from Let's Encrypt), redirects HTTP→HTTPS by default, and forwards to the app. It sits **one hop** in front, so `TRUST_PROXY=1` — this is the value Express uses to read the real client IP from `X-Forwarded-For` for the per-IP rate limits. Getting this number wrong breaks rate limiting (see the warning in [server-skeleton.md](server-skeleton.md)).

```caddyfile
# Caddyfile — TLS is automatic; the redirect http→https is automatic too.
app.example.com {
    encode zstd gzip

    # HSTS: force HTTPS for a year incl. subdomains, and qualify for browser preload.
    # Only enable preload once you are sure every subdomain is HTTPS-only — it is hard to undo.
    header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

    # Single hop → app sees exactly one X-Forwarded-For entry it can trust (TRUST_PROXY=1).
    reverse_proxy 127.0.0.1:3000
}
```

**nginx equivalent:** terminate TLS in a `server { listen 443 ssl; }` block, add a `server { listen 80; return 301 https://$host$request_uri; }` redirect, obtain certs with certbot, and `proxy_pass http://127.0.0.1:3000;` with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Still one hop, so `TRUST_PROXY=1`.

Only ever raise `TRUST_PROXY` by the number of proxies **you control and that overwrite `X-Forwarded-For`** — a trusted hop count is a promise that everything up to that many entries is unspoofable, so an over-count lets a client forge its IP and defeat the per-IP rate limits. In particular a public CDN like Cloudflare *appends* to `X-Forwarded-For` (it does not sanitise client-supplied entries), so do **not** just bump the hop count for it: keep `TRUST_PROXY=1` for your own proxy, restrict ingress to Cloudflare's published IP ranges, and read the client IP from the `CF-Connecting-IP` header Cloudflare sets.

## 4. Process management (systemd)

On a VPS, let systemd be the supervisor and `cluster.js` be the crash-restarting primary underneath it (systemd restarts the *whole* process group if the primary itself dies; `cluster.js` reforks individual web workers — see [cluster-scaling.md](cluster-scaling.md)). Logs go to journald.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=myapp (Node/Express + encrypted SQLite)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
# Secrets are injected here, root-owned 0600, NOT committed and NOT the app's live .env.
EnvironmentFile=/etc/myapp/env
ExecStart=/usr/bin/node cluster.js
Restart=on-failure
RestartSec=5
# Give in-flight requests time to drain: systemd sends SIGTERM, waits, then SIGKILL.
# Must exceed the hard-exit timers in cluster.js (15s) / server.js (10s) so graceful wins.
TimeoutStopSec=20
KillSignal=SIGTERM
# journald captures stdout/stderr; the app's own server.log (pino) still lands in ./logs.
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp
# Hardening: the process only needs to write ./data and ./logs.
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/myapp/data /opt/myapp/logs
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now myapp` to start; `journalctl -u myapp -f` to tail. **PM2 alternative:** `pm2 start cluster.js` (or `pm2 start server.js -i max` to let PM2 own the fan-out instead of `cluster.js`) gives log rotation and monitoring; use `pm2 startup` + `pm2 save` to survive reboots. Prefer systemd on a box you already administer; PM2 when you want its dashboard.

## 5. Secret injection

Secrets are supplied by the orchestrator, never by the image or a committed file. The app doesn't care where they come from — `env.js` reads `process.env`, and `dotenv` simply finds nothing to load when they're already set (see [env-and-secrets.md](env-and-secrets.md)).

- **Docker (plain):** `docker run --env-file /root/myapp.env` (root-owned `0600`). Never `ENV DB_MASTER_KEY=...` in the Dockerfile and never `--build-arg` for secrets — both persist in image layers. (`--secret` is a `docker build` BuildKit flag, not a `docker run` one — it does not inject runtime env.)
- **Docker (compose/Swarm):** a `secrets:` block mounts each secret as a file under `/run/secrets/<name>`, not an env var. To keep `env.js` reading `process.env` unchanged, load them in the entrypoint (e.g. `export DB_MASTER_KEY="$(cat /run/secrets/db_master_key)"`) before exec-ing node.
- **systemd:** `EnvironmentFile=/etc/myapp/env`, owned `root:root`, mode `0600`.
- **Managed:** Vault / cloud secret manager → rendered into the environment at launch.

Keep two things physically apart from each other and from the app: the **`DB_MASTER_KEY`** and the **DB backups**. An attacker with the encrypted `app.db` learns nothing; with both the file and the key, everything. So backups (`VACUUM INTO 'backup.db'`, which is safe on a live WAL database — a plain `cp` of `app.db*` mid-write can copy a torn WAL) go to a different location/credential than the master key, and neither lives in the repo, the image, or the same access grant.

## 6. HTTPS / HSTS

TLS terminates at the proxy (§3): certs auto-issued and renewed, HTTP→HTTPS redirect automatic, HSTS header set with a one-year `max-age`. The app speaks plain HTTP on loopback only — it is never bound to a public interface. This is what makes the `__Host-`/`__Secure-` cookie prefixes and `Secure` attribute from [auth-blueprint.md](auth-blueprint.md) valid: browsers only honour them over HTTPS, and every request the browser makes to the app is HTTPS (the plaintext hop is loopback-only, invisible to the client).

## 7. Zero-downtime restart & graceful shutdown

The existing shutdown path already aligns for this: on `SIGTERM`, `server.js` calls `server.close()` (stop accepting new connections, let in-flight ones finish), then `db.closePool()`, with a 10 s hard-exit backstop; `cluster.js` forwards the signal to every worker and waits up to 15 s (see both in [server-skeleton.md](server-skeleton.md) / [cluster-scaling.md](cluster-scaling.md)). The deployment layer just has to give that path enough time — hence `TimeoutStopSec=20` above and `docker stop -t 20` (the stop-time flag; `docker stop` has no `--stop-timeout` — that name is a `docker run` create-time flag).

For a genuinely seamless redeploy on a single box, do a **rolling restart of the web workers**, not a full stop:

- **cluster.js / PM2:** reload workers one at a time so the shared listening socket is never fully drained. `pm2 reload myapp` does exactly this when PM2 owns the fan-out (`-i max`); if PM2 merely runs `cluster.js` in fork mode, `reload` is a plain restart with downtime — with raw `cluster.js`, fork a new worker and `disconnect()` an old one before repeating. Because auth is stateless JWT cookies, any worker serves any request — no sticky sessions, no session migration.
- **New image / new code:** SQLite is single-writer, so **never run two versions against the same DB file at once** if the schema changed. `server.js` runs `db.migrate()` at boot with `CREATE ... IF NOT EXISTS` / `user_version`-gated forward-compatible migrations; take a brief maintenance window for breaking schema changes. For pure code changes, the rolling worker reload above is effectively zero-downtime.
- **Health-gated cutover:** the `HEALTHCHECK`/`/readyz` probe lets an external supervisor (or `docker compose` with `depends_on: condition: service_healthy`) wait until the new container proves it can decrypt the DB before shifting the proxy to it — turning "did the key inject correctly?" from a 3 a.m. incident into a failed health check that never receives traffic.
