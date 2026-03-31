# Stoat Admin

Stoat Admin is a lightweight self-hosted moderation and invite dashboard for a Stoat chat instance. It runs as a separate Podman Compose stack, joins the Stoat network to talk to MongoDB directly, and is intended to be reachable only over WireGuard.

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
├── web/                  # Vite + React + TypeScript frontend
├── deploy/s6/            # Example s6 service directories and systemd unit
├── compose.yml           # Production-oriented compose file
├── compose.override.example.yml
├── docs/                 # Design and task references
└── .env.example
```

## Prerequisites

- Node 22+
- `pnpm` via Corepack
- Turborepo is installed through the workspace dependencies
- A Stoat deployment with MongoDB reachable on the shared container network
- `invite_only = true` in Stoat's `Revolt.toml`
- Podman or Docker-compatible compose support
- WireGuard or another private network boundary for admin access

## Quick Start

1. Enable `pnpm`:

```sh
corepack enable
```

2. Install dependencies:

```sh
COREPACK_HOME=/tmp/corepack pnpm install
```

3. Copy the environment template and fill in the real values:

```sh
cp .env.example .env
```

4. Seed the admin account from the root workspace:

```sh
COREPACK_HOME=/tmp/corepack pnpm seed -- --username admin --password '<strong-password>'
```

5. Run both packages together through Turborepo:

```sh
COREPACK_HOME=/tmp/corepack pnpm dev
```

Useful targeted variants:

```sh
COREPACK_HOME=/tmp/corepack pnpm dev:api
COREPACK_HOME=/tmp/corepack pnpm dev:web
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
| `ADMIN_WEB_ORIGIN`  | Exact browser origin allowed by CORS             |
| `ADMIN_BIND_IP`     | Compose bind IP for admin services               |
| `ADMIN_WEB_PORT`    | Host port for the frontend                       |
| `ADMIN_WEB_API_URL` | API base URL baked into the frontend build       |

## Deployment

The repo ships with a standalone `compose.yml` that expects an external `stoat_default` network. Update the network name if your Stoat stack uses a different one.

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
- The frontend talks directly to the API with cookie-based auth and TanStack Query.
- Root task orchestration is handled by Turborepo through [turbo.json](/home/jasonross/workspace/stoat-admin/turbo.json).
- The current repo state is a first implementation slice based on the design docs in [docs/stoat-admin-design.md](/home/jasonross/workspace/stoat-admin/docs/stoat-admin-design.md) and [docs/stoat-admin-tasks.md](/home/jasonross/workspace/stoat-admin/docs/stoat-admin-tasks.md).

## Contributing

Keep infrastructure-specific values out of committed files. Prefer changes that preserve the split between the standalone admin stack and the main Stoat stack.
