# Stoat Admin

Stoat Admin is a lightweight self-hosted moderation and invite dashboard for a Stoat chat instance. It runs as a separate Podman Compose stack, joins the Stoat network to talk to MongoDB directly, and now ships with a dedicated `admin-proxy` Caddy service that terminates HTTPS for the admin stack with Caddy's internal CA.

## Features

- Single-admin login with Argon2id password hashing and SQLite-backed sessions
- Invite creation, revocation, and acceptance tracking
- User listing, lookup, ban, unban, and scheduled deletion actions
- Dashboard stats for users, pending invites, and recent bans
- `pnpm` workspace with Turborepo coordinating cross-package tasks
- Example Podman Compose, s6 service directories, and GitHub Actions workflows

## Project Layout

```text
.
├── api/                  # Express + TypeScript backend
├── proxy/                # Caddy + Coraza reverse proxy image
├── web/                  # Vite + React frontend and static image build
├── deploy/s6/            # Example s6 service directories and systemd unit
├── compose.yml           # Production-oriented compose file
├── compose.override.example.yml
├── docs/                 # Design and task references
└── .env.example
```

## Admin Setup

To create the admin user, run this command inside the admin container

`node dist/seed.js --username admin --password <your-password>`

## Prerequisites

- Node 22+
- `pnpm` via Corepack
- Turborepo is installed through the workspace dependencies
- A Stoat deployment with MongoDB reachable on the shared container network
- `invite_only = true` in Stoat's `Revolt.toml`
- Podman or Docker-compatible compose support
- A hostname for the admin dashboard that resolves on your WireGuard/private network
- A way to trust Caddy's internal root CA on the admin devices that will access the dashboard

## Quick Start

1. Enable `pnpm`:

```sh
corepack enable
```

2. Install dependencies:

```sh
pnpm install
```

3. Copy the environment template and fill in the real values:

```sh
cp .env.example .env
```

4. Seed the admin account from the root workspace:

```sh
pnpm seed -- --username admin --password '<strong-password>'
```

5. Run both packages together through Turborepo:

```sh
pnpm dev
```

Useful targeted variants:

```sh
pnpm dev:api
pnpm dev:web
```

## Configuration

| Variable            | Description                                      |
| ------------------- | ------------------------------------------------ |
| `MONGODB`           | MongoDB connection string for the Stoat database |
| `RESEND_API_KEY`    | Resend API key for invite delivery               |
| `RESEND_FROM_EMAIL` | Sender address for invite messages               |
| `SESSION_SECRET`    | Express session signing secret                   |
| `INSTANCE_URL`      | Public Stoat URL used in invite links            |
| `INSTANCE_NAME`     | Human-readable instance name used in copy        |
| `ADMIN_API_PORT`    | Listen port for `admin-api`                      |
| `ADMIN_WEB_ORIGIN`  | Exact HTTPS browser origin allowed by CORS       |
| `ADMIN_HOSTNAME`    | Hostname served by the dedicated Caddy proxy     |
| `ADMIN_BIND_IP`     | Compose bind IP for the proxy's published ports  |
| `ADMIN_HTTP_PORT`   | Published HTTP port for redirect handling        |
| `ADMIN_HTTPS_PORT`  | Published HTTPS port for the admin dashboard     |
| `ADMIN_WEB_API_URL` | Optional frontend API override outside compose   |

## Deployment

The repo ships with a standalone `compose.yml` that expects an external `stoat_default` network. Update the network name if your Stoat stack uses a different one.

For local compose use, the proxy defaults to `https://localhost:9443` and `http://localhost:9080`. For deployed hosts, set `ADMIN_HOSTNAME` to the real admin name and switch `ADMIN_HTTP_PORT`/`ADMIN_HTTPS_PORT` to `80`/`443` or use [compose.override.example.yml](/home/jasonross/workspace/stoat-admin/compose.override.example.yml) as a starting point.

The deployment topology is:

- `admin-proxy` is built from [proxy/Dockerfile](/home/jasonross/workspace/stoat-admin/proxy/Dockerfile), publishes the configured HTTP and HTTPS ports, issues a private certificate from Caddy's internal CA, applies Coraza, and reverse-proxies `/api/*` to `admin-api` and everything else to `admin-web`.
- `admin-web` and `admin-api` are no longer published directly on the host.
- `admin-web` serves the built Vite bundle privately on the admin network.
- `admin-api` stays attached to the shared Stoat network for MongoDB access and also joins a private admin network used by the proxy.

Before starting the stack, point `ADMIN_HOSTNAME` at the host running `admin-proxy` on your WireGuard/private network and set `ADMIN_WEB_ORIGIN` to `https://<that-hostname>`.

After the proxy has started once, install Caddy's root CA on each admin device before browsing to the dashboard. One way to export it is:

```sh
docker compose exec admin-proxy sh -c 'cat /data/caddy/pki/authorities/local/root.crt' > admin-proxy-root.crt
```

Then import `admin-proxy-root.crt` into the OS/browser trust store for the devices that should access the dashboard.

For supervised deployments:

1. Install `s6`
2. Copy `deploy/s6/stoat` and `deploy/s6/stoat-admin` into `/etc/s6-services`
3. Adjust service paths and network names
4. Copy `deploy/s6/s6-services.service` into `/etc/systemd/system/`
5. Enable the unit:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now s6-services
```

Common operations:

```sh
s6-svc -r /etc/s6-services/stoat-admin
s6-svc -d /etc/s6-services/stoat-admin
s6-svc -u /etc/s6-services/stoat-admin
s6-svstat /etc/s6-services/stoat-admin
tail -f /var/log/s6/stoat-admin/current | s6-tai64nlocal
```

## Development Notes

- The backend uses SQLite for admin credentials, audit logs, and invite metadata, and MongoDB for Stoat state.
- In the composed deployment, the frontend always uses same-origin `/api` requests through `admin-proxy`; `VITE_API_URL` is only useful outside compose.
- Root task orchestration is handled by Turborepo through [turbo.json](/home/jasonross/workspace/stoat-admin/turbo.json).
- The current repo state is a first implementation slice based on the design docs in [docs/stoat-admin-design.md](/home/jasonross/workspace/stoat-admin/docs/stoat-admin-design.md) and [docs/stoat-admin-tasks.md](/home/jasonross/workspace/stoat-admin/docs/stoat-admin-tasks.md).

## Contributing

Keep infrastructure-specific values out of committed files. Prefer changes that preserve the split between the standalone admin stack and the main Stoat stack.
