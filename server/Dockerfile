FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json

RUN npm ci

COPY shared ./shared
COPY server ./server

RUN npm run build:server
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2567

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist

RUN mkdir -p /app/server/data

EXPOSE 2567

CMD ["npm", "run", "start:server"]
