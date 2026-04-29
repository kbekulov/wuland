import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_MESSAGE_LENGTH,
  CLASS_METADATA,
  DEFAULT_COSMETICS,
  DEFAULT_OFFLINE_PLAYER_TTL_HOURS,
  HOTBAR_SLOT_COUNT,
  PLAYER_MAX_HP,
  PLAYER_STARTING_MONEY,
  WULAND_WORLD,
  clampMapPosition,
  isAmbientNpcNetworkState,
  isChatMessage,
  isCharacterCosmetics,
  isDroppedItemNetworkState,
  isDirection,
  isGender,
  isMapId,
  isPlayerClass,
  isValidMapPosition,
  normalizeMapId,
  normalizeInventory,
  type AmbientNpcNetworkState,
  type ChatMessage,
  type Direction,
  type DroppedItemNetworkState,
  type PlayerNetworkState
} from "@wuland/shared";

const STORE_VERSION = 4;
const DEFAULT_STORE_PATH = fileURLToPath(
  new URL("../../data/wuland-players.json", import.meta.url)
);
const SAVE_DEBOUNCE_MS = 450;

interface PlayerStoreFile {
  version: number;
  players: PlayerNetworkState[];
  droppedItems?: DroppedItemNetworkState[];
  npcStates?: AmbientNpcNetworkState[];
  deletedPlayerIds?: string[];
  chatMessages?: ChatMessage[];
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
  private readonly npcStates = new Map<string, AmbientNpcNetworkState>();
  private readonly deletedPlayerIds = new Set<string>();
  private chatMessages: ChatMessage[] = [];
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
      this.droppedItems.clear();
      this.npcStates.clear();
      this.deletedPlayerIds.clear();
      this.chatMessages = [];
      this.loaded = true;
      await this.saveNow();
      console.log("[WULAND] Stored prototype data cleared on startup.");
      return;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (isStoreRecord(parsed)) {
        this.loadPlayers(parsed.players);
        this.loadDroppedItems(parsed.droppedItems);
        this.loadNpcStates(parsed.npcStates);
        this.loadDeletedPlayerIds(parsed.deletedPlayerIds);
        this.loadChatMessages(parsed.chatMessages);
      } else {
        console.warn("[WULAND] Player store root is malformed. Ignoring stored records.");
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

  allNpcStates(): AmbientNpcNetworkState[] {
    return [...this.npcStates.values()].map(cloneNpcState);
  }

  upsertNpcState(npc: AmbientNpcNetworkState, options: { immediate?: boolean } = {}): void {
    this.npcStates.set(npc.npcId, cloneNpcState(npc));

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

  removePlayer(playerId: string, options: { immediate?: boolean } = {}): void {
    this.players.delete(playerId);

    if (options.immediate) {
      void this.saveNow();
      return;
    }

    this.scheduleSave();
  }

  markPlayerDeleted(playerId: string, options: { immediate?: boolean } = {}): void {
    this.players.delete(playerId);
    this.deletedPlayerIds.add(playerId);

    if (options.immediate) {
      void this.saveNow();
      return;
    }

    this.scheduleSave();
  }

  isPlayerDeleted(playerId: string): boolean {
    return this.deletedPlayerIds.has(playerId);
  }

  allChatMessages(): ChatMessage[] {
    return this.chatMessages.map(cloneChatMessage);
  }

  appendChatMessage(message: ChatMessage, options: { immediate?: boolean } = {}): void {
    this.chatMessages = [...this.chatMessages, cloneChatMessage(message)].slice(-CHAT_HISTORY_LIMIT);

    if (options.immediate) {
      void this.saveNow();
      return;
    }

    this.scheduleSave();
  }

  private loadPlayers(value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      console.warn("[WULAND] Stored players list is malformed. Skipping players.");
      return;
    }

    value.forEach((rawPlayer, index) => {
      const player = isStoredPlayer(rawPlayer)
        ? rawPlayer
        : repairStoredPlayer(rawPlayer, index);

      if (!player) {
        console.warn(`[WULAND] Skipping malformed player record at index ${index}.`);
        return;
      }

      this.players.set(player.playerId, normalizeStoredPlayer(player));
    });
  }

  private loadDroppedItems(value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      console.warn("[WULAND] Stored dropped item list is malformed. Skipping dropped items.");
      return;
    }

    value.forEach((rawItem, index) => {
      if (!isDroppedItemNetworkState(rawItem)) {
        console.warn(`[WULAND] Skipping malformed dropped item record at index ${index}.`);
        return;
      }

      this.droppedItems.set(rawItem.droppedItemId, cloneDroppedItem(rawItem));
    });
  }

  private loadNpcStates(value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      console.warn("[WULAND] Stored NPC list is malformed. Skipping NPC state.");
      return;
    }

    value.forEach((rawNpc, index) => {
      if (!isAmbientNpcNetworkState(rawNpc)) {
        console.warn(`[WULAND] Skipping malformed NPC record at index ${index}.`);
        return;
      }

      this.npcStates.set(rawNpc.npcId, cloneNpcState(rawNpc));
    });
  }

  private loadDeletedPlayerIds(value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      console.warn("[WULAND] Stored deleted player list is malformed. Skipping deleted IDs.");
      return;
    }

    value.forEach((playerId, index) => {
      if (typeof playerId !== "string" || playerId.trim().length === 0) {
        console.warn(`[WULAND] Skipping malformed deleted player ID at index ${index}.`);
        return;
      }

      this.deletedPlayerIds.add(playerId);
    });
  }

  private loadChatMessages(value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      console.warn("[WULAND] Stored chat history is malformed. Skipping chat history.");
      return;
    }

    const messages: ChatMessage[] = [];

    value.forEach((rawMessage, index) => {
      if (!isChatMessage(rawMessage)) {
        console.warn(`[WULAND] Skipping malformed chat message at index ${index}.`);
        return;
      }

      messages.push(cloneChatMessage(rawMessage));
    });

    this.chatMessages = messages.slice(-CHAT_HISTORY_LIMIT);
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
      droppedItems: [...this.droppedItems.values()].map(cloneDroppedItem),
      npcStates: [...this.npcStates.values()].map(cloneNpcState),
      deletedPlayerIds: [...this.deletedPlayerIds.values()],
      chatMessages: this.chatMessages.map(cloneChatMessage)
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

const isStoreRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    (player.mapId === undefined || isMapId(player.mapId)) &&
    isValidMapPosition({ x: player.x, y: player.y }, normalizeMapId(player.mapId)) &&
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
    (player.money === undefined || typeof player.money === "number") &&
    typeof player.role === "string" &&
    typeof player.joinedAt === "string" &&
    typeof player.lastSeenAt === "string" &&
    typeof player.lastSavedAt === "string"
  );
};

const repairStoredPlayer = (value: unknown, index: number): PlayerNetworkState | null => {
  if (!isStoreRecord(value)) {
    return null;
  }

  const playerId = typeof value.playerId === "string" ? value.playerId.trim() : "";

  if (!playerId) {
    return null;
  }

  const now = new Date().toISOString();
  const className = isPlayerClass(value.className) ? value.className : "developer";
  const gender = isGender(value.gender) ? value.gender : "male";
  const storedCosmetics = {
    skinTone: value.skinTone,
    hairStyle: value.hairStyle,
    hairColor: value.hairColor,
    outfitColor: value.outfitColor,
    accessory: value.accessory,
    spriteVariant: value.spriteVariant
  };
  const cosmetics = isCharacterCosmetics(storedCosmetics)
    ? storedCosmetics
    : DEFAULT_COSMETICS;
  const mapId = isMapId(value.mapId) ? value.mapId : "overworld";
  const position = clampMapPosition(
    {
      x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : WULAND_WORLD.defaultSpawn.x,
      y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : WULAND_WORLD.defaultSpawn.y
    },
    mapId
  );

  console.warn(`[WULAND] Repaired stored player record at index ${index}.`);

  return {
    playerId,
    sessionId: "",
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 24) : "WULAND Hero",
    className,
    gender,
    skinTone: cosmetics.skinTone,
    hairStyle: cosmetics.hairStyle,
    hairColor: cosmetics.hairColor,
    outfitColor: cosmetics.outfitColor,
    accessory: cosmetics.accessory,
    spriteVariant: cosmetics.spriteVariant,
    mapId,
    x: position.x,
    y: position.y,
    direction: isDirection(value.direction) ? value.direction : "down",
    moving: false,
    online: false,
    sleeping: true,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shield: 0,
    defeated: false,
    respawnAt: 0,
    specialCooldownUntil: 0,
    activeBuffs: "",
    markedTargets: "",
    inventory: normalizeInventory(Array.isArray(value.inventory) ? value.inventory : undefined, playerId, {
      starterWhenEmpty: false
    }),
    selectedHotbarSlot:
      typeof value.selectedHotbarSlot === "number" &&
      Number.isInteger(value.selectedHotbarSlot) &&
      value.selectedHotbarSlot >= 0 &&
      value.selectedHotbarSlot < HOTBAR_SLOT_COUNT
        ? value.selectedHotbarSlot
        : 0,
    money: normalizeStoredMoney(value.money),
    role: CLASS_METADATA[className].futureRole,
    joinedAt: typeof value.joinedAt === "string" ? value.joinedAt : now,
    lastSeenAt: typeof value.lastSeenAt === "string" ? value.lastSeenAt : now,
    lastSavedAt: typeof value.lastSavedAt === "string" ? value.lastSavedAt : now
  };
};

const normalizeStoredPlayer = (player: PlayerNetworkState): PlayerNetworkState => {
  const mapId = normalizeMapId(player.mapId);
  const position = clampMapPosition({ x: player.x, y: player.y }, mapId);

  return {
    ...player,
    sessionId: "",
    mapId,
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
    inventory: normalizeInventory(player.inventory, player.playerId, {
      starterWhenEmpty: false
    }),
    selectedHotbarSlot:
      Number.isInteger(player.selectedHotbarSlot) &&
      player.selectedHotbarSlot >= 0 &&
      player.selectedHotbarSlot < HOTBAR_SLOT_COUNT
        ? player.selectedHotbarSlot
        : 0,
    money: normalizeStoredMoney(player.money)
  };
};

const clonePlayer = (player: PlayerNetworkState): PlayerNetworkState => ({
  ...player,
  inventory: normalizeInventory(player.inventory, player.playerId, {
    starterWhenEmpty: false
  }),
  money: normalizeStoredMoney(player.money)
});

const cloneDroppedItem = (item: DroppedItemNetworkState): DroppedItemNetworkState => ({
  ...item,
  mapId: normalizeMapId(item.mapId),
  ...clampDroppedItemPosition(item)
});

const cloneNpcState = (npc: AmbientNpcNetworkState): AmbientNpcNetworkState => {
  const mapId = normalizeMapId(npc.mapId);
  const position = clampMapPosition({ x: npc.x, y: npc.y }, mapId);
  const spawn = clampMapPosition({ x: npc.spawnX, y: npc.spawnY }, mapId);

  return {
    ...npc,
    mapId,
    x: position.x,
    y: position.y,
    spawnX: spawn.x,
    spawnY: spawn.y,
    direction: isDirection(npc.direction) ? npc.direction : "down",
    speechText: npc.speechText.slice(0, 140),
    speechUntil: Number.isFinite(npc.speechUntil) ? npc.speechUntil : 0
  };
};

const cloneChatMessage = (message: ChatMessage): ChatMessage => ({
  messageId: message.messageId,
  playerId: message.playerId,
  playerName: message.playerName.slice(0, 32),
  mapId: normalizeMapId(message.mapId),
  text: message.text.slice(0, CHAT_MAX_MESSAGE_LENGTH),
  sentAt: message.sentAt
});

const normalizeStoredMoney = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : PLAYER_STARTING_MONEY;

const clampDroppedItemPosition = (
  item: DroppedItemNetworkState
): { x: number; y: number } => clampMapPosition(item, normalizeMapId(item.mapId));

const isMissingFileError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "ENOENT";

export const defaultServerPosition = () => ({ ...WULAND_WORLD.defaultSpawn });
