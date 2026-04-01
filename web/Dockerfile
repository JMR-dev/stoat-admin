FROM node:24-slim AS build-app
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm install --frozen-lockfile=false
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build

FROM caddy:builder AS build-caddy
RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2

FROM caddy:latest
COPY --from=build-caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=build-app /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY coraza.conf /etc/caddy/coraza.conf
EXPOSE 80
