FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm install --frozen-lockfile=false
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm install --prod --frozen-lockfile=false
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 5181
CMD ["node", "dist/index.js"]
