FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends x11vnc util-linux && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.8 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_BASE_PATH=/toronto-one
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN chmod 755 scripts/private-chromium.sh && pnpm check:ci
RUN mkdir -p /data && chmod 700 /data /app
ENV NODE_ENV=production PORT=8080 PRIVATE_DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.mjs"]
