FROM caddy:2-builder-alpine AS build-caddy
RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2

FROM caddy:2-alpine
COPY --from=build-caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY coraza.conf /etc/caddy/coraza.conf
EXPOSE 80 443 9080 9443