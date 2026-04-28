#!/usr/bin/env bash
set -euo pipefail

WG_SERVER_IP="${WG_SERVER_IP:-10.42.0.1}"
HOST_PUBLIC_IP=$(curl -s ifconfig.me || echo "127.0.0.1")

echo "Running verification checks..."

# 1. WG interface up
if wg show wg0 >/dev/null 2>&1 && wg show wg0 peers | grep -q .; then
    echo "[ok] WG interface wg0 is up and has peers"
else
    echo "[fail] WG interface wg0 is down or has no peers"
    exit 1
fi

# 2. WG IP bound
if ip -o addr show wg0 | grep -q "${WG_SERVER_IP}"; then
    echo "[ok] WG interface wg0 bound to ${WG_SERVER_IP}"
else
    echo "[fail] WG interface wg0 is not bound to ${WG_SERVER_IP}"
    exit 1
fi

# 3. Caddy listening on WG IP, NOT public IP
if ss -tlnp | grep -E ':443\b' | grep -q "${WG_SERVER_IP}"; then
    if ss -tlnp | grep -E ':443\b' | grep -q -E "0\.0\.0\.0|::|\*"; then
        echo "[fail] Caddy is bound to public IP"
        exit 1
    else
        echo "[ok] Caddy is bound only to WG IP"
    fi
else
    echo "[fail] Caddy is not bound to ${WG_SERVER_IP}:443"
    exit 1
fi

# 4. Admin endpoint NOT reachable from public
if curl --max-time 3 -k https://${HOST_PUBLIC_IP}/ >/dev/null 2>&1; then
    echo "[fail] Admin endpoint is reachable from public IP"
    exit 1
else
    echo "[ok] Admin endpoint is not reachable from public IP"
fi

# 5. Networks present
if podman network inspect admin-edge >/dev/null 2>&1 && podman network inspect stoat-shared >/dev/null 2>&1; then
    echo "[ok] Podman networks admin-edge and stoat-shared exist"
else
    echo "[fail] Required podman networks are missing"
    exit 1
fi

# 6. All expected services healthy
SERVICES=("admin-stack-caddy-1" "admin-stack-admin-frontend-1" "admin-stack-admin-api-1")
for service in "${SERVICES[@]}"; do
    if podman ps --format "{{.Names}}" | grep -q "${service}"; then
        echo "[ok] Service ${service} is running"
    else
        echo "[fail] Service ${service} is not running"
        exit 1
    fi
done

# 7. admin-api can reach MongoDB
API_CONTAINER=$(podman ps -q -f name=admin-stack-admin-api-1)
if podman exec "${API_CONTAINER}" curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo "[ok] admin-api healthcheck passed"
else
    echo "[fail] admin-api healthcheck failed"
    exit 1
fi

# 8. No unexpected host ports bound
if podman ps --format '{{.Ports}}' | grep -v "${WG_SERVER_IP}" | grep -q ":"; then
    echo "[fail] Unexpected ports bound"
    podman ps --format '{{.Names}}: {{.Ports}}'
    exit 1
else
    echo "[ok] No unexpected host ports bound"
fi

echo "All checks passed!"
