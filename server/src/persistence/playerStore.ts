import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_OFFLINE_PLAYER_TTL_HOURS,
  HOTBAR_SLOT_COUNT,
  PLAYER_MAX_HP,
  WULAND_WORLD,
  clampWorldPosition,
  isCharacterCosmetics,
  isDroppedItemNetworkState,
  isDirection,
  isGender,
  isPlayerClass,
  isValidWorldPosition,
  normalizeInventory,
  type Direction,
  type DroppedItemNetworkState,
  type PlayerNetworkState
} from "@wuland/shared";

const STORE_VERSION = 2;
const DEFAULT_STORE_PATH = fileURLToPath(
  new URL("../../data/wuland-players.json", import.meta.url)
);
const SAVE_DEBOUNCE_MS = 450;

interface PlayerStoreFile {
  version: number;
  players: PlayerNetworkState[];
  droppedItems?: DroppedItemNetworkState[];
}

export interface PlayerStoreOptions {
  filePath?: string;
  offlinePlayerTtlHours?: number;
  clearOnStart?: boolean;
}

export class PlayerStore {
  private readonly filePath: string;
  private readonly offlinePlayerTtlHours: number;
  private readonly clearOnStart: boolean;
  private readonly players = new Map<string, PlayerNetworkState>();
  private readonly droppedItems = new Map<string, DroppedItemNetworkState>();
  private saveTimer?: NodeJS.Timeout;
  private loaded = false;

  constructor(options: PlayerStoreOptions = {}) {
    this.filePath = options.filePath ?? DEFAULT_STORE_PATH;
    this.offlinePlayerTtlHours =
      options.offlinePlayerTtlHours ?? DEFAULT_OFFLINE_PLAYER_TTL_HOURS;
    this.clearOnStart = options.clearOnStart ?? false;
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });

    if (this.clearOnStart) {
      this.players.clear();
      this.loaded = true;
      await this.saveNow();
      console.log("[WULAND] Stored sleeping players cleared on startup.");
      return;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (isPlayerStoreFile(parsed)) {
        parsed.players.forEach((player) => {
          this.players.set(player.playerId, normalizeStoredPlayer(player));
        });
        parsed.droppedItems?.forEach((droppedItem) => {
          this.droppedItems.set(droppedItem.droppedItemId, cloneDroppedItem(droppedItem));
        });
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        console.warn("[WULAND] Could not load player store. Starting fresh.", error);
      }
    }

    this.removeExpiredOfflinePlayers();
    this.loaded = true;
  }

  allVisiblePlayers(): PlayerNetworkState[] {
    this.removeExpiredOfflinePlayers();
    return [...this.players.values()].map(clonePlayer);
  }

  get(playerId: string): PlayerNetworkState | undefined {
    const player = this.players.get(playerId);
    return player ? clonePlayer(player) : undefined;
  }

  allDroppedItems(): DroppedItemNetworkState[] {
    return [...this.droppedItems.values()].map(cloneDroppedItem);
  }

  upsertDroppedItem(item: DroppedItemNetworkState, options: { immediate?: boolean } = {}): void {
    this.droppedItems.set(item.droppedItemId, cloneDroppedItem(item));

    if (options.immediate) {
      void this.saveNow();
      return;
    }

    this.scheduleSave();
  }

  removeDroppedItem(droppedItemId: string, options: { immediate?: boolean } = {}): void {
    if (!this.droppedItems.delete(droppedItemId)) {
      return;
    }

    if (options.immediate) {
      void this.saveNow();
      return;
    }

    this.scheduleSave();
  }

  upsert(player: PlayerNetworkState, options: { immediate?: boolean } = {}): void {
    this.players.set(player.playerId, clonePlayer(player));

    if (options.immediate) {
      void this.saveNow();
      return;
    }

    this.scheduleSave();
  }

  removeExpiredOfflinePlayers(): number {
    const expiresBefore = Date.now() - this.offlinePlayerTtlHours * 60 * 60 * 1000;
    let removed = 0;

    for (const [playerId, player] of this.players) {
      if (player.online) {
        continue;
      }

      const lastSeenTime = Date.parse(player.lastSeenAt);

      if (Number.isFinite(lastSeenTime) && lastSeenTime < expiresBefore) {
        this.players.delete(playerId);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.scheduleSave();
    }

    return removed;
  }

  scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      void this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  async saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }

    await mkdir(dirname(this.filePath), { recursive: true });

    const payload: PlayerStoreFile = {
      version: STORE_VERSION,
      players: [...this.players.values()].map(clonePlayer),
      droppedItems: [...this.droppedItems.values()].map(cloneDroppedItem)
    };

    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

export const createPlayerStore = async (
  options: PlayerStoreOptions = {}
): Promise<PlayerStore> => {
  const store = new PlayerStore(options);
  await store.load();
  return store;
};

const isPlayerStoreFile = (value: unknown): value is PlayerStoreFile => {
  if (typeof value !== "object" || value === null || !("players" in value)) {
    return false;
  }

  const file = value as { players: unknown; droppedItems?: unknown };
  const droppedItems =
    !("droppedItems" in file) ||
    file.droppedItems === undefined ||
    (Array.isArray(file.droppedItems) && file.droppedItems.every(isDroppedItemNetworkState));

  return Array.isArray(file.players) && file.players.every(isStoredPlayer) && droppedItems;
};

const isStoredPlayer = (value: unknown): value is PlayerNetworkState => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const player = value as PlayerNetworkState;

  return (
    typeof player.playerId === "string" &&
    player.playerId.trim().length > 0 &&
    typeof player.sessionId === "string" &&
    typeof player.name === "string" &&
    player.name.trim().length > 0 &&
    isPlayerClass(player.className) &&
    isGender(player.gender) &&
    isCharacterCosmetics({
      skinTone: player.skinTone,
      hairStyle: player.hairStyle,
      hairColor: player.hairColor,
      outfitColor: player.outfitColor,
      accessory: player.accessory,
      spriteVariant: player.spriteVariant
    }) &&
    isValidWorldPosition({ x: player.x, y: player.y }) &&
    isDirection(player.direction as Direction) &&
    typeof player.moving === "boolean" &&
    typeof player.online === "boolean" &&
    typeof player.sleeping === "boolean" &&
    (player.hp === undefined || typeof player.hp === "number") &&
    (player.maxHp === undefined || typeof player.maxHp === "number") &&
    (player.shield === undefined || typeof player.shield === "number") &&
    (player.defeated === undefined || typeof player.defeated === "boolean") &&
    (player.respawnAt === undefined || typeof player.respawnAt === "number") &&
    (player.specialCooldownUntil === undefined || typeof player.specialCooldownUntil === "number") &&
    (player.activeBuffs === undefined || typeof player.activeBuffs === "string") &&
    (player.markedTargets === undefined || typeof player.markedTargets === "string") &&
    (player.inventory === undefined || Array.isArray(player.inventory)) &&
    (player.selectedHotbarSlot === undefined || typeof player.selectedHotbarSlot === "number") &&
    typeof player.role === "string" &&
    typeof player.joinedAt === "string" &&
    typeof player.lastSeenAt === "string" &&
    typeof player.lastSavedAt === "string"
  );
};

const normalizeStoredPlayer = (player: PlayerNetworkState): PlayerNetworkState => {
  const position = clampWorldPosition({ x: player.x, y: player.y });

  return {
    ...player,
    sessionId: "",
    x: position.x,
    y: position.y,
    direction: isDirection(player.direction) ? player.direction : "down",
    online: false,
    sleeping: true,
    moving: false,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shield: 0,
    defeated: false,
    respawnAt: 0,
    specialCooldownUntil: 0,
    activeBuffs: "",
    markedTargets: "",
    inventory: normalizeInventory(player.inventory, player.playerId),
    selectedHotbarSlot:
      Number.isInteger(player.selectedHotbarSlot) &&
      player.selectedHotbarSlot >= 0 &&
      player.selectedHotbarSlot < HOTBAR_SLOT_COUNT
        ? player.selectedHotbarSlot
        : 0
  };
};

const clonePlayer = (player: PlayerNetworkState): PlayerNetworkState => ({
  ...player,
  inventory: normalizeInventory(player.inventory, player.playerId)
});

const cloneDroppedItem = (item: DroppedItemNetworkState): DroppedItemNetworkState => ({
  ...item
});

const isMissingFileError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "ENOENT";

export const defaultServerPosition = () => ({ ...WULAND_WORLD.defaultSpawn });
