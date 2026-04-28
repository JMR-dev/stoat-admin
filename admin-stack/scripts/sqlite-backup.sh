#!/usr/bin/env bash
set -euo pipefail

SRC_VOLUME="admin-sqlite"
DEST_DIR="/var/backups/admin-sqlite"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST_FILE="${DEST_DIR}/admin-${TIMESTAMP}.sqlite"

mkdir -p "${DEST_DIR}"

# Use sqlite3 .backup for an atomic snapshot
podman run --rm \
    -v "${SRC_VOLUME}:/data:ro" \
    -v "${DEST_DIR}:/out" \
    docker.io/keinos/sqlite3:3.42.0 \
    sqlite3 /data/admin.db ".backup '/out/admin-${TIMESTAMP}.sqlite'"

# Retain last 7 snapshots locally
ls -1t "${DEST_DIR}"/admin-*.sqlite | tail -n +8 | xargs -r rm
