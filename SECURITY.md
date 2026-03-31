# Security Policy

## Security Model

Stoat Admin is designed for private administration over a WireGuard-restricted network. The intended deployment model is:

- `admin-web` and `admin-api` bind only to a private interface such as `wg0`
- the dashboard is not exposed through the public Stoat reverse proxy
- the API still requires session-based authentication with an Argon2id-hashed admin credential

This means WireGuard limits network access and the application session limits user access. Both layers are expected in production.

## Reporting

If you discover a security issue, avoid opening a public issue with exploit details. Share the report privately with the maintainer and include:

- affected version or commit
- reproduction steps
- impact
- any suggested mitigation

## Deployment Notes

- Keep `SESSION_SECRET` and `RESEND_API_KEY` out of the repository.
- Restrict permissions on the SQLite database file mounted at `/data/admin.db`.
- Set `ADMIN_WEB_ORIGIN` precisely. Do not use `*`.
- Verify the compose port bindings are limited to the intended private interface.
