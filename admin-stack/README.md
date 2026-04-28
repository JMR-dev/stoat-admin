# Admin Stack

This repository contains the deployment configuration for the Admin interface.

## Prerequisites

1. Same host as Stoat, rootless user with linger.
2. Ansible + podman + WireGuard userspace tools installed.
3. GCP credentials for Secret Manager.
4. Public DNS record for `admin.${DOMAIN}` in Google Cloud DNS pointing to the WG server IP (or no record at all if using `tls internal`).
5. Cloud DNS service account provisioned with `roles/dns.admin` and stored in Secret Manager.

## First Deploy

Run the bootstrap script:

```bash
./scripts/bootstrap.sh
```

## Adding a new WG client

1. Edit `wg_clients` in `ansible/inventory.yml` (or your overriding group_vars).
2. Re-run the wireguard playbook:
   ```bash
   ansible-playbook -i ansible/inventory.yml ansible/wireguard.yml
   ```
3. Distribute the new client config from `./generated/clients/<name>.conf`.

## Removing a WG client

1. Remove the client from `wg_clients`.
2. Re-run the playbook.
3. Verify in `wg show wg0` that the peer is gone.

## Rotating the WG server key

Rotating the server key is disruptive — every client config must be regenerated and redistributed.

1. Remove the old key from Secret Manager or create a new version.
2. Re-run the wireguard playbook.

## Rotating the Caddy DNS service account key

1. Generate a new key with `gcloud iam service-accounts keys create`.
2. Push to Secret Manager as a new version.
3. Re-run bootstrap step 6 to materialize the key.
4. Restart Caddy (`podman compose restart caddy`).
5. Disable the old key with `gcloud iam service-accounts keys disable` and finally delete after a grace period.

## Redeploy Procedure

1. `podman compose pull`
2. `podman compose up -d`
3. `./scripts/verify.sh`

## Secret Rotation Procedure

1. Update the secret in GCP Secret Manager (e.g. `admin-env`).
2. Materialize the `.env` file again.
3. `podman compose up -d` to recreate containers with the new environment.

## SQLite Backup and Recovery Procedure

Backups are handled by `scripts/sqlite-backup.sh`.

1. To restore, stop the `admin-api` container.
2. Replace the live `admin.db` in the `admin-sqlite` named volume with the snapshot file.
3. Restart the `admin-api` container.
