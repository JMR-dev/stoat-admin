# Stoat Admin Dashboard — Implementation Tasks

Reference: `stoat-admin-design.md` (system design document)

This document describes every task required to build and deploy the Stoat Admin Dashboard from scratch. The project consists of two services — `admin-api` (Express/Node/TypeScript) and `admin-web` (Vite/React/TypeScript) — deployed as a standalone Podman Compose stack that joins the Stoat chat instance's existing Podman network to access MongoDB directly. The admin stack and the Stoat application stack are fully independent and can be started, stopped, and updated without affecting each other. The project will be open-sourced, so all configuration must be parameterized through environment variables with no hardcoded infrastructure details.

---

## Phase 0: Project Scaffolding

### 0.1 — Initialize the monorepo

Create a single Git repository with two top-level packages. Use a flat structure rather than a workspace manager — this is a small project and the two packages share no runtime code.

```
stoat-admin/
├── api/                    # Express backend
├── web/                    # Vite + React frontend
├── deploy/
│   └── s6/                 # Reference s6 service directories and systemd unit
│       ├── stoat/          # s6 service dir for the Stoat application stack
│       ├── stoat-admin/    # s6 service dir for the admin dashboard stack
│       └── s6-services.service  # systemd unit for s6-svscan
├── compose.yml             # Production compose file (generic, ships with repo)
├── compose.override.example.yml  # Example overrides for deployment-specific config
├── .env.example            # Documents all required env vars with placeholder values
├── .gitignore
├── .dockerignore
├── LICENSE                 # AGPL-3.0 to match Stoat's licensing
└── README.md
```

### 0.2 — Initialize `api/` package

Scaffold the Express backend with TypeScript. Target Node 22. Use ESM modules (`"type": "module"` in `package.json`).

Install production dependencies: `express`, `express-session`, `better-sqlite3`, `better-sqlite3-session-store`, `mongodb`, `argon2`, `nanoid`, `node-cron`, `resend`, `cors`, `helmet`, `zod` (request validation).

Install dev dependencies: `typescript`, `tsx` (for development), `@types/express`, `@types/express-session`, `@types/better-sqlite3`, `@types/node-cron`, `@types/cors`.

Create `tsconfig.json` targeting `ES2022`, `NodeNext` module resolution, strict mode enabled, `outDir: "./dist"`.

Create npm scripts: `dev` (run with `tsx watch`), `build` (run `tsc`), `start` (run `node dist/index.js`), `seed` (run seed script).

### 0.3 — Initialize `web/` package

Scaffold with `npm create vite@latest` using the `react-ts` template.

Install production dependencies: `react-router-dom`, `@tanstack/react-query`.

Install dev dependencies: `tailwindcss`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`.

Configure Tailwind via the Vite plugin. Create a minimal `tailwind.css` with `@import "tailwindcss"`.

Set up a `VITE_API_URL` environment variable (used at build time for API base URL). Create an `api.ts` utility module that reads this variable and exports a configured fetch wrapper that includes credentials (cookies) on every request.

### 0.4 — Create `.env.example`

This file documents every required environment variable. It ships with the repo and contains only placeholder values.

```env
# MongoDB connection string — must point to the same MongoDB instance used by Stoat
# The admin dashboard connects directly to Stoat's database, not through an API
MONGODB=mongodb://database:27017

# Resend (https://resend.com) for sending invite emails
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Secret for signing Express session cookies
# Generate with: openssl rand -base64 32
SESSION_SECRET=

# The public-facing URL of your Stoat instance (used in invite emails)
INSTANCE_URL=https://chat.yourdomain.com

# A display name for your instance (used in invite email subject/body)
INSTANCE_NAME=My Stoat Instance

# Port the admin API listens on
ADMIN_API_PORT=5181

# URL where the admin frontend is served (used for CORS origin)
ADMIN_WEB_ORIGIN=http://localhost:5180
```

### 0.5 — Create `.gitignore`

Must exclude all sensitive and generated files. Include at minimum:

```
node_modules/
dist/
*.db
*.sqlite
.env
.env.local
.env.production
secrets.env
data/
```

### 0.6 — Create `.dockerignore`

Must mirror `.gitignore` to prevent sensitive files from entering the Docker build context. Additionally exclude `.git/`, `README.md`, `compose*.yml`, and test directories.

---

## Phase 1: Backend — Database Layer

### 1.1 — MongoDB connection module

Create `api/src/db/mongo.ts`. Export a function `connectMongo()` that creates a `MongoClient` from the `MONGODB` environment variable and connects. The connection must retry with exponential backoff on failure (start at 1s, max 30s, retry indefinitely) because the admin stack runs as a separate Podman Compose stack from Stoat — MongoDB may not be available yet if both stacks start simultaneously. Export a `getDb()` function that returns the `revolt` database handle. Export typed collection accessors:

```typescript
// Each function returns a typed Collection handle
accounts()       // revolt.accounts
users()          // revolt.users
sessions()       // revolt.sessions
invites()        // revolt.invites
safetyStrikes()  // revolt.safety_strikes
```

Define TypeScript interfaces for each collection's document shape matching the types in the design doc. Place these in `api/src/db/types.ts`. Only include the fields the admin dashboard reads or writes — do not attempt to type the entire Revolt schema.

### 1.2 — SQLite initialization module

Create `api/src/db/sqlite.ts`. On import, open (or create) `/data/admin.db` using `better-sqlite3`. The `/data` path is where the Docker volume mounts; for local development, fall back to `./data/admin.db` (create the directory if it doesn't exist).

Run the following DDL on startup (idempotent via `IF NOT EXISTS`):

```sql
CREATE TABLE IF NOT EXISTS admin_user (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  accepted_at TEXT,
  resend_message_id TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Export the `better-sqlite3` database instance and prepared statement helpers for common queries.

### 1.3 — Audit log helper

Create `api/src/db/audit.ts`. Export a function `logAction(action: string, target: string, details?: Record<string, unknown>)` that inserts into the `audit_log` table. The `details` parameter is serialized to JSON. This function is called by every mutating route handler.

---

## Phase 2: Backend — Authentication

### 2.1 — Seed script

Create `api/src/seed.ts`. This is a standalone CLI script (not part of the Express server) that creates the admin user.

Parse `--username` and `--password` from command-line arguments (or prompt interactively if not provided). Hash the password with `argon2.hash()` using the `argon2id` variant. Insert into the `admin_user` table. If a user already exists, print an error and exit (do not overwrite). The script should also support a `--reset-password` flag that updates the existing user's password hash.

Add an npm script: `"seed": "tsx src/seed.ts"`.

### 2.2 — Session middleware

Create `api/src/middleware/auth.ts`.

Configure `express-session` with: the `SESSION_SECRET` env var as the secret, a `better-sqlite3`-backed session store writing to the same `/data/admin.db` file, `cookie.maxAge` set to 2 hours (7200000ms), `cookie.httpOnly` set to true, `cookie.sameSite` set to `'strict'`, `cookie.secure` set to false (this runs over plain HTTP on the WireGuard subnet; no TLS between browser and admin services).

Export an `requireAuth` middleware function that checks `req.session.userId`. If not present, respond with `401 { error: "Not authenticated" }`. Attach this middleware to all routes except `POST /api/auth/login`.

### 2.3 — Auth routes

Create `api/src/routes/auth.ts`. Implement an Express Router with three routes.

`POST /api/auth/login`: Accept `{ username, password }` in the request body. Validate with Zod. Look up the user in the `admin_user` SQLite table by username. If not found, return `401`. Verify the password against the stored hash with `argon2.verify()`. If invalid, return `401`. On success, set `req.session.userId` and `req.session.username`, return `200 { username }`.

`POST /api/auth/logout`: Call `req.session.destroy()`, clear the session cookie, return `200`.

`GET /api/auth/me`: Return `200 { username: req.session.username }` if authenticated (the `requireAuth` middleware handles the 401 case).

---

## Phase 3: Backend — Invite Routes

### 3.1 — Invite routes

Create `api/src/routes/invites.ts`. Implement an Express Router. All routes require auth.

`GET /api/invites`: Query all rows from `invite_records` in SQLite, ordered by `created_at DESC`. Return `200` with the array. Include a `count` field with total records for future pagination.

`POST /api/invites`: Accept `{ email, expiresInHours?: number }` in the request body. Validate with Zod (email must be a valid email format).

Implementation steps, in order:
1. Generate a 12-character alphanumeric code using `nanoid` with a custom alphabet (`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`).
2. Compute `expires_at` as an ISO 8601 string if `expiresInHours` was provided, otherwise null.
3. Insert `{ _id: code }` into MongoDB `revolt.invites`.
4. Insert a record into SQLite `invite_records` with `code`, `email`, `status='pending'`, `expires_at`.
5. Send the invite email via the Resend SDK. The email body should contain a link: `${INSTANCE_URL}?invite=${code}`. Store the returned `message_id` in SQLite by updating the `invite_records` row.
6. Call `logAction('invite_created', email, { code, expires_at })`.
7. Return `201` with the invite record.

If the Resend API call fails, still return the invite record but include a `warning` field indicating the email failed to send. The invite code is still valid in MongoDB — the user just needs to receive the code through another channel.

`DELETE /api/invites/:code`: Look up the code in SQLite `invite_records`. If not found, return `404`. If status is not `pending`, return `400` (can only revoke pending invites). Delete the document from MongoDB `revolt.invites` (it may already be gone if used). Update the SQLite record's status to `revoked`. Call `logAction('invite_revoked', record.email, { code })`. Return `200`.

### 3.2 — Invite acceptance cron job

Create `api/src/jobs/inviteSync.ts`. Export a function `syncInviteStatuses()` that runs the following logic:

1. Query all rows from SQLite `invite_records` where `status = 'pending'`.
2. For each record, check if the corresponding document exists in MongoDB `revolt.invites` (query by `{ _id: record.code }`).
3. If the document does not exist in MongoDB, the invite was consumed by Stoat during registration. Update the SQLite record: set `status = 'accepted'` and `accepted_at = datetime('now')`.
4. If the record has an `expires_at` value and it is in the past, update the SQLite record: set `status = 'expired'`. Also attempt to delete the document from MongoDB `revolt.invites` (it may already be gone).

In the main Express server setup (`api/src/index.ts`), schedule this function with `node-cron` to run every 5 minutes: `cron.schedule('*/5 * * * *', syncInviteStatuses)`.

---

## Phase 4: Backend — User Routes

### 4.1 — User routes

Create `api/src/routes/users.ts`. Implement an Express Router. All routes require auth.

`GET /api/users`: Query MongoDB `revolt.users`. Project only the fields the frontend needs: `_id`, `username`, `discriminator`, `flags`, `avatar`. Join with `revolt.accounts` to include `email`, `disabled`, and `verification.status` for each user. Support query parameters: `page` (default 1), `limit` (default 50, max 100), `search` (optional, filters by email match against `revolt.accounts`). Return `200 { users: [...], total: number, page: number, limit: number }`.

The join between `users` and `accounts` is by `_id` (they share the same ULID). Since MongoDB doesn't have native joins, perform this as a `$lookup` aggregation or two sequential queries. The aggregation approach is preferred:

```typescript
db.collection('users').aggregate([
  { $match: matchFilter },
  { $skip: (page - 1) * limit },
  { $limit: limit },
  {
    $lookup: {
      from: 'accounts',
      localField: '_id',
      foreignField: '_id',
      as: 'account',
      pipeline: [{ $project: { email: 1, disabled: 1, verification: 1 } }]
    }
  },
  { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } }
])
```

`GET /api/users/:id`: Fetch a single user from `revolt.users` and their account from `revolt.accounts` by the same `_id`. Also fetch their strike history from `revolt.safety_strikes` where `user_id = id`. Return `200 { user, account, strikes }`. Return `404` if neither user nor account exists.

`POST /api/users/:id/ban`: Accept `{ reason: string }` in the request body. Validate with Zod (reason must be a non-empty string).

Implementation steps, in order:
1. Fetch the user from `revolt.users` to confirm they exist. Return `404` if not found.
2. Check if the account is already disabled (`revolt.accounts.disabled === true`). If so, return `400 { error: "User is already banned" }`.
3. Update `revolt.accounts`: set `disabled = true` where `_id = id`.
4. Update `revolt.users`: set `flags` to `(currentFlags || 0) | 4` where `_id = id`.
5. Delete all documents from `revolt.sessions` where `user_id = id`.
6. Insert a strike record into `revolt.safety_strikes`: `{ _id: generateULID(), user_id: id, reason: reason, type: "ban" }`. Use the `ulid` npm package to generate the ULID.
7. Call `logAction('user_banned', id, { reason })`.
8. Return `200 { success: true }`.

`POST /api/users/:id/unban`: No request body required.

Implementation steps:
1. Fetch the account from `revolt.accounts`. Return `404` if not found.
2. Check that `disabled === true`. If not, return `400 { error: "User is not banned" }`.
3. Update `revolt.accounts`: set `disabled = false` where `_id = id`.
4. Update `revolt.users`: set `flags` to `(currentFlags || 0) & ~4` where `_id = id`.
5. Call `logAction('user_unbanned', id)`.
6. Return `200 { success: true }`.

`DELETE /api/users/:id`: Accept optional `{ reason?: string }` in the request body.

Implementation steps:
1. Fetch the user from `revolt.users`. Return `404` if not found.
2. Update `revolt.accounts`: set `deletion = { status: "Scheduled", after: new Date().toISOString() }` where `_id = id`.
3. Update `revolt.users`: set `flags` to `(currentFlags || 0) | 2` where `_id = id`.
4. Delete all documents from `revolt.sessions` where `user_id = id`.
5. Call `logAction('user_deleted', id, { reason })`.
6. Return `200 { success: true }`.

Do not attempt to delete user data (messages, DMs, memberships) directly. Stoat's `crond` daemon processes scheduled deletions and handles all cascading data cleanup.

### 4.2 — Dashboard stats route

Create `api/src/routes/dashboard.ts`. Implement an Express Router. Requires auth.

`GET /api/dashboard/stats`: Aggregate and return summary counts:
1. Total users: `revolt.users.countDocuments({})`.
2. Banned users: `revolt.users.countDocuments({ flags: { $bitsAllSet: 4 } })`.
3. Pending invites: SQLite query `SELECT COUNT(*) FROM invite_records WHERE status = 'pending'`.
4. Recent bans (last 30 days): SQLite query `SELECT COUNT(*) FROM audit_log WHERE action = 'user_banned' AND created_at > datetime('now', '-30 days')`.

Return `200 { totalUsers, bannedUsers, pendingInvites, recentBans }`.

---

## Phase 5: Backend — Server Setup

### 5.1 — Express server entry point

Create `api/src/index.ts`. This is the main entry point.

Startup sequence:
1. Load environment variables (use a validation function with Zod to parse and validate all required env vars at startup — fail fast with a clear error message if any are missing).
2. Connect to MongoDB via `connectMongo()`.
3. Initialize SQLite (the import of `sqlite.ts` triggers table creation).
4. Configure Express with: `helmet()` for security headers, `cors({ origin: ADMIN_WEB_ORIGIN, credentials: true })`, `express.json()`, the session middleware from Phase 2.
5. Mount route handlers: auth routes at `/api/auth`, invite routes at `/api/invites`, user routes at `/api/users`, dashboard routes at `/api/dashboard`.
6. Apply `requireAuth` middleware to all routes except `/api/auth/login`.
7. Start the cron job from Phase 3.
8. Listen on the port from `ADMIN_API_PORT`.

### 5.2 — Error handling middleware

Create `api/src/middleware/errors.ts`. Add a global Express error handler that catches unhandled errors, logs the stack trace to stderr, and returns `500 { error: "Internal server error" }`. Never leak stack traces or internal details in the response body.

Also create a `notFound` middleware mounted after all routes that returns `404 { error: "Not found" }`.

---

## Phase 6: Frontend — Core Setup

### 6.1 — API client module

Create `web/src/lib/api.ts`. Export a configured fetch wrapper:

```typescript
const API_BASE = import.meta.env.VITE_API_URL;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',  // send session cookie
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || 'Request failed');
  }

  return res.json();
}
```

Define an `ApiError` class with `status` and `message` fields.

### 6.2 — Auth context

Create `web/src/lib/auth.tsx`. Implement a React context provider that manages authentication state.

On mount, call `GET /api/auth/me`. If it returns 200, the user is authenticated. If 401, the user is not authenticated. Expose `user`, `login(username, password)`, `logout()`, and `isLoading` through the context.

Wrap the entire app in this provider in `main.tsx`.

### 6.3 — Router setup

Create `web/src/router.tsx`. Configure React Router with the following structure:

- `/login` — Login view (public)
- `/` — Dashboard view (protected)
- `/invites` — Invites list view (protected)
- `/users` — Users list view (protected)
- `/users/:id` — User detail view (protected)

Create a `ProtectedRoute` wrapper component that checks the auth context and redirects to `/login` if not authenticated.

### 6.4 — Layout component

Create `web/src/components/Layout.tsx`. A simple shell with: a sidebar or top nav with links to Dashboard, Invites, Users, and a logout button. The main content area renders the `<Outlet />`. The layout should display the current user's username in the nav.

---

## Phase 7: Frontend — Views

### 7.1 — Login view

Create `web/src/views/Login.tsx`. A centered card with username and password inputs and a submit button. On submit, call the `login()` function from the auth context. Display an error message on failure. Redirect to `/` on success.

### 7.2 — Dashboard view

Create `web/src/views/Dashboard.tsx`. Fetch stats from `GET /api/dashboard/stats` using TanStack Query. Display four stat cards: total users, banned users, pending invites, recent bans (last 30 days). Nothing interactive — this is a read-only overview.

### 7.3 — Invites view

Create `web/src/views/Invites.tsx`. Two sections:

A creation form at the top: email input, optional expiry dropdown (24h / 48h / 7 days / 30 days / no expiry), and a "Send Invite" button. On submit, call `POST /api/invites`. Show a success message with the invite code, or an error on failure. Use a TanStack Query mutation.

A table below showing all invites fetched from `GET /api/invites`. Columns: email, code, status (with color-coded badges: green for accepted, yellow for pending, red for revoked, gray for expired), created date, expires date. Each pending invite row has a "Revoke" button that calls `DELETE /api/invites/:code` and invalidates the query cache.

### 7.4 — Users view

Create `web/src/views/Users.tsx`. A search bar at the top that filters by email (debounced, passed as a `search` query parameter). A paginated table below showing users fetched from `GET /api/users`. Columns: username#discriminator, email, status (active / banned / deleted, derived from `flags` and `account.disabled`), verified (yes/no from `account.verification.status`). Clicking a row navigates to `/users/:id`.

Pagination controls (previous/next) at the bottom, driven by the `total`, `page`, and `limit` fields in the API response.

### 7.5 — User detail view

Create `web/src/views/UserDetail.tsx`. Fetch user data from `GET /api/users/:id` using TanStack Query.

Display three sections in a stacked layout:

**User info card:** Username#discriminator, email, account status (active/banned/disabled), email verification status, user ID (copyable). Show the user's flag state as human-readable badges.

**Actions:** Contextual action buttons based on the user's current state. If the user is active: show a "Ban" button that opens a confirmation dialog with a reason input, and a "Delete" button with a confirmation dialog. If the user is banned: show an "Unban" button with a confirmation dialog. If the user is scheduled for deletion: show no actions (deletion is irreversible once scheduled). Each action calls the corresponding API endpoint using a TanStack Query mutation and invalidates the user query on success.

**Strike history:** A table of strike records from the `strikes` array in the API response. Columns: reason, type (badge: strike/suspension/ban), date (decoded from the ULID `_id` using the `ulid` package's `decodeTime` function).

---

## Phase 8: Dockerfiles

### 8.1 — API Dockerfile

Create `api/Dockerfile`:

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 5181
CMD ["node", "dist/index.js"]
```

Note: `argon2` is a native module that requires a build step. The `node:22-slim` base image includes the necessary build tools. If build issues arise, switch to `node:22` (non-slim) for the build stage.

### 8.2 — Web Dockerfile (Caddy + Coraza WAF)

The web container uses a custom Caddy build with the Coraza WAF plugin compiled in via `xcaddy`. Coraza provides OWASP Core Rule Set (CRS) protection at the edge, even though this service is only reachable via WireGuard — defense in depth.

Create `web/Dockerfile`:

```dockerfile
FROM node:22-slim AS build-app
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
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

Create `web/Caddyfile`:

```caddyfile
:80 {
	# Coraza WAF — load OWASP CRS rules
	coraza_waf {
		load_owasp_crs
		directives `
			Include /etc/caddy/coraza.conf
			SecRuleEngine On
		`
	}

	# Serve the static SPA
	root * /srv
	file_server

	# SPA fallback — rewrite any path that doesn't match a file to index.html
	# Required for client-side routing (React Router)
	try_files {path} /index.html
}
```

Create `web/coraza.conf` for Coraza rule customization:

```
# Coraza configuration overrides
# Tune false positives here as they arise

# Set paranoia level (1 = low, 4 = max)
SecAction "id:900000, phase:1, pass, t:none, nolog, setvar:tx.blocking_paranoia_level=1"

# Suppress noisy rules that fire on legitimate SPA requests if needed
# SecRuleRemoveById <rule_id>
```

The `try_files {path} /index.html` directive in Caddy is the equivalent of nginx's `try_files $uri $uri/ /index.html` — it ensures that client-side routes like `/users/abc123` serve the SPA's `index.html` instead of returning a 404.

### 8.3 — Web `.dockerignore`

Create `web/.dockerignore` to prevent `node_modules/`, `dist/`, and `.env*` from entering the build context.

---

## Phase 9: Docker Compose & s6 Process Supervision

The admin dashboard runs as its own Podman Compose stack, fully independent from the Stoat application stack. Both stacks are supervised by s6 using a hybrid model: s6 manages stack-level lifecycle (start/stop/restart of entire compose stacks), Podman's `restart: unless-stopped` handles individual container crashes within a stack, and ad-hoc individual container operations use `podman restart <container>`. A single systemd unit runs `s6-svscan` as a persistent service — systemd's only job is keeping s6 alive.

### 9.1 — Production compose file

Create `compose.yml` at the repo root. This is the generic, open-source-friendly version. The `stoat` network is declared as external, meaning Podman expects it to already exist (created by the Stoat stack). Users must verify the actual network name with `podman network ls` and adjust accordingly.

```yaml
networks:
  stoat:
    external: true
    name: stoat_default  # Adjust to match your Stoat stack's network name

services:
  admin-api:
    build:
      context: ./api
    image: ghcr.io/OWNER/stoat-admin-api:latest
    restart: unless-stopped
    ports:
      - "${ADMIN_BIND_IP:-127.0.0.1}:${ADMIN_API_PORT:-5181}:5181"
    env_file:
      - .env
    volumes:
      - ./data:/data
    networks:
      - stoat

  admin-web:
    build:
      context: ./web
      args:
        VITE_API_URL: ${ADMIN_WEB_API_URL:-http://127.0.0.1:5181}
    image: ghcr.io/OWNER/stoat-admin-web:latest
    restart: unless-stopped
    ports:
      - "${ADMIN_BIND_IP:-127.0.0.1}:${ADMIN_WEB_PORT:-5180}:80"
    networks:
      - stoat
```

The `ADMIN_BIND_IP` variable defaults to `127.0.0.1` (localhost only). Users deploying with WireGuard set this to their WireGuard interface IP.

The `restart: unless-stopped` directive in the compose file is intentional and does not conflict with s6. The two supervisors operate at different granularities: Podman restarts individual containers that crash within a running stack, while s6 restarts the `podman compose up` process if the entire compose session dies. There is no overlap.

Because this is a separate stack from Stoat, `depends_on` cannot reference Stoat's MongoDB or Redis containers. Startup ordering between stacks is handled by s6 (see 9.3). The admin-api MongoDB connection module (Phase 1.1) must handle connection failures gracefully with exponential backoff retry, since MongoDB may not be ready yet when the admin stack starts.

### 9.2 — Override example

Create `compose.override.example.yml` with comments explaining common customizations: changing the network name, binding to a WireGuard IP, setting resource limits.

### 9.3 — s6 service directories

Create example s6 service directory structures in a `deploy/s6/` directory at the repo root. These are reference files that users copy to their s6 scan directory (e.g., `/etc/s6-services/`). All `run` and `finish` scripts must be executable (`chmod +x`).

**`deploy/s6/stoat-admin/run`:**
```bash
#!/bin/bash
set -e

# Wait for the Stoat network to exist before starting.
# If it doesn't exist yet, this script exits and s6 restarts it,
# effectively polling until the Stoat stack has initialized the network.
if ! podman network exists stoat_default; then
  sleep 5
  exit 1
fi

cd /srv/stoat-admin
exec podman compose up 2>&1
```

The network check handles the race condition where s6 starts both stacks simultaneously. If `stoat_default` doesn't exist yet, the script sleeps briefly and exits non-zero. s6 restarts it, and it tries again. Once the network exists, it falls through to `exec podman compose up` which replaces the bash process with the podman process — exactly what s6 expects as a long-lived supervised process. The `exec` is critical: without it, bash stays resident as a parent between s6 and podman, and signals from s6 would hit bash instead of podman.

**`deploy/s6/stoat-admin/finish`:**
```bash
#!/bin/bash
cd /srv/stoat-admin
podman compose down
```

The `finish` script runs whenever `run` exits (whether normally or via `s6-svc -d`). It ensures containers are cleaned up rather than left orphaned. No `exec` needed here — this is a short-lived cleanup script, not a long-running process.

**`deploy/s6/stoat-admin/log/run`:**
```bash
#!/bin/bash
exec s6-log -b -- T /var/log/s6/stoat-admin/
```

The `T` directive prefixes each line with a TAI64N timestamp. Logs for each stack are written to their own directory, cleanly separated. Read logs with `tail -f /var/log/s6/stoat-admin/current | s6-tai64nlocal` to get human-readable timestamps. The `exec` replaces bash with the `s6-log` process so s6 supervises the logger directly.

Also create the equivalent Stoat stack service directory structure (`deploy/s6/stoat/`) with the same pattern, substituting the compose project path and removing the network check (the Stoat stack creates the network, it doesn't depend on it). Include both in the repo as reference examples, with a note that paths and network names must be adjusted for each deployment.

**`deploy/s6/stoat/run`:**
```bash
#!/bin/bash
set -e
cd /srv/stoat
exec podman compose up 2>&1
```

**`deploy/s6/stoat/finish`:**
```bash
#!/bin/bash
cd /srv/stoat
podman compose down
```

**`deploy/s6/stoat/log/run`:**
```bash
#!/bin/bash
exec s6-log -b -- T /var/log/s6/stoat/
```

### 9.4 — systemd unit for s6-svscan

Create `deploy/s6/s6-services.service` as a reference systemd unit file. This is the single systemd unit that runs the entire s6 supervision tree. All stack lifecycle management happens through s6 tooling, not systemd.

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

Document the required setup steps in the README:
1. Install s6 on Ubuntu 24.04: `apt install s6`.
2. Create the scan directory: `mkdir -p /etc/s6-services`.
3. Create log output directories: `mkdir -p /var/log/s6/stoat /var/log/s6/stoat-admin`.
4. Copy service directories from `deploy/s6/` to `/etc/s6-services/`, adjust paths and network names.
5. Ensure all `run` and `finish` scripts are executable.
6. Install the systemd unit: `cp deploy/s6/s6-services.service /etc/systemd/system/`, then `systemctl daemon-reload && systemctl enable --now s6-services`.

### 9.5 — Document common operations

Include a quick-reference section in the README (or a separate `OPERATIONS.md`) covering the day-to-day s6 commands:

```sh
# --- Stack-level operations (via s6) ---

# Restart the entire admin stack
s6-svc -r /etc/s6-services/stoat-admin

# Stop the admin stack (bring down all its containers)
s6-svc -d /etc/s6-services/stoat-admin

# Start the admin stack back up
s6-svc -u /etc/s6-services/stoat-admin

# Check if a stack is running
s6-svstat /etc/s6-services/stoat-admin

# --- Individual container operations (via podman) ---

# Restart just the admin API container without bouncing the web container
podman restart stoat-admin-admin-api-1

# View logs for a specific container
podman logs -f stoat-admin-admin-api-1

# --- Log access ---

# View live s6 logs for the admin stack (with human-readable timestamps)
tail -f /var/log/s6/stoat-admin/current | s6-tai64nlocal

# --- Updating images ---

# Pull new images and restart the admin stack
cd /srv/stoat-admin
podman compose pull
s6-svc -r /etc/s6-services/stoat-admin
```

---

## Phase 10: GitHub Actions CI/CD

### 10.1 — Build and push workflow

Create `.github/workflows/build.yml`. Trigger on push to `main` and on tags matching `v*`.

Jobs:
1. **build-api**: Check out the repo, set up Node 22, run `npm ci` and `npm run build` in `api/`, then build the Docker image and push to GHCR. Tag with both `latest` and the Git SHA (or Git tag if triggered by a tag push).
2. **build-web**: Same pattern for `web/`. Pass `VITE_API_URL` as a build arg — for the CI-built image, use a placeholder value. Users will rebuild with their own URL or override at runtime.

Use `docker/login-action` for GHCR auth and `docker/build-push-action` for building and pushing.

### 10.2 — Lint and type-check workflow

Create `.github/workflows/ci.yml`. Trigger on pull requests and pushes to `main`.

Jobs:
1. **api-check**: Run `npm ci`, `npm run build` (TypeScript type checking), and `npx eslint .` in `api/`.
2. **web-check**: Run `npm ci`, `npm run build`, and `npx eslint .` in `web/`.

---

## Phase 11: Documentation

### 11.1 — README.md

Write a README covering: project description (one paragraph), features list, prerequisites (Stoat instance with `invite_only = true`, Docker/Podman, s6 for process supervision, WireGuard recommended), quick start guide (clone, copy `.env.example`, fill in values, run seed script, `podman compose up`), s6 setup guide (installing s6, creating scan directory, copying service directories, enabling the systemd unit), configuration reference (table of all env vars with descriptions), architecture overview (link to design doc), operations quick-reference (s6 and podman commands for common tasks), development setup (how to run both services locally without Docker or s6), and contributing guidelines.

### 11.2 — SECURITY.md

Document the security model: WireGuard-only access, session-based auth as defense in depth, no public exposure by design. Include instructions for reporting security issues.

---

## Phase 12: Pre-Release Audit

### 12.1 — Secrets scan

Before making the repository public, perform a full scan for leaked secrets:

1. `grep -r` across the entire repo for: any real domain names, email addresses, IP addresses in the `10.x.x.x` range, ULIDs that aren't obviously placeholders, API key prefixes (`re_`), anything resembling a base64-encoded secret.
2. Check Git history with: `git log --all --diff-filter=A -- '*.env' '*.env.local' 'secrets*' '*.db' '*.sqlite'` to verify no sensitive files were ever committed.
3. Verify that `docker inspect` on built images does not reveal any secrets baked into layers.

### 12.2 — License compliance

The Stoat backend is AGPL-3.0. This dashboard connects to Stoat's MongoDB but does not link against or include any Stoat code. AGPL-3.0 for the admin dashboard is a reasonable licensing choice to match the ecosystem, but confirm this is the intent. Add the `LICENSE` file and SPDX identifiers in `package.json`.

---

## Task Dependency Graph

The phases can be partially parallelized. Here is the critical path:

```
Phase 0 (scaffolding)
  ├─→ Phase 1 (DB layer) → Phase 2 (auth) → Phase 3 (invites) ─┐
  │                                         → Phase 4 (users)   ─┤
  │                                         → Phase 5 (server)  ─┤
  └─→ Phase 6 (frontend core) → Phase 7 (views)                 ─┤
                                                                   ↓
                                                     Phase 8 (Docker)
                                                         ↓
                                                     Phase 9 (Compose)
                                                         ↓
                                                     Phase 10 (CI/CD)
                                                         ↓
                                                     Phase 11 (Docs)
                                                         ↓
                                                     Phase 12 (Audit)
```

Phases 1–5 (backend) and Phase 6–7 (frontend) can be developed in parallel. Phases 8+ are sequential and depend on both tracks being complete.
