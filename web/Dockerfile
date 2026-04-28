FROM node:24-slim AS build-app
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm install --frozen-lockfile=false
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
EXPOSE 9080 9443