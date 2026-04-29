import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_OFFLINE_PLAYER_TTL_HOURS } from "@wuland/shared";
import { createPlayerStore } from "./persistence/playerStore.js";
import { WulandRoom } from "./rooms/WulandRoom.js";

dotenv.config();

const PORT = Number.parseInt(process.env.PORT ?? "2567", 10);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const OFFLINE_PLAYER_TTL_HOURS = Number.parseFloat(
  process.env.OFFLINE_PLAYER_TTL_HOURS ?? String(DEFAULT_OFFLINE_PLAYER_TTL_HOURS)
);
const CLEAR_PLAYER_STORE_ON_START = parseBoolean(process.env.CLEAR_PLAYER_STORE_ON_START);
const ENEMY_AI_PAUSED = parseBoolean(process.env.ENEMY_AI_PAUSED);
const GOD_MODE_ENABLED = parseBoolean(
  process.env.GOD_MODE_ENABLED,
  NODE_ENV !== "production"
);
const GOD_MODE_CODE = process.env.GOD_MODE_CODE?.trim() || "";

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by WULAND server CORS.`));
    }
  })
);
app.use(express.json());
app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "wuland-server",
    environment: NODE_ENV,
    room: "wuland",
    offlinePlayerTtlHours: OFFLINE_PLAYER_TTL_HOURS,
    clearPlayerStoreOnStart: CLEAR_PLAYER_STORE_ON_START,
    enemyAiPaused: ENEMY_AI_PAUSED,
    godModeEnabled: GOD_MODE_ENABLED,
    godModeCodeRequired: GOD_MODE_CODE.length > 0
  });
});

const httpServer = createServer(app);
const playerStore = await createPlayerStore({
  offlinePlayerTtlHours: Number.isFinite(OFFLINE_PLAYER_TTL_HOURS)
    ? OFFLINE_PLAYER_TTL_HOURS
    : DEFAULT_OFFLINE_PLAYER_TTL_HOURS,
  clearOnStart: CLEAR_PLAYER_STORE_ON_START
});
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer
  })
});

gameServer.define("wuland", WulandRoom, {
  playerStore,
  offlinePlayerTtlHours: OFFLINE_PLAYER_TTL_HOURS,
  enemyAiPaused: ENEMY_AI_PAUSED,
  godModeEnabled: GOD_MODE_ENABLED,
  godModeCode: GOD_MODE_CODE
});
gameServer.onShutdown(async () => {
  await playerStore.saveNow();
});

await gameServer.listen(PORT);

console.log(`[WULAND] Colyseus server listening on ws://localhost:${PORT}`);
console.log(`[WULAND] Health endpoint listening on http://localhost:${PORT}/health`);

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return ["http://localhost:5173", "http://localhost:4173"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
