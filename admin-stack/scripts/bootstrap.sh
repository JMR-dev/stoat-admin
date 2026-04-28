#!/usr/bin/env bash
set -euo pipefail

echo "=== 1. Verifying rootless podman ==="
PODMAN_USER=$(whoami)
if ! loginctl show-user ${PODMAN_USER} | grep -q "Linger=yes"; then
    echo "Error: Linger is not enabled for user ${PODMAN_USER}"
    exit 1
fi

echo "=== 2. Ansible: WireGuard ==="
ansible-playbook -i ansible/inventory.yml ansible/wireguard.yml

echo "Client configs generated at: $(realpath ./ansible/../generated/clients)"
echo "Please securely copy these to your client devices."

echo "=== 3. Verify wg0 ==="
if ! wg show wg0 >/dev/null 2>&1; then
    echo "Error: wg0 interface is not up"
    exit 1
fi

echo "=== 4. Ansible: Networks ==="
ansible-playbook -i ansible/inventory.yml ansible/networks.yml

echo "=== 5. Materialize .env ==="
gcloud secrets versions access latest --secret=admin-env > .env
chmod 600 .env

echo "=== 6. Materialize Caddy SA Key ==="
mkdir -p ./secrets
gcloud secrets versions access latest --secret=admin-caddy-dns-sa-key > ./secrets/caddy-dns-sa.json
chmod 600 ./secrets/caddy-dns-sa.json

echo "=== 7. Podman Compose Build ==="
podman compose build

echo "=== 8. Podman Compose Pull ==="
podman compose pull

echo "=== 9. Podman Compose Up ==="
podman compose up -d

echo "=== 10. Wait for services ==="
echo "Waiting up to 120s for services to become healthy..."
sleep 10 # Let them start

echo "=== 11. Verify ==="
./scripts/verify.sh
