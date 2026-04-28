# Security Policy

## Security Model

Stoat Admin is designed to keep the application containers private even when the admin entrypoint is fronted by its own HTTPS proxy. The intended deployment model is:

- `admin-proxy` is the only published service and terminates HTTPS for the admin stack with Caddy's internal CA
- `admin-web` and `admin-api` are reachable only on the private admin container network
- `admin-api` joins the Stoat network only so it can reach MongoDB
- the dashboard is not exposed through the public Stoat reverse proxy
- the API still requires session-based authentication with an Argon2id-hashed admin credential

This means the reverse proxy limits what is exposed, the shared Stoat network is used only where needed, and the application session still limits user access.

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
- Verify the compose port bindings expose only `admin-proxy`, not `admin-web` or `admin-api`.
- Trust Caddy's internal root CA only on the admin devices that should access the dashboard.
- Protect the `admin_proxy_data` volume. It contains the private CA material used to issue the dashboard certificate.
