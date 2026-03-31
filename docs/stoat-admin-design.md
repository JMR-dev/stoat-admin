# Stoat Admin Dashboard — System Design

## Overview

A lightweight, self-hosted admin dashboard for managing user invites, bans, and deletions on a Stoat (Revolt fork) chat instance. Deployed as a separate Podman Compose stack that shares the Stoat stack's network, accessible only via WireGuard VPN. The admin and application stacks are fully independent — they can be started, stopped, and updated without affecting each other.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Host (Hetzner VPS)                                             │
│                                                                 │
│  ┌──────────┐    public    ┌────────────────────────────────┐   │
│  │ Internet │────:443────▶│ Caddy                           │   │
│  └──────────┘             │  ├─ /api/*    → stoat-api:8000  │   │
│                           │  ├─ /ws       → stoat-ws:9000   │   │
│                           │  ├─ /autumn/* → stoat-autumn     │   │
│                           │  └─ /*        → stoat-web        │   │
│                           │                                  │   │
│                           │  admin.* routes → respond 403    │   │
│                           └────────────────────────────────┘   │
│                                                                 │
│  ┌────────────┐  WireGuard   ┌────────────────────────────┐    │
│  │ You (peer) │───:51820───▶│ wg0 interface               │    │
│  └────────────┘             │  10.0.0.0/24                 │    │
│                              └──────┬─────────────────────┘    │
│                                     │                           │
│       ┌─────────────────────────────┼─────────────────┐        │
│       │  Docker: stoat_default network                 │        │
│       │                             │                  │        │
│       │  ┌──────────────┐  ┌───────┴────────┐        │        │
│       │  │ admin-web    │  │ admin-api      │        │        │
│       │  │ :5180        │  │ :5181          │        │        │
│       │  │ (Vite/React) │  │ (Express)      │        │        │
│       │  └──────────────┘  └───┬───┬───┬────┘        │        │
│       │                        │   │   │              │        │
│       │               ┌───────┘   │   └────────┐     │        │
│       │               ▼           ▼            ▼     │        │
│       │  ┌──────────────┐ ┌──────────┐ ┌──────────┐ │        │
│       │  │ MongoDB      │ │ Redis    │ │ Resend   │ │        │
│       │  │ (stoat DB)   │ │          │ │ (ext API)│ │        │
│       │  │ :27017       │ │ :6379    │ └──────────┘ │        │
│       │  └──────────────┘ └──────────┘              │        │
│       └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service     | Stack             | Port | Access         |
| ----------- | ----------------- | ---- | -------------- |
| `admin-web` | Vite + React      | 5180 | WireGuard only |
| `admin-api` | Express + Node 22 | 5181 | WireGuard only |

Both services run in their own Podman Compose stack but join the Stoat stack's Podman network (`stoat_default`) as an external network, giving them direct access to MongoDB and Redis. No new databases — `admin-api` connects to Stoat's existing MongoDB instance.

---

## Network & Access Control

### WireGuard

Admin services bind to the WireGuard interface IP (`10.0.0.1`) or are only reachable from the WireGuard subnet. Two options for enforcement:

**Option A — Host firewall (iptables/nftables):**
Drop traffic to ports 5180/5181 from any source except `10.0.0.0/24`. Simple, no Caddy involvement.

**Option B — Caddy deny + Docker port binding:**
Bind `admin-web` and `admin-api` to `10.0.0.1` only in the compose file:

```yaml
ports:
  - "10.0.0.1:5180:5180"
  - "10.0.0.1:5181:5181"
```

This is the cleaner option — Docker handles the binding and the ports simply aren't reachable from the public interface.

### Why not just Caddy auth?

Caddy could proxy and add basic auth, but binding to the WireGuard interface is a harder guarantee. Caddy misconfig = public exposure. WireGuard bind = the port doesn't exist on the public interface at all.

### App-level auth (defense in depth)

Single admin user. Express session with `express-session` + a SQLite file (`admin.db`) containing one row: `{ username, password_hash }`. Argon2id for the hash. 2-hour session TTL. The SQLite file also stores the session data (via `better-sqlite3-session-store` or equivalent).

This matters because a leaked WireGuard peer config would otherwise grant full admin access.

---

## Data Model

### Stoat's MongoDB (existing — read/write by admin-api)

Admin-api connects to the same `MONGODB` connection string used by Stoat. All collections are in the `revolt` database.

#### `revolt.accounts`

Stoat's account records. Relevant fields for admin operations:

```typescript
type Account = {
  _id: string; // ULID, matches user._id
  email: string;
  email_normalised: string;
  disabled: boolean; // ← set true to ban at account level
  spam: boolean;
  verification: { status: "Verified" | "Pending" | "Moving" };
  deletion?: {
    status: "Scheduled" | "WaitingForVerification" | "Deleted";
    after?: string;
  };
  lockout?: { attempts: number; expiry: string };
};
```

#### `revolt.users`

Stoat's user profiles. Relevant fields:

```typescript
type User = {
  _id: string; // ULID
  username: string;
  discriminator: string;
  flags?: number; // bitmask: 1=suspended, 2=deleted, 4=banned
  // ... avatar, status, etc.
};
```

#### `revolt.sessions`

Active auth sessions. Delete a user's sessions to force immediate logout.

```typescript
type Session = {
  _id: string;
  user_id: string;
};
```

#### `revolt.invites`

Used when `invite_only = true` in `Revolt.toml`. Each document is an invite code.

```typescript
type Invite = {
  _id: string; // the invite code itself
};
```

#### `revolt.safety_strikes`

Strike/suspension/ban audit records (from the official admin panel schema).

```typescript
type Strike = {
  _id: string; // ULID
  user_id: string;
  reason: string;
  type?: "strike" | "suspension" | "ban";
  case_id?: string;
};
```

### Admin SQLite (`admin.db` — owned by admin-api)

Stored as a Docker volume mount. Two tables:

#### `admin_user`

Single row. Created on first run via a seed script.

```sql
CREATE TABLE admin_user (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL  -- argon2id
);
```

#### `invite_records`

Admin-side tracking of invites sent via Resend. The actual invite code lives in MongoDB (`revolt.invites`); this table tracks the metadata Stoat doesn't store.

```sql
CREATE TABLE invite_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,        -- matches revolt.invites._id
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | revoked | expired
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,                   -- nullable, ISO 8601
  accepted_at TEXT,
  resend_message_id TEXT             -- Resend API response ID for tracking
);
```

#### `audit_log`

All admin actions, for your own records.

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,       -- invite_created | invite_revoked | user_banned | user_deleted | user_unbanned
  target TEXT NOT NULL,       -- email or user_id
  details TEXT,               -- JSON blob, freeform
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## API Routes

All routes prefixed with `/api`. All require a valid session except `POST /api/auth/login`.

### Auth

| Method | Path               | Description                        |
| ------ | ------------------ | ---------------------------------- |
| POST   | `/api/auth/login`  | Login with username + password     |
| POST   | `/api/auth/logout` | Destroy session                    |
| GET    | `/api/auth/me`     | Return current session user or 401 |

### Invites

| Method | Path                 | Description                                                                       |
| ------ | -------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/invites`       | List all invite records from SQLite (with status)                                 |
| POST   | `/api/invites`       | Create invite: generate code → insert into Mongo + SQLite → send email via Resend |
| DELETE | `/api/invites/:code` | Revoke: delete from Mongo `revolt.invites`, set SQLite status to `revoked`        |

#### Invite creation flow

```
1. Generate cryptographically random code (nanoid, 12 chars alphanumeric)
2. Insert { _id: code } into revolt.invites (Mongo)
3. Insert record into invite_records (SQLite) with email, expiry, status=pending
4. Send email via Resend API:
   - To: target email
   - Subject: "You've been invited to [instance name]"
   - Body: registration URL with ?invite=<code>
   - Store Resend message_id in SQLite
5. Log to audit_log
6. Return invite record
```

#### Invite acceptance detection

Stoat deletes the invite document from `revolt.invites` after it's used for registration. A background job (node-cron, every 5 min) checks:

```
For each SQLite record where status = 'pending':
  - If code no longer exists in revolt.invites → set status = 'accepted', record accepted_at
  - If expires_at < now → set status = 'expired', delete from revolt.invites if still present
```

### Users

| Method | Path                   | Description                                      |
| ------ | ---------------------- | ------------------------------------------------ |
| GET    | `/api/users`           | List users from Mongo `revolt.users` (paginated) |
| GET    | `/api/users/:id`       | Get user + account details                       |
| POST   | `/api/users/:id/ban`   | Ban user (see flow below)                        |
| POST   | `/api/users/:id/unban` | Reverse a ban                                    |
| DELETE | `/api/users/:id`       | Delete user (see flow below)                     |

#### Ban flow

```
1. Set revolt.accounts.disabled = true (prevents login)
2. Set revolt.users.flags = flags | 4 (banned flag in bitmask)
3. Delete all docs from revolt.sessions where user_id = id (force logout)
4. Insert strike record into revolt.safety_strikes { type: "ban", reason, user_id }
5. Log to audit_log
```

#### Unban flow

```
1. Set revolt.accounts.disabled = false
2. Set revolt.users.flags = flags & ~4 (clear banned flag)
3. Remove or annotate strike record (optional — may want to keep for history)
4. Log to audit_log
```

#### Delete flow

```
1. Set revolt.accounts.deletion = { status: "Scheduled", after: now }
   (Stoat's crond daemon handles the actual data cleanup)
2. Set revolt.users.flags = flags | 2 (deleted flag)
3. Delete all docs from revolt.sessions where user_id = id
4. Log to audit_log
```

Note: Direct user data deletion (messages, DMs, server memberships) should be left to Stoat's `crond` daemon, which already handles scheduled deletions. Doing it manually risks leaving orphaned references.

---

## Frontend

Vite + React + TypeScript. Minimal UI — this is a tool for one person.

### Views

- **Login** — username/password form
- **Dashboard** — counts: active users, pending invites, recent bans
- **Invites** — table of all invites with status badges, create/revoke actions
- **Users** — searchable/filterable table, click through to user detail
- **User Detail** — account info, ban/unban/delete actions, strike history

### Stack choices

- **React Router** for client-side routing
- **TanStack Query** for server state
- **Tailwind** for styling (or keep it dead simple with vanilla CSS)
- No component library — it's 5 views for 1 user

---

## Docker Compose — Separate Stack

The admin dashboard runs as its own Podman Compose stack, completely independent from the Stoat application stack. The two stacks can be started, stopped, and updated independently. The admin stack joins the Stoat stack's Podman network as an external network, giving its containers access to MongoDB and Redis without being part of the Stoat lifecycle.

Verify the Stoat network name with `podman network ls` while Stoat is running, and set it in the admin stack's compose file.

```yaml
networks:
  stoat:
    external: true
    name: stoat_default # must match the actual Stoat stack network name

services:
  admin-api:
    build:
      context: ./api
    restart: unless-stopped
    ports:
      - "10.0.0.1:5181:5181"
    environment:
      - MONGODB=mongodb://database:27017
      - REDIS_URL=redis://redis:6379
      - RESEND_API_KEY=${RESEND_API_KEY}
      - RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL}
      - SESSION_SECRET=${ADMIN_SESSION_SECRET}
      - INSTANCE_URL=${INSTANCE_URL}
      - ADMIN_API_PORT=5181
    volumes:
      - ./data/admin:/data
    networks:
      - stoat

  admin-web:
    build:
      context: ./web
    restart: unless-stopped
    ports:
      - "10.0.0.1:5180:80"
    environment:
      - VITE_API_URL=http://10.0.0.1:5181
    networks:
      - stoat
```

The `restart: unless-stopped` directive in the compose file handles individual container crashes within a stack (Podman restarts the specific container that died). Stack-level lifecycle management — starting, stopping, and restarting entire stacks — is handled by s6, described below. These two levels do not conflict because they operate at different granularities.

Note: because this is a separate stack, `depends_on` cannot reference containers in the Stoat stack. Startup ordering between stacks is handled by s6 at the supervision level. The admin-api container will retry its MongoDB connection on failure — the connection module must handle this gracefully (retry with backoff on initial connect).

---

## Process Supervision — s6 Hybrid Model

Both the Stoat application stack and the admin dashboard stack are supervised by s6, with systemd responsible only for running the `s6-svscan` process as a single persistent service. This gives granular per-stack control (start, stop, restart, status) through s6 tooling, while individual container operations within a stack are handled via `podman restart <container>` as needed.

### Supervision Architecture

```
systemd
  └── s6-svscan (/etc/s6-services)
        ├── stoat/              ← Stoat application stack
        │   ├── run             ← exec podman compose up (foreground)
        │   ├── finish          ← podman compose down (cleanup)
        │   └── log/
        │       └── run         ← s6-log pipeline → /var/log/s6/stoat/
        └── stoat-admin/        ← Admin dashboard stack
            ├── run             ← waits for stoat network, then exec podman compose up
            ├── finish          ← podman compose down (cleanup)
            └── log/
                └── run         ← s6-log pipeline → /var/log/s6/stoat-admin/
```

### s6 Service Directories

**`/etc/s6-services/stoat/run`:**

```bash
#!/bin/bash
set -e
cd /srv/stoat
exec podman compose up 2>&1
```

**`/etc/s6-services/stoat/finish`:**

```bash
#!/bin/bash
cd /srv/stoat
podman compose down
```

**`/etc/s6-services/stoat-admin/run`:**

```bash
#!/bin/bash
set -e

# Wait for the Stoat network to exist before starting.
# This handles the case where s6 starts both services simultaneously.
if ! podman network exists stoat_default; then
  sleep 5
  exit 1
fi

cd /srv/stoat-admin
exec podman compose up 2>&1
```

The admin stack's `run` script checks for the Stoat network before starting. If the network doesn't exist yet (because the Stoat stack hasn't finished initializing), the script sleeps briefly and exits. s6 restarts it automatically, effectively retrying until the network appears. Combined with the MongoDB connection retry in the admin-api code, this handles all timing dependencies without explicit dependency declarations.

**`/etc/s6-services/stoat-admin/finish`:**

```bash
#!/bin/bash
cd /srv/stoat-admin
podman compose down
```

**Log service (same pattern for both stacks):**

**`/etc/s6-services/stoat/log/run`:**

```bash
#!/bin/bash
exec s6-log -b -- T /var/log/s6/stoat/
```

**`/etc/s6-services/stoat-admin/log/run`:**

```bash
#!/bin/bash
exec s6-log -b -- T /var/log/s6/stoat-admin/
```

The `T` directive prefixes each log line with a TAI64N timestamp. Logs are written to dedicated directories per service, avoiding the single-stream problem of journald where all container output is interleaved.

### systemd Unit

A single systemd unit runs the s6 scan directory. This is the only systemd unit needed for the entire chat infrastructure.

**`/etc/systemd/system/s6-services.service`:**

```ini
[Unit]
Description=s6 service supervision tree
After=network-online.target podman.socket
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/s6-svscan /etc/s6-services
ExecStop=/usr/bin/s6-svscanctl -t /etc/s6-services
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Common Operations

```sh
# Restart the admin stack (without affecting Stoat)
s6-svc -r /etc/s6-services/stoat-admin

# Stop the admin stack
s6-svc -d /etc/s6-services/stoat-admin

# Start the admin stack
s6-svc -u /etc/s6-services/stoat-admin

# Check if a stack is running
s6-svstat /etc/s6-services/stoat-admin

# Restart a single container within a running stack
podman restart stoat-admin-admin-api-1

# View live logs for a stack
tail -f /var/log/s6/stoat-admin/current | s6-tai64nlocal
```

### Dockerfiles

**admin-api:**

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY seed.ts ./
EXPOSE 5181
CMD ["node", "dist/index.js"]
```

**admin-web:**

```dockerfile
FROM node:22-slim AS build-app
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:builder AS build-caddy
RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2

FROM caddy:latest
COPY --from=build-caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=build-app /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY coraza.conf /etc/caddy/coraza.conf
EXPOSE 80
```

The web container is a custom Caddy build with Coraza WAF compiled in via `xcaddy`, serving the Vite build as static files. API calls go directly to `admin-api` from the browser (both on the WireGuard subnet).

---

## Configuration Prerequisites

### Stoat config change

In `Revolt.toml`, enable invite-only registration:

```toml
[api.registration]
invite_only = true
```

Restart the Stoat API container after this change.

### Environment variables (new)

Add to the host `.env` or `secrets.env`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
ADMIN_SESSION_SECRET=<openssl rand -base64 32>
INSTANCE_URL=https://chat.yourdomain.com
```

### First-run setup

A seed script creates the admin user on first boot if `admin.db` doesn't exist:

```bash
# Run once inside the admin-api container
node dist/seed.js --username admin --password <your-password>
```

This hashes the password with argon2id and inserts the single admin row.

---

## Backup Considerations

- `./data/admin/admin.db` — add to your existing backup rotation. Contains invite history, audit log, and your admin credentials.
- Stoat's MongoDB already contains the `revolt.invites`, `revolt.accounts`, and `revolt.safety_strikes` data. Ensure your existing Mongo backup covers this.

---

## Security Notes

- **No public exposure.** Admin services bind exclusively to the WireGuard interface IP. They do not appear in Caddy's config and are unreachable from the internet.
- **WireGuard authenticates devices, not users.** If a peer config leaks, the attacker gets network access. The Express session layer (argon2id + session cookie) is the second factor.
- **MongoDB access is unauthenticated** in the default Stoat self-hosted setup (no `--auth`). This is acceptable because MongoDB only listens on the Docker bridge network. The admin-api container joins this same network — no new attack surface.
- **SQLite file permissions.** The `admin.db` volume should be `chmod 600` on the host. Only the admin-api container needs access.
- **Resend API key** is the most sensitive secret after the WireGuard private key. Store in `secrets.env`, not in the compose file.
- **CORS.** `admin-api` should set `Access-Control-Allow-Origin` to `http://10.0.0.1:5180` only. No wildcards.

---

## Out of Scope (for now)

- **Suspend with auto-unsuspend.** The official admin panel uses `revolt-nodejs-bindings` (native Rust addon) for timed suspensions. Replicating this would require either building the native addon or implementing the timer logic in the admin-api cron job. Start with permanent bans; add timed suspensions later if needed.
- **Sending DMs to users on ban.** The official panel sends a DM from the platform account. This requires calling `proc_channels_create_dm` via the native bindings. Could be approximated by using a bot token and the REST API (`POST /channels/{dm_channel}/messages`) if you set one up.
- **User search by username.** The initial build can list users and search by ID or email. Full-text username search against MongoDB can come later.
- **Email templates.** V1 sends plain-text invite emails via Resend. Branded HTML templates can come later.
