import { Client, Room } from "colyseus";
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  CLASS_METADATA,
  CHAT_COOLDOWN_MS,
  CHAT_MAX_MESSAGE_LENGTH,
  DEFAULT_OFFLINE_PLAYER_TTL_HOURS,
  AMBIENT_NPC_MAX_HP,
  AMBIENT_NPC_RESPAWN_MS,
  ENEMY_DEFINITIONS,
  FLASHLIGHT_ITEM_ID,
  FLASHLIGHT_MAX_CHARGE_MS,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  LIGHT_STICK_DURATION_MS,
  LIGHT_STICK_ITEM_ID,
  NETWORK_TICK_RATE,
  PLAYER_MAX_HP,
  PLAYER_MOVE_SPEED,
  PLAYER_RESPAWN_MS,
  PLAYER_STARTING_MONEY,
  WULAND_ENEMY_SPAWNS,
  WULAND_AMBIENT_NPCS,
  WULAND_MAP_IDS,
  WULAND_MAP_ID,
  WULAND_MERCHANT,
  WULAND_MERCHANT_STOCK,
  WULAND_PROTOCOL_VERSION,
  WULAND_WORLD,
  applyServerMovement,
  applyServerVectorMovement,
  clampMapPosition,
  clampWorldPosition,
  collidesWithWorld,
  createItemInstanceId,
  defaultItemChargeMs,
  getMapCollisionRects,
  getMapDefinition,
  isBuyItemRequest,
  isCakeItemDefinitionId,
  isCaveMapId,
  isChatRequest,
  isClearChatRequest,
  isCombatRequest,
  isDeleteDroppedItemRequest,
  isDeletePlayerRequest,
  isGiftItemRequest,
  isHotbarSelectRequest,
  isInventoryMoveRequest,
  isInventorySlotRequest,
  isMoveTargetRequest,
  isMovementInput,
  isPickupItemRequest,
  isPetNpcRequest,
  isPetNpcType,
  isPortalTransitionRequest,
  isValidLocalProgress,
  isValidMapPosition,
  isValidPlayerProfile,
  normalizeMapId,
  normalizeInventory,
  portalAtPosition,
  portalsForMap,
  type AmbientNpcDefinition,
  type AmbientNpcNetworkState,
  type AmbientNpcType,
  type ChatMessage,
  type ClearChatRequest,
  type CombatEvent,
  type CombatRequest,
  type DeleteDroppedItemRequest,
  type DeletePlayerRequest,
  type Direction,
  type DroppedItemNetworkState,
  type EnemyNetworkState,
  type EnemyType,
  type InventorySlotState,
  type ItemDefinition,
  type ItemDefinitionId,
  type LocalProgress,
  type MovementInput,
  type MoveTargetRequest,
  type PetNpcRequest,
  type PlayerNetworkState,
  type PlayerProfile,
  type PortalDefinition,
  type ShopResultEvent,
  type SpeechBubbleEvent,
  type WorldPosition,
  type WulandMapId,
  type WulandJoinOptions
} from "@wuland/shared";
import { PlayerStore } from "../persistence/playerStore.js";

const ROOM_ID = "wuland-village";
const ZERO_INPUT: MovementInput = {
  left: false,
  right: false,
  up: false,
  down: false
};
const SAVE_POSITION_DELTA_SQUARED = 16;
const SAVE_INTERVAL_MS = 5000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const BASIC_FACING_DOT = Math.cos((85 * Math.PI) / 180);
const WEAPON_ATTACK_COOLDOWN_MS = 420;
const PICKUP_RANGE = 66;
const GIFT_RANGE = 78;
const PET_RANGE = 76;
const PORTAL_INTERACT_RANGE = 84;
const DROP_OFFSET = 34;
const NPC_TARGET_REACHED_DISTANCE = 12;
const NPC_TARGET_REFRESH_MS = 11000;
const NPC_SAVE_INTERVAL_MS = 6000;
const NPC_SPEECH_MIN_MS = 7000;
const NPC_SPEECH_MAX_MS = 13500;
const NPC_SPEECH_DURATION_MS = 3600;
const NPC_MAP_CHANGE_CHANCE = 0.42;
const PET_FOLLOW_DISTANCE = 58;
const PET_FOLLOW_TELEPORT_DISTANCE = 620;
const PET_RECRUIT_MAX_CAKES = 10;
const PET_RECRUIT_ONE_CAKE_CHANCE = 0.02;
const PET_RECRUIT_MAX_CHANCE = 0.9;
const PET_RETALIATION_RANGE = 220;
const PET_RETALIATION_BITE_RANGE = 38;
const PET_RETALIATION_BITE_COUNT = 3;
const PET_RETALIATION_COOLDOWN_MS = 780;
const PET_DAMAGE_RATIO = 0.03;
const ENEMY_WANDER_TARGET_REACHED_DISTANCE = 24;
const ENEMY_WANDER_TARGET_REFRESH_MS = 12000;
const ENEMY_WANDER_STUCK_REFRESH_MS = 1200;
const ZOMBIE_PURSUIT_RANGE = 680;
const PET_REACTION_DURATION_MS = 2600;
const FLASHLIGHT_SAVE_INTERVAL_MS = 5000;
const FORCE_DELETED_CLOSE_CODE = 4008;
const PURCHASE_LOG_PREFIX = "[WULAND purchase]";

type NpcTravelTarget = WorldPosition & { mapId: WulandMapId };
type PlayerRespawnOverride = { mapId: WulandMapId; position: WorldPosition };
type PetRetaliationTarget =
  | { kind: "enemy"; targetId: string; bitesRemaining: number; nextBiteAt: number }
  | { kind: "player"; targetId: string; bitesRemaining: number; nextBiteAt: number }
  | { kind: "npc"; targetId: string; bitesRemaining: number; nextBiteAt: number };
type WeaponTarget =
  | { kind: "enemy"; entity: WulandEnemySchema }
  | { kind: "npc"; entity: WulandNpcSchema }
  | { kind: "player"; entity: WulandPlayerSchema };

export class WulandInventorySlotSchema extends Schema {
  @type("number") slotIndex = 0;
  @type("string") itemDefinitionId = "";
  @type("string") itemInstanceId = "";
  @type("number") quantity = 0;
  @type("number") chargeRemainingMs = 0;
}

export class WulandPlayerSchema extends Schema {
  @type("string") playerId = "";
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("string") className = "";
  @type("string") gender = "";
  @type("string") skinTone = "";
  @type("string") hairStyle = "";
  @type("string") hairColor = "";
  @type("string") outfitColor = "";
  @type("string") accessory = "";
  @type("string") spriteVariant = "";
  @type("string") mapId: WulandMapId = WULAND_MAP_ID;
  @type("number") x = WULAND_WORLD.defaultSpawn.x;
  @type("number") y = WULAND_WORLD.defaultSpawn.y;
  @type("string") direction: Direction = "down";
  @type("boolean") moving = false;
  @type("boolean") online = false;
  @type("boolean") sleeping = true;
  @type("number") hp = PLAYER_MAX_HP;
  @type("number") maxHp = PLAYER_MAX_HP;
  @type("number") shield = 0;
  @type("boolean") defeated = false;
  @type("number") respawnAt = 0;
  @type("number") specialCooldownUntil = 0;
  @type("string") activeBuffs = "";
  @type("string") markedTargets = "";
  @type([WulandInventorySlotSchema]) inventory = new ArraySchema<WulandInventorySlotSchema>();
  @type("number") selectedHotbarSlot = 0;
  @type("number") money = PLAYER_STARTING_MONEY;
  @type("string") role = "";
  @type("string") joinedAt = "";
  @type("string") lastSeenAt = "";
  @type("string") lastSavedAt = "";
}

export class WulandEnemySchema extends Schema {
  @type("string") enemyId = "";
  @type("string") type = "";
  @type("string") name = "";
  @type("string") mapId: WulandMapId = WULAND_MAP_ID;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") spawnX = 0;
  @type("number") spawnY = 0;
  @type("number") hp = 1;
  @type("number") maxHp = 1;
  @type("boolean") alive = true;
  @type("string") targetPlayerId = "";
  @type("string") markedBy = "";
  @type("number") markedUntil = 0;
  @type("number") weakenedUntil = 0;
  @type("number") respawnAt = 0;
}

export class WulandDroppedItemSchema extends Schema {
  @type("string") droppedItemId = "";
  @type("string") itemDefinitionId = "";
  @type("string") itemInstanceId = "";
  @type("number") quantity = 1;
  @type("number") chargeRemainingMs = 0;
  @type("string") mapId: WulandMapId = WULAND_MAP_ID;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") droppedByPlayerId = "";
  @type("string") droppedAt = "";
  @type("number") expiresAt = 0;
}

export class WulandNpcSchema extends Schema {
  @type("string") npcId = "";
  @type("string") type: AmbientNpcType = "intern";
  @type("string") displayName = "";
  @type("string") ownerPlayerId = "";
  @type("string") mapId: WulandMapId = WULAND_MAP_ID;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") spawnX = 0;
  @type("number") spawnY = 0;
  @type("number") wanderRadius = 0;
  @type("number") hp = AMBIENT_NPC_MAX_HP;
  @type("number") maxHp = AMBIENT_NPC_MAX_HP;
  @type("boolean") defeated = false;
  @type("number") respawnAt = 0;
  @type("string") direction: Direction = "down";
  @type("boolean") moving = false;
  @type("string") speechText = "";
  @type("number") speechUntil = 0;
}

export class WulandRoomState extends Schema {
  @type("number") serverProtocolVersion = WULAND_PROTOCOL_VERSION;
  @type({ map: WulandPlayerSchema }) players = new MapSchema<WulandPlayerSchema>();
  @type({ map: WulandEnemySchema }) enemies = new MapSchema<WulandEnemySchema>();
  @type({ map: WulandDroppedItemSchema }) droppedItems = new MapSchema<WulandDroppedItemSchema>();
  @type({ map: WulandNpcSchema }) npcs = new MapSchema<WulandNpcSchema>();
  @type("number") totalPlayers = 0;
  @type("number") onlinePlayers = 0;
  @type("number") sleepingPlayers = 0;
  @type("number") totalEnemies = 0;
  @type("number") aliveEnemies = 0;
  @type("number") totalDroppedItems = 0;
  @type("boolean") godModeEnabled = false;
  @type("boolean") godModeCodeRequired = false;
}

interface WulandRoomOptions {
  playerStore: PlayerStore;
  offlinePlayerTtlHours?: number;
  enemyAiPaused?: boolean;
  godModeEnabled?: boolean;
  godModeCode?: string;
}

export class WulandRoom extends Room<WulandRoomState> {
  private playerStore!: PlayerStore;
  private readonly inputs = new Map<string, MovementInput>();
  private readonly moveTargets = new Map<string, MoveTargetRequest>();
  private readonly sessionToPlayerId = new Map<string, string>();
  private readonly lastPersistedPosition = new Map<string, { x: number; y: number; at: number }>();
  private readonly lastBasicAttack = new Map<string, number>();
  private readonly enemyContactTimes = new Map<string, number>();
  private readonly enemyWanderTargets = new Map<string, WorldPosition>();
  private readonly enemyWanderTargetSetAt = new Map<string, number>();
  private readonly playerRespawnOverrides = new Map<string, PlayerRespawnOverride>();
  private readonly npcTargets = new Map<string, NpcTravelTarget>();
  private readonly npcNextSpeechAt = new Map<string, number>();
  private readonly npcLastSavedAt = new Map<string, number>();
  private readonly petRetaliations = new Map<string, PetRetaliationTarget>();
  private readonly lastFlashlightSavedAt = new Map<string, number>();
  private readonly lastChatAt = new Map<string, number>();
  private enemyAiPaused = false;
  private godModeEnabled = false;
  private godModeCode = "";
  private combatEventCounter = 0;
  private chatEventCounter = 0;
  private speechEventCounter = 0;

  onCreate(options: WulandRoomOptions): void {
    this.roomId = ROOM_ID;
    this.maxClients = 100;
    this.autoDispose = false;
    this.patchRate = 1000 / NETWORK_TICK_RATE;
    this.playerStore = options.playerStore;
    this.enemyAiPaused = options.enemyAiPaused ?? false;
    this.godModeEnabled = options.godModeEnabled ?? false;
    this.godModeCode = options.godModeCode?.trim() ?? "";

    this.setState(new WulandRoomState());
    this.state.godModeEnabled = this.godModeEnabled;
    this.state.godModeCodeRequired = this.godModeCode.length > 0;
    this.playerStore.allVisiblePlayers().forEach((player) => {
      this.state.players.set(player.playerId, schemaFromRecord(player));
      this.lastPersistedPosition.set(player.playerId, {
        x: player.x,
        y: player.y,
        at: Date.now()
      });
    });
    this.playerStore.allDroppedItems().forEach((item) => {
      if (isExpiredLightStickRecord(item, Date.now())) {
        this.playerStore.removeDroppedItem(item.droppedItemId);
        return;
      }

      this.state.droppedItems.set(item.droppedItemId, droppedItemFromRecord(item));
    });
    this.spawnInitialNpcs();
    this.spawnInitialEnemies();
    this.updateCounts();

    this.onMessage("movement", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isMovementInput(message)) {
        return;
      }

      this.inputs.set(playerId, message);
    });

    this.onMessage("moveTarget", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isMoveTargetRequest(message)) {
        return;
      }

      const player = this.state.players.get(playerId);
      const mapId = normalizeMapId(player?.mapId);
      this.moveTargets.set(playerId, clampMapPosition(message, mapId));
    });

    this.onMessage("clearMoveTarget", (client) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (playerId) {
        this.moveTargets.delete(playerId);
      }
    });

    this.onMessage("usePortal", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isPortalTransitionRequest(message)) {
        return;
      }

      this.usePortal(
        playerId,
        (message as { portalId?: string } | null | undefined)?.portalId
      );
    });

    this.onMessage("attack", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isCombatRequest(message)) {
        return;
      }

      this.handleWeaponAttack(playerId, message);
    });

    this.onMessage("basicAttack", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isCombatRequest(message)) {
        return;
      }

      this.handleWeaponAttack(playerId, message);
    });

    this.onMessage("selectHotbarSlot", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isHotbarSelectRequest(message)) {
        return;
      }

      this.selectHotbarSlot(playerId, message.slotIndex);
    });

    this.onMessage("moveInventoryItem", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isInventoryMoveRequest(message)) {
        return;
      }

      this.moveInventoryItem(playerId, message.fromSlotIndex, message.toSlotIndex);
    });

    this.onMessage("discardInventoryItem", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isInventorySlotRequest(message)) {
        return;
      }

      this.discardInventoryItem(playerId, message.slotIndex);
    });

    this.onMessage("useSelectedItem", (client) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (playerId) {
        this.useSelectedItem(playerId);
      }
    });

    this.onMessage("pickupItem", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isPickupItemRequest(message)) {
        return;
      }

      this.pickupItem(playerId, (message as { droppedItemId?: string } | null | undefined)?.droppedItemId);
    });

    const handleBuyItemMessage = (client: Client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isBuyItemRequest(message)) {
        client.send("shopResult", {
          ok: false,
          message: "Invalid purchase request"
        } satisfies ShopResultEvent);
        return;
      }

      client.send("shopResult", this.buyItem(playerId, message.itemDefinitionId));
    };

    this.onMessage("buyItem", handleBuyItemMessage);
    this.onMessage("purchaseItem", handleBuyItemMessage);
    this.onMessage("buyMerchantItem", handleBuyItemMessage);
    this.onMessage("purchaseMerchantItem", handleBuyItemMessage);

    this.onMessage("giftSelectedItem", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isGiftItemRequest(message)) {
        return;
      }

      this.giftSelectedItem(
        playerId,
        (message as { targetPlayerId?: string } | null | undefined)?.targetPlayerId
      );
    });

    this.onMessage("petNpc", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isPetNpcRequest(message)) {
        return;
      }

      this.petNpc(
        playerId,
        (message as PetNpcRequest | null | undefined)?.npcId
      );
    });

    this.onMessage("chat", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isChatRequest(message)) {
        return;
      }

      this.handleChat(playerId, message.text);
    });

    this.onMessage("requestChatHistory", (client) => {
      client.send("chatHistory", this.playerStore.allChatMessages());
    });

    this.onMessage("deleteDroppedItem", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isDeleteDroppedItemRequest(message)) {
        return;
      }

      this.deleteDroppedItem(playerId, message);
    });

    this.onMessage("deletePlayer", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isDeletePlayerRequest(message)) {
        return;
      }

      this.deletePlayer(playerId, message);
    });

    this.onMessage("clearChat", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isClearChatRequest(message)) {
        return;
      }

      this.clearChat(playerId, message);
    });

    this.setSimulationInterval(
      (deltaMs) => this.updateSimulation(deltaMs),
      1000 / NETWORK_TICK_RATE
    );

    this.clock.setInterval(() => this.cleanupExpiredOfflinePlayers(), CLEANUP_INTERVAL_MS);
  }

  onAuth(_client: Client, options: unknown): WulandJoinOptions {
    const joinOptions = validateJoinOptions(options);
    const existing = this.state.players.get(joinOptions.profile.playerId);

    if (this.playerStore.isPlayerDeleted(joinOptions.profile.playerId)) {
      throw new Error("PLAYER_DELETED: This WULAND character was deleted. Create a new one.");
    }

    if (existing?.online) {
      throw new Error("This WULAND character is already connected in another tab.");
    }

    return joinOptions;
  }

  onJoin(client: Client, rawOptions: WulandJoinOptions, auth?: WulandJoinOptions): void {
    const options = auth ?? validateJoinOptions(rawOptions);
    const now = new Date().toISOString();
    const existing = this.state.players.get(options.profile.playerId);
    const stored = this.playerStore.get(options.profile.playerId);
    const storedMapId = normalizeMapId(stored?.mapId);
    const existingMapId = normalizeMapId(existing?.mapId);
    const localMapId = normalizeMapId(options.localProgress?.currentMapId);
    const mapId =
      (stored && isValidMapPosition({ x: stored.x, y: stored.y }, storedMapId)
        ? storedMapId
        : null) ??
      (existing && isValidMapPosition({ x: existing.x, y: existing.y }, existingMapId)
        ? existingMapId
        : null) ??
      (options.localProgress &&
      isValidMapPosition(options.localProgress.lastPosition, localMapId)
        ? localMapId
        : null) ??
      WULAND_MAP_ID;
    const preferredPosition =
      (stored && mapId === storedMapId && isValidMapPosition({ x: stored.x, y: stored.y }, mapId)
        ? { x: stored.x, y: stored.y }
        : null) ??
      (existing && mapId === existingMapId && isValidMapPosition({ x: existing.x, y: existing.y }, mapId)
        ? { x: existing.x, y: existing.y }
        : null) ??
      (options.localProgress &&
      mapId === localMapId &&
      isValidMapPosition(options.localProgress.lastPosition, mapId)
        ? options.localProgress.lastPosition
        : null) ??
      getMapDefinition(mapId).defaultSpawn;
    const position = clampMapPosition(preferredPosition, mapId);
    const player = existing ?? new WulandPlayerSchema();
    const existingRecord = existing ? recordFromSchema(existing) : null;
    const inventory = stored?.inventory ?? existingRecord?.inventory;
    const shouldGiveStarterInventory = !stored && !existingRecord;

    applyProfileToSchema(player, options.profile);
    resetPlayerCombat(player);
    applyInventoryToSchema(player, inventory, options.profile.playerId, {
      starterWhenEmpty: shouldGiveStarterInventory
    });
    player.selectedHotbarSlot = normalizeHotbarSlot(
      stored?.selectedHotbarSlot ?? existingRecord?.selectedHotbarSlot ?? player.selectedHotbarSlot
    );
    player.money = normalizeMoney(stored?.money ?? existingRecord?.money);
    player.sessionId = client.sessionId;
    player.mapId = mapId;
    player.x = position.x;
    player.y = position.y;
    player.direction = existing?.direction ?? stored?.direction ?? "down";
    player.moving = false;
    player.online = true;
    player.sleeping = false;
    player.joinedAt = existing?.joinedAt || stored?.joinedAt || now;
    player.lastSeenAt = now;
    player.lastSavedAt = now;

    this.state.players.set(options.profile.playerId, player);
    this.sessionToPlayerId.set(client.sessionId, options.profile.playerId);
    this.inputs.set(options.profile.playerId, { ...ZERO_INPUT });
    this.moveTargets.delete(options.profile.playerId);
    this.updateCounts();
    this.persistPlayer(player, true);
    client.send("chatHistory", this.playerStore.allChatMessages());
  }

  onLeave(client: Client): void {
    const playerId = this.sessionToPlayerId.get(client.sessionId);

    if (!playerId) {
      return;
    }

    const player = this.state.players.get(playerId);
    const now = new Date().toISOString();

    if (player) {
      player.sessionId = "";
      player.online = false;
      player.sleeping = true;
      player.moving = false;
      player.defeated = false;
      player.respawnAt = 0;
      player.shield = 0;
      player.activeBuffs = "";
      player.markedTargets = "";
      player.lastSeenAt = now;
      player.lastSavedAt = now;
      this.persistPlayer(player, true);
    }

    this.sessionToPlayerId.delete(client.sessionId);
    this.inputs.delete(playerId);
    this.moveTargets.delete(playerId);
    this.lastBasicAttack.delete(playerId);
    this.playerRespawnOverrides.delete(playerId);
    this.lastFlashlightSavedAt.delete(playerId);
    this.updateCounts();
  }

  async onDispose(): Promise<void> {
    await this.playerStore.saveNow();
  }

  private updateSimulation(deltaMs: number): void {
    const now = Date.now();
    let anyCountChange = false;

    this.state.players.forEach((player) => {
      if (player.defeated) {
        player.moving = false;

        if (player.respawnAt > 0 && now >= player.respawnAt) {
          const respawnOverride = this.playerRespawnOverrides.get(player.playerId);
          const mapId = respawnOverride?.mapId ?? normalizeMapId(player.mapId);
          const respawn = respawnOverride?.position ?? randomWalkablePosition(mapId);
          this.playerRespawnOverrides.delete(player.playerId);
          player.mapId = mapId;
          player.x = respawn.x;
          player.y = respawn.y;
          player.hp = player.maxHp;
          player.shield = 0;
          player.defeated = false;
          player.respawnAt = 0;
          this.respawnOwnedPetBesidePlayer(player, now);
          this.persistPlayer(player);
          this.broadcastCombatEvent("respawn", player.playerId, player.playerId, player.x, player.y, 0, "respawn", "#91f2bd");
        }

        return;
      }

      if (!player.online) {
        return;
      }

      const input = this.inputs.get(player.playerId) ?? ZERO_INPUT;
      const result = this.applyPlayerMovement(player, input, deltaMs);
      const timestamp = new Date().toISOString();

      player.x = result.position.x;
      player.y = result.position.y;
      player.direction = result.moving ? result.direction : player.direction;
      player.moving = result.moving;
      player.lastSeenAt = timestamp;

      this.transitionThroughPortalIfNeeded(player);
      this.updateSelectedFlashlight(player, deltaMs, now);
      this.persistIfNeeded(player);
      anyCountChange = true;
    });

    this.updateDroppedItems(now);
    this.updateEnemies(deltaMs, now);
    this.updateNpcs(deltaMs, now);

    if (anyCountChange) {
      this.updateCounts();
    }
  }

  private applyPlayerMovement(
    player: WulandPlayerSchema,
    input: MovementInput,
    deltaMs: number
  ): { position: WorldPosition; moving: boolean; direction: Direction } {
    const hasDirectInput = input.left || input.right || input.up || input.down;
    const mapId = normalizeMapId(player.mapId);
    const map = getMapDefinition(mapId);
    const collisions = getMapCollisionRects(mapId);

    if (hasDirectInput) {
      this.moveTargets.delete(player.playerId);
      return applyServerMovement(
        { x: player.x, y: player.y },
        input,
        deltaMs,
        collisions,
        map
      );
    }

    const target = this.moveTargets.get(player.playerId);

    if (!target) {
      return applyServerMovement(
        { x: player.x, y: player.y },
        ZERO_INPUT,
        deltaMs,
        collisions,
        map
      );
    }

    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distanceToTarget = Math.hypot(dx, dy);

    if (distanceToTarget <= 12) {
      this.moveTargets.delete(player.playerId);
      return {
        position: { x: player.x, y: player.y },
        moving: false,
        direction: player.direction
      };
    }

    const vector = {
      x: dx / distanceToTarget,
      y: dy / distanceToTarget
    };
    // This is intentionally direct target steering for Phase 4. A later phase can
    // replace this with A* over a navigation grid while keeping the same message.
    const result = applyServerVectorMovement(
      { x: player.x, y: player.y },
      vector,
      Math.min(deltaMs, (distanceToTarget / PLAYER_MOVE_SPEED) * 1000),
      player.direction,
      collisions,
      map
    );
    const movedDistance = distance({ x: player.x, y: player.y }, result.position);

    if (result.blocked && movedDistance < 1) {
      this.moveTargets.delete(player.playerId);
      return {
        position: { x: player.x, y: player.y },
        moving: false,
        direction: result.direction
      };
    }

    return {
      position: result.position,
      moving: result.moving,
      direction: result.direction
    };
  }

  private updateSelectedFlashlight(player: WulandPlayerSchema, deltaMs: number, now: number): void {
    if (!canFight(player) || !isCaveMapId(normalizeMapId(player.mapId))) {
      return;
    }

    const slot = getInventorySlot(player, player.selectedHotbarSlot);

    if (!slot || slot.itemDefinitionId !== FLASHLIGHT_ITEM_ID || slot.quantity <= 0) {
      return;
    }

    const currentCharge = slot.chargeRemainingMs > 0
      ? slot.chargeRemainingMs
      : FLASHLIGHT_MAX_CHARGE_MS;
    slot.chargeRemainingMs = Math.max(0, currentCharge - Math.max(1, Math.ceil(deltaMs)));

    if (slot.chargeRemainingMs <= 0) {
      clearSlot(slot);
      this.lastFlashlightSavedAt.delete(player.playerId);
      this.persistPlayer(player);
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Flashlight battery is empty", "#ffd8a8");
      return;
    }

    const previousSave = this.lastFlashlightSavedAt.get(player.playerId) ?? 0;

    if (now - previousSave >= FLASHLIGHT_SAVE_INTERVAL_MS) {
      this.lastFlashlightSavedAt.set(player.playerId, now);
      this.persistPlayer(player);
    }
  }

  private updateDroppedItems(now: number): void {
    const expiredIds: string[] = [];

    this.state.droppedItems.forEach((item) => {
      if (
        item.itemDefinitionId === LIGHT_STICK_ITEM_ID &&
        item.expiresAt > 0 &&
        now >= item.expiresAt
      ) {
        expiredIds.push(item.droppedItemId);
      }
    });

    expiredIds.forEach((droppedItemId) => {
      const item = this.state.droppedItems.get(droppedItemId);

      if (!item) {
        return;
      }

      const mapId = normalizeMapId(item.mapId);
      const x = item.x;
      const y = item.y;
      this.state.droppedItems.delete(droppedItemId);
      this.playerStore.removeDroppedItem(droppedItemId);
      this.broadcastMapEvent("delete", LIGHT_STICK_ITEM_ID, droppedItemId, mapId, x, y, "Light stick faded", "#ffd8a8");
    });

    if (expiredIds.length > 0) {
      this.updateCounts();
    }
  }

  private spawnInitialEnemies(): void {
    WULAND_ENEMY_SPAWNS.forEach((spawn) => {
      this.state.enemies.set(spawn.id, enemyFromSpawn(spawn.id, spawn.type, spawn.x, spawn.y, spawn.mapId));
    });
  }

  private spawnInitialNpcs(): void {
    const stored = new Map(this.playerStore.allNpcStates().map((npc) => [npc.npcId, npc]));
    const now = Date.now();

    WULAND_AMBIENT_NPCS.forEach((definition) => {
      const record = stored.get(definition.npcId);
      const npc = npcFromDefinition(definition, record);
      this.state.npcs.set(npc.npcId, npc);
      this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
      this.npcNextSpeechAt.set(npc.npcId, now + randomBetween(NPC_SPEECH_MIN_MS, NPC_SPEECH_MAX_MS));
      this.npcLastSavedAt.set(npc.npcId, now);
    });
  }

  private updateNpcs(deltaMs: number, now: number): void {
    this.state.npcs.forEach((npc) => {
      const definition = npcDefinitionFor(npc.npcId);

      if (!definition) {
        return;
      }

      if (isCaveMapId(normalizeMapId(npc.mapId)) && !npc.ownerPlayerId) {
        const mapId = randomAmbientNpcMapId(normalizeMapId(npc.mapId));
        const arrival = randomWalkablePosition(mapId);
        npc.mapId = mapId;
        npc.x = arrival.x;
        npc.y = arrival.y;
        npc.moving = false;
        npc.speechText = "";
        npc.speechUntil = 0;
        this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
        this.npcLastSavedAt.set(`${npc.npcId}:target`, now);
        this.persistNpcIfNeeded(npc, now, true);
        return;
      }

      if (npc.defeated) {
        npc.moving = false;
        npc.speechText = "";
        npc.speechUntil = 0;

        if (npc.respawnAt > 0 && now >= npc.respawnAt) {
          this.respawnNpc(npc);
          this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
          this.npcLastSavedAt.set(`${npc.npcId}:target`, now);
          this.persistNpcIfNeeded(npc, now, true);
        }

        return;
      }

      if (npc.speechText && now > npc.speechUntil) {
        npc.speechText = "";
        npc.speechUntil = 0;
      }

      if (now >= (this.npcNextSpeechAt.get(npc.npcId) ?? 0)) {
        npc.speechText = randomChoice(definition.speechLines);
        npc.speechUntil = now + NPC_SPEECH_DURATION_MS;
        this.npcNextSpeechAt.set(
          npc.npcId,
          now + randomBetween(NPC_SPEECH_MIN_MS, NPC_SPEECH_MAX_MS)
        );
        this.broadcastSpeechBubble({
          sourceType: "npc",
          sourceId: npc.npcId,
          mapId: normalizeMapId(npc.mapId),
          text: npc.speechText
        });
      }

      if (this.updateRecruitedPet(npc, definition, deltaMs, now)) {
        return;
      }

      if (isRestingPet(npc)) {
        npc.moving = false;
        this.persistNpcIfNeeded(npc, now);
        return;
      }

      let target = this.npcTargets.get(npc.npcId);
      const targetAge = now - (this.npcLastSavedAt.get(`${npc.npcId}:target`) ?? 0);

      if (!target || distance(npc, target) <= NPC_TARGET_REACHED_DISTANCE || targetAge > NPC_TARGET_REFRESH_MS) {
        target = randomNpcTarget(npc);
        this.npcTargets.set(npc.npcId, target);
        this.npcLastSavedAt.set(`${npc.npcId}:target`, now);
      }

      if (target.mapId !== normalizeMapId(npc.mapId)) {
        const arrival = randomWalkablePosition(target.mapId);
        npc.mapId = target.mapId;
        npc.x = arrival.x;
        npc.y = arrival.y;
        npc.moving = false;
        npc.speechText = "";
        npc.speechUntil = 0;
      }

      this.moveNpcToward(npc, target, definition.speed, deltaMs);
      this.persistNpcIfNeeded(npc, now);
    });
  }

  private moveNpcToward(
    npc: WulandNpcSchema,
    target: WorldPosition,
    speed: number,
    deltaMs: number
  ): void {
    const dx = target.x - npc.x;
    const dy = target.y - npc.y;
    const length = Math.hypot(dx, dy);

    if (length < NPC_TARGET_REACHED_DISTANCE) {
      npc.moving = false;
      return;
    }

    const vector = {
      x: dx / length,
      y: dy / length
    };
    const mapId = normalizeMapId(npc.mapId);
    const result = applyServerVectorMovement(
      { x: npc.x, y: npc.y },
      vector,
      deltaMs * (speed / PLAYER_MOVE_SPEED),
      npc.direction,
      getMapCollisionRects(mapId),
      getMapDefinition(mapId)
    );

    if (result.blocked) {
      const definition = npcDefinitionFor(npc.npcId);

      if (definition) {
        this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
        this.npcLastSavedAt.set(`${npc.npcId}:target`, Date.now());
      }
    }

    npc.x = result.position.x;
    npc.y = result.position.y;
    npc.direction = result.direction;
    npc.moving = result.moving;
  }

  private updateRecruitedPet(
    npc: WulandNpcSchema,
    definition: AmbientNpcDefinition,
    deltaMs: number,
    now: number
  ): boolean {
    if (!isPetNpcType(npc.type) || !npc.ownerPlayerId) {
      return false;
    }

    const owner = this.state.players.get(npc.ownerPlayerId);

    if (!owner || !owner.online || owner.sleeping || owner.defeated) {
      npc.moving = false;
      this.petRetaliations.delete(npc.npcId);
      this.persistNpcIfNeeded(npc, now);
      return true;
    }

    if (normalizeMapId(npc.mapId) !== normalizeMapId(owner.mapId)) {
      const position = petFollowPosition(owner);
      npc.mapId = normalizeMapId(owner.mapId);
      npc.x = position.x;
      npc.y = position.y;
      npc.moving = false;
      this.npcTargets.delete(npc.npcId);
      this.persistNpcIfNeeded(npc, now, true);
      return true;
    }

    if (this.updatePetRetaliation(npc, definition, owner, deltaMs, now)) {
      this.persistNpcIfNeeded(npc, now);
      return true;
    }

    const followDistance = distance(npc, owner);

    if (followDistance > PET_FOLLOW_TELEPORT_DISTANCE) {
      const position = petFollowPosition(owner);
      npc.x = position.x;
      npc.y = position.y;
      npc.moving = false;
      this.persistNpcIfNeeded(npc, now, true);
      return true;
    }

    if (followDistance > PET_FOLLOW_DISTANCE) {
      this.moveNpcToward(npc, owner, definition.speed * 1.24, deltaMs);
    } else {
      npc.moving = false;
    }

    this.persistNpcIfNeeded(npc, now);
    return true;
  }

  private updatePetRetaliation(
    npc: WulandNpcSchema,
    definition: AmbientNpcDefinition,
    owner: WulandPlayerSchema,
    deltaMs: number,
    now: number
  ): boolean {
    const retaliation = this.petRetaliations.get(npc.npcId);

    if (!retaliation || retaliation.bitesRemaining <= 0) {
      this.petRetaliations.delete(npc.npcId);
      return false;
    }

    const target = this.resolvePetRetaliationTarget(retaliation);

    if (!target || normalizeMapId(target.mapId) !== normalizeMapId(owner.mapId)) {
      this.petRetaliations.delete(npc.npcId);
      return false;
    }

    const targetPosition = { x: target.x, y: target.y };
    const distanceToTarget = distance(npc, targetPosition);

    if (distanceToTarget > PET_RETALIATION_RANGE) {
      this.petRetaliations.delete(npc.npcId);
      return false;
    }

    if (distanceToTarget > PET_RETALIATION_BITE_RANGE) {
      this.moveNpcToward(npc, targetPosition, definition.speed * 1.85, deltaMs);
      return true;
    }

    npc.moving = false;

    if (now < retaliation.nextBiteAt) {
      return true;
    }

    this.applyPetBite(npc, retaliation, now);
    retaliation.bitesRemaining -= 1;
    retaliation.nextBiteAt = now + PET_RETALIATION_COOLDOWN_MS;

    if (retaliation.bitesRemaining <= 0) {
      this.petRetaliations.delete(npc.npcId);
    } else {
      this.petRetaliations.set(npc.npcId, retaliation);
    }

    return true;
  }

  private updateEnemies(deltaMs: number, now: number): void {
    this.state.enemies.forEach((enemy) => {
      if (!enemy.alive) {
        if (enemy.respawnAt > 0 && now >= enemy.respawnAt) {
          this.respawnEnemy(enemy);
        }

        return;
      }

      if (enemy.markedUntil > 0 && now > enemy.markedUntil) {
        enemy.markedBy = "";
        enemy.markedUntil = 0;
      }

      if (enemy.weakenedUntil > 0 && now > enemy.weakenedUntil) {
        enemy.weakenedUntil = 0;
      }

      const isCaveZombie = enemy.type === "zombie" && isCaveMapId(normalizeMapId(enemy.mapId));

      if (this.enemyAiPaused && !isCaveZombie) {
        enemy.targetPlayerId = "";
        return;
      }

      const definition = ENEMY_DEFINITIONS[enemy.type as EnemyType];
      const target = this.findEnemyTarget(enemy, definition);
      enemy.targetPlayerId = target?.playerId ?? "";

      if (target) {
        this.enemyWanderTargets.delete(enemy.enemyId);
        this.enemyWanderTargetSetAt.delete(enemy.enemyId);
        this.moveEnemyToward(enemy, { x: target.x, y: target.y }, definition.speed, deltaMs);
        this.applyContactDamage(enemy, target, definition, now);
        return;
      }

      this.updateEnemyWander(enemy, definition, deltaMs, now);
    });
  }

  private updateEnemyWander(
    enemy: WulandEnemySchema,
    definition: { speed: number },
    deltaMs: number,
    now: number
  ): void {
    const mapId = normalizeMapId(enemy.mapId);

    if (enemy.type === "zombie" && isCaveMapId(mapId)) {
      let target = this.enemyWanderTargets.get(enemy.enemyId);
      const targetSetAt = this.enemyWanderTargetSetAt.get(enemy.enemyId) ?? 0;
      const targetAge = now - targetSetAt;

      if (
        !target ||
        distance(enemy, target) <= ENEMY_WANDER_TARGET_REACHED_DISTANCE ||
        targetAge > ENEMY_WANDER_TARGET_REFRESH_MS
      ) {
        target = randomWalkablePosition(mapId);
        this.enemyWanderTargets.set(enemy.enemyId, target);
        this.enemyWanderTargetSetAt.set(enemy.enemyId, now);
      }

      const before = { x: enemy.x, y: enemy.y };
      this.moveEnemyToward(enemy, target, definition.speed * 0.52, deltaMs);

      if (distance(before, enemy) < 0.6 && targetAge > ENEMY_WANDER_STUCK_REFRESH_MS) {
        this.enemyWanderTargets.delete(enemy.enemyId);
        this.enemyWanderTargetSetAt.delete(enemy.enemyId);
      }

      return;
    }

    const phase = (now / 1000 + enemy.enemyId.length * 0.47) % (Math.PI * 2);
    const wanderTarget = {
      x: enemy.spawnX + Math.cos(phase) * 42,
      y: enemy.spawnY + Math.sin(phase * 0.8) * 34
    };
    this.moveEnemyToward(enemy, wanderTarget, definition.speed * 0.35, deltaMs);
  }

  private findEnemyTarget(
    enemy: WulandEnemySchema,
    definition: { aggroRange: number }
  ): WulandPlayerSchema | null {
    let best: WulandPlayerSchema | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    this.state.players.forEach((player) => {
      if (!canFight(player)) {
        return;
      }

      if (normalizeMapId(player.mapId) !== normalizeMapId(enemy.mapId)) {
        return;
      }

      const distanceToEnemy = distance(enemy, player);

      const aggroRange = enemy.type === "zombie" && isCaveMapId(normalizeMapId(enemy.mapId))
        ? Math.max(definition.aggroRange, ZOMBIE_PURSUIT_RANGE)
        : definition.aggroRange;

      if (distanceToEnemy > aggroRange) {
        return;
      }

      const mapId = normalizeMapId(enemy.mapId);

      if (enemy.type === "zombie" && isCaveMapId(mapId) && !hasLineOfSight(enemy, player, mapId)) {
        return;
      }

      const score = distanceToEnemy;

      if (score < bestScore) {
        bestScore = score;
        best = player;
      }
    });

    return best;
  }

  private moveEnemyToward(
    enemy: WulandEnemySchema,
    target: WorldPosition,
    speed: number,
    deltaMs: number
  ): void {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy);

    if (length < 6) {
      return;
    }

    const distanceToMove = speed * (deltaMs / 1000);
    const vector = {
      x: dx / length,
      y: dy / length
    };
    const mapId = normalizeMapId(enemy.mapId);
    const map = getMapDefinition(mapId);
    const collisions = getMapCollisionRects(mapId);
    let next = clampWorldPosition({
      x: enemy.x + vector.x * distanceToMove,
      y: enemy.y
    }, map);

    if (collidesWithWorld(next, collisions)) {
      next = { x: enemy.x, y: enemy.y };
    }

    next = clampWorldPosition({
      x: next.x,
      y: next.y + vector.y * distanceToMove
    }, map);

    if (collidesWithWorld(next, collisions)) {
      next = { x: next.x, y: enemy.y };
    }

    enemy.x = next.x;
    enemy.y = next.y;
  }

  private applyContactDamage(
    enemy: WulandEnemySchema,
    player: WulandPlayerSchema,
    definition: { attackRange: number; contactCooldownMs: number; damage: number },
    now: number
  ): void {
    if (distance(enemy, player) > definition.attackRange) {
      return;
    }

    const key = `${enemy.enemyId}:${player.playerId}`;
    const previous = this.enemyContactTimes.get(key) ?? 0;

    if (now - previous < definition.contactCooldownMs) {
      return;
    }

    this.enemyContactTimes.set(key, now);
    const contactDamage = enemy.type === "zombie"
      ? Math.max(1, Math.ceil(player.maxHp * 0.2))
      : definition.damage;
    this.damagePlayer(player, contactDamage, enemy.enemyId, now, enemy.type === "zombie");
  }

  private handleWeaponAttack(playerId: string, request: CombatRequest): void {
    const player = this.state.players.get(playerId);
    const now = Date.now();

    if (!player || !canFight(player)) {
      return;
    }

    const activeItem = inventorySlotAt(player, player.selectedHotbarSlot);

    if (!activeItem) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Select a weapon", "#ffd8a8");
      return;
    }

    const itemDefinition = ITEM_DEFINITIONS[activeItem.itemDefinitionId as ItemDefinitionId];

    if (!itemDefinition || itemDefinition.itemType !== "weapon") {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Select a weapon", "#ffd8a8");
      return;
    }

    const previous = this.lastBasicAttack.get(playerId) ?? 0;

    if (now - previous < WEAPON_ATTACK_COOLDOWN_MS) {
      return;
    }

    const target = this.resolveWeaponTarget(player, request, itemDefinition);

    if (!target) {
      this.lastBasicAttack.set(playerId, now);
      this.broadcastCombatEvent(
        "weapon",
        player.playerId,
        player.playerId,
        player.x + vectorForDirection(request.direction ?? player.direction).x * 34,
        player.y + vectorForDirection(request.direction ?? player.direction).y * 34,
        0,
        "miss",
        "#dbe4ff",
        activeItem.itemDefinitionId as ItemDefinitionId
      );
      return;
    }

    this.lastBasicAttack.set(playerId, now);
    const damage = itemDefinition.damage ?? 1;
    this.damageWeaponTarget(target, damage, player, now, itemDefinition.displayName);
    const targetId = weaponTargetId(target);
    const targetPosition = weaponTargetPosition(target);

    this.broadcastCombatEvent(
      "weapon",
      player.playerId,
      targetId,
      targetPosition.x,
      targetPosition.y,
      damage,
      itemDefinition.displayName,
      colorForItem(itemDefinition),
      activeItem.itemDefinitionId as ItemDefinitionId
    );
  }

  private resolveWeaponTarget(
    player: WulandPlayerSchema,
    request: CombatRequest,
    itemDefinition: ItemDefinition
  ): WeaponTarget | null {
    const range = itemDefinition.range ?? 0;
    const direction = request.direction ?? player.direction;

    if (request.targetEnemyId) {
      const requested = this.state.enemies.get(request.targetEnemyId);

      if (
        requested?.alive &&
        normalizeMapId(requested.mapId) === normalizeMapId(player.mapId) &&
        distance(player, requested) <= range &&
        (itemDefinition.attackShape !== "arc" || isInFrontArc(player, requested, direction))
      ) {
        return { kind: "enemy", entity: requested };
      }
    }

    if (request.targetNpcId) {
      const requested = this.state.npcs.get(request.targetNpcId);

      if (
        requested &&
        canDamageNpc(requested) &&
        normalizeMapId(requested.mapId) === normalizeMapId(player.mapId) &&
        distance(player, requested) <= range &&
        (itemDefinition.attackShape !== "arc" || isInFrontArc(player, requested, direction))
      ) {
        return { kind: "npc", entity: requested };
      }
    }

    if (request.targetPlayerId) {
      const requested = this.state.players.get(request.targetPlayerId);

      if (
        requested &&
        requested.playerId !== player.playerId &&
        canDamagePlayer(requested) &&
        normalizeMapId(requested.mapId) === normalizeMapId(player.mapId) &&
        distance(player, requested) <= range &&
        (itemDefinition.attackShape !== "arc" || isInFrontArc(player, requested, direction))
      ) {
        return { kind: "player", entity: requested };
      }
    }

    const facing = vectorForDirection(direction);
    let best: WeaponTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const considerTarget = (
      target: WeaponTarget,
      targetPosition: WorldPosition,
      targetMapId: WulandMapId
    ): void => {
      if (normalizeMapId(targetMapId) !== normalizeMapId(player.mapId)) {
        return;
      }

      const dx = targetPosition.x - player.x;
      const dy = targetPosition.y - player.y;
      const distanceToTarget = Math.hypot(dx, dy);

      if (distanceToTarget > range) {
        return;
      }

      const dot = distanceToTarget > 0
        ? (dx / distanceToTarget) * facing.x + (dy / distanceToTarget) * facing.y
        : 1;

      if (
        (itemDefinition.attackShape !== "arc" || dot >= BASIC_FACING_DOT) &&
        dot >= (itemDefinition.attackShape === "projectile" ? Math.cos((110 * Math.PI) / 180) : BASIC_FACING_DOT) &&
        distanceToTarget < bestDistance
      ) {
        bestDistance = distanceToTarget;
        best = target;
      }
    };

    this.state.enemies.forEach((enemy) => {
      if (!enemy.alive) {
        return;
      }

      considerTarget({ kind: "enemy", entity: enemy }, enemy, normalizeMapId(enemy.mapId));
    });

    this.state.npcs.forEach((npc) => {
      if (!canDamageNpc(npc)) {
        return;
      }

      considerTarget({ kind: "npc", entity: npc }, npc, normalizeMapId(npc.mapId));
    });

    this.state.players.forEach((targetPlayer) => {
      if (targetPlayer.playerId === player.playerId || !canDamagePlayer(targetPlayer)) {
        return;
      }

      considerTarget({ kind: "player", entity: targetPlayer }, targetPlayer, normalizeMapId(targetPlayer.mapId));
    });

    return best;
  }

  private damageWeaponTarget(
    target: WeaponTarget,
    amount: number,
    player: WulandPlayerSchema,
    now: number,
    label: string
  ): void {
    if (target.kind === "enemy") {
      this.damageEnemy(target.entity, amount, player, now, label);
      return;
    }

    if (target.kind === "npc") {
      this.damageNpc(target.entity, amount, player, now, label);
      return;
    }

    this.damagePlayer(target.entity, amount, player.playerId, now);
  }

  private damageEnemy(
    enemy: WulandEnemySchema,
    amount: number,
    player: WulandPlayerSchema,
    now: number,
    label: string
  ): void {
    if (!enemy.alive) {
      return;
    }

    enemy.hp = Math.max(0, enemy.hp - amount);
    this.broadcastCombatEvent("damage", player.playerId, enemy.enemyId, enemy.x, enemy.y, amount, `-${amount}`, "#fff3bf");

    if (enemy.hp > 0) {
      return;
    }

    const definition = ENEMY_DEFINITIONS[enemy.type as EnemyType];
    enemy.alive = false;
    enemy.targetPlayerId = "";
    enemy.markedBy = "";
    enemy.markedUntil = 0;
    enemy.weakenedUntil = 0;
    enemy.respawnAt = now + definition.respawnMs;
    this.enemyWanderTargets.delete(enemy.enemyId);
    this.enemyWanderTargetSetAt.delete(enemy.enemyId);
    this.broadcastCombatEvent("enemy-defeated", player.playerId, enemy.enemyId, enemy.x, enemy.y, 0, `${label} cleared`, "#91f2bd");
    this.updateCounts();
  }

  private damageNpc(
    npc: WulandNpcSchema,
    amount: number,
    player: WulandPlayerSchema,
    now: number,
    label: string
  ): void {
    if (!canDamageNpc(npc)) {
      return;
    }

    const rounded = Math.max(1, Math.round(amount));
    npc.hp = Math.max(0, npc.hp - rounded);
    this.broadcastCombatEvent("damage", player.playerId, npc.npcId, npc.x, npc.y, rounded, `-${rounded}`, "#fff3bf");

    if (npc.hp > 0) {
      this.persistNpcIfNeeded(npc, now, true);
      return;
    }

    npc.defeated = true;
    npc.moving = false;
    npc.speechText = "";
    npc.speechUntil = 0;
    npc.respawnAt = now + AMBIENT_NPC_RESPAWN_MS;
    this.npcTargets.delete(npc.npcId);
    this.persistNpcIfNeeded(npc, now, true);
    this.broadcastCombatEvent("npc-defeated", player.playerId, npc.npcId, npc.x, npc.y, 0, `${label} knocked out ${npc.displayName}`, "#91f2bd");
  }

  private damagePlayer(
    player: WulandPlayerSchema,
    amount: number,
    sourceId: string,
    now: number,
    bypassShield = false,
    triggerPetRetaliation = true
  ): void {
    if (!canDamagePlayer(player)) {
      return;
    }

    const rounded = Math.max(1, Math.round(amount));
    const shieldDamage = bypassShield ? 0 : Math.min(player.shield, rounded);
    player.shield = Math.max(0, player.shield - shieldDamage);
    const hpDamage = rounded - shieldDamage;
    player.hp = Math.max(0, player.hp - hpDamage);
    this.broadcastCombatEvent("damage", sourceId, player.playerId, player.x, player.y, rounded, `-${rounded}`, "#ff8787");

    if (triggerPetRetaliation && hpDamage > 0) {
      this.queuePetRetaliation(player, sourceId, now);
    }

    if (player.hp > 0) {
      this.persistPlayer(player);
      return;
    }

    player.defeated = true;
    player.moving = false;
    player.respawnAt = now + PLAYER_RESPAWN_MS;
    const sourceEnemy = this.state.enemies.get(sourceId);

    if (sourceEnemy?.type === "zombie") {
      this.playerRespawnOverrides.set(player.playerId, {
        mapId: WULAND_MAP_ID,
        position: respawnNearMerchant()
      });
    } else {
      this.playerRespawnOverrides.delete(player.playerId);
    }

    this.inputs.set(player.playerId, { ...ZERO_INPUT });
    this.moveTargets.delete(player.playerId);
    this.persistPlayer(player);
    this.broadcastCombatEvent("player-defeated", sourceId, player.playerId, player.x, player.y, 0, "defeated", "#ff8787");
  }

  private queuePetRetaliation(owner: WulandPlayerSchema, sourceId: string, now: number): void {
    const pet = this.petForOwner(owner.playerId);

    if (!pet || !canDamageNpc(pet) || sourceId === pet.npcId) {
      return;
    }

    const sourcePlayer = this.state.players.get(sourceId);
    const sourceEnemy = this.state.enemies.get(sourceId);
    const sourceNpc = this.state.npcs.get(sourceId);

    if (
      sourcePlayer &&
      sourcePlayer.playerId !== owner.playerId &&
      canDamagePlayer(sourcePlayer) &&
      normalizeMapId(sourcePlayer.mapId) === normalizeMapId(owner.mapId)
    ) {
      this.petRetaliations.set(pet.npcId, {
        kind: "player",
        targetId: sourcePlayer.playerId,
        bitesRemaining: PET_RETALIATION_BITE_COUNT,
        nextBiteAt: now
      });
      return;
    }

    if (
      sourceEnemy?.alive &&
      normalizeMapId(sourceEnemy.mapId) === normalizeMapId(owner.mapId)
    ) {
      this.petRetaliations.set(pet.npcId, {
        kind: "enemy",
        targetId: sourceEnemy.enemyId,
        bitesRemaining: PET_RETALIATION_BITE_COUNT,
        nextBiteAt: now
      });
      return;
    }

    if (
      sourceNpc &&
      sourceNpc.npcId !== pet.npcId &&
      canDamageNpc(sourceNpc) &&
      normalizeMapId(sourceNpc.mapId) === normalizeMapId(owner.mapId)
    ) {
      this.petRetaliations.set(pet.npcId, {
        kind: "npc",
        targetId: sourceNpc.npcId,
        bitesRemaining: PET_RETALIATION_BITE_COUNT,
        nextBiteAt: now
      });
    }
  }

  private petForOwner(playerId: string): WulandNpcSchema | null {
    let ownedPet: WulandNpcSchema | null = null;

    this.state.npcs.forEach((npc) => {
      if (!ownedPet && isPetNpcType(npc.type) && npc.ownerPlayerId === playerId) {
        ownedPet = npc;
      }
    });

    return ownedPet;
  }

  private releasePetsForOwner(playerId: string, now: number): void {
    this.state.npcs.forEach((npc) => {
      if (npc.ownerPlayerId !== playerId) {
        return;
      }

      npc.ownerPlayerId = "";
      npc.moving = false;
      npc.speechText = "";
      npc.speechUntil = 0;
      this.petRetaliations.delete(npc.npcId);
      this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
      this.npcLastSavedAt.set(`${npc.npcId}:target`, now);
      this.persistNpcIfNeeded(npc, now, true);
    });
  }

  private respawnOwnedPetBesidePlayer(owner: WulandPlayerSchema, now: number): void {
    const pet = this.petForOwner(owner.playerId);

    if (!pet) {
      return;
    }

    const position = petFollowPosition(owner);
    pet.mapId = normalizeMapId(owner.mapId);
    pet.x = position.x;
    pet.y = position.y;
    pet.hp = pet.maxHp > 0 ? pet.maxHp : AMBIENT_NPC_MAX_HP;
    pet.maxHp = pet.maxHp > 0 ? pet.maxHp : AMBIENT_NPC_MAX_HP;
    pet.defeated = false;
    pet.respawnAt = 0;
    pet.moving = false;
    pet.speechText = "";
    pet.speechUntil = 0;
    this.petRetaliations.delete(pet.npcId);
    this.npcTargets.delete(pet.npcId);
    this.persistNpcIfNeeded(pet, now, true);
  }

  private resolvePetRetaliationTarget(
    target: PetRetaliationTarget
  ): (WulandEnemySchema | WulandPlayerSchema | WulandNpcSchema) | null {
    if (target.kind === "enemy") {
      const enemy = this.state.enemies.get(target.targetId);
      return enemy?.alive ? enemy : null;
    }

    if (target.kind === "player") {
      const player = this.state.players.get(target.targetId);
      return player && canDamagePlayer(player) ? player : null;
    }

    const npc = this.state.npcs.get(target.targetId);
    return npc && canDamageNpc(npc) ? npc : null;
  }

  private applyPetBite(
    pet: WulandNpcSchema,
    target: PetRetaliationTarget,
    now: number
  ): void {
    if (target.kind === "enemy") {
      const enemy = this.state.enemies.get(target.targetId);

      if (!enemy?.alive) {
        return;
      }

      const amount = petBiteDamage(enemy.maxHp);
      enemy.hp = Math.max(0, enemy.hp - amount);
      this.broadcastCombatEvent("damage", pet.npcId, enemy.enemyId, enemy.x, enemy.y, amount, `bite -${amount}`, "#ffd8a8");

      if (enemy.hp <= 0) {
        const definition = ENEMY_DEFINITIONS[enemy.type as EnemyType];
        enemy.alive = false;
        enemy.targetPlayerId = "";
        enemy.markedBy = "";
        enemy.markedUntil = 0;
        enemy.weakenedUntil = 0;
        enemy.respawnAt = now + definition.respawnMs;
        this.enemyWanderTargets.delete(enemy.enemyId);
        this.enemyWanderTargetSetAt.delete(enemy.enemyId);
        this.broadcastCombatEvent("enemy-defeated", pet.npcId, enemy.enemyId, enemy.x, enemy.y, 0, `${pet.displayName} bit ${definition.displayName}`, "#91f2bd");
        this.updateCounts();
      }

      return;
    }

    if (target.kind === "player") {
      const player = this.state.players.get(target.targetId);

      if (!player || !canDamagePlayer(player)) {
        return;
      }

      this.damagePlayer(player, petBiteDamage(player.maxHp), pet.npcId, now, false, false);
      return;
    }

    const npc = this.state.npcs.get(target.targetId);

    if (!npc || !canDamageNpc(npc)) {
      return;
    }

    const amount = petBiteDamage(npc.maxHp);
    npc.hp = Math.max(0, npc.hp - amount);
    this.broadcastCombatEvent("damage", pet.npcId, npc.npcId, npc.x, npc.y, amount, `bite -${amount}`, "#ffd8a8");

    if (npc.hp <= 0) {
      npc.defeated = true;
      npc.moving = false;
      npc.speechText = "";
      npc.speechUntil = 0;
      npc.respawnAt = now + AMBIENT_NPC_RESPAWN_MS;
      this.npcTargets.delete(npc.npcId);
      this.persistNpcIfNeeded(npc, now, true);
      this.broadcastCombatEvent("npc-defeated", pet.npcId, npc.npcId, npc.x, npc.y, 0, `${pet.displayName} bit ${npc.displayName}`, "#91f2bd");
    } else {
      this.persistNpcIfNeeded(npc, now, true);
    }
  }

  private usePortal(playerId: string, requestedPortalId?: string): void {
    const player = this.state.players.get(playerId);

    if (!player || !canFight(player)) {
      return;
    }

    const mapId = normalizeMapId(player.mapId);
    const portal = requestedPortalId
      ? portalsForMap(mapId).find((candidate) => candidate.id === requestedPortalId) ?? null
      : portalAtPosition(mapId, player);

    if (!portal || !isPlayerNearPortal(player, portal)) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "No door nearby", "#ffd8a8");
      return;
    }

    this.transitionPlayer(player, portal);
  }

  private transitionThroughPortalIfNeeded(player: WulandPlayerSchema): void {
    if (!canFight(player)) {
      return;
    }

    const portal = portalAtPosition(normalizeMapId(player.mapId), player);

    if (portal) {
      this.transitionPlayer(player, portal);
    }
  }

  private transitionPlayer(player: WulandPlayerSchema, portal: PortalDefinition): void {
    player.mapId = portal.toMapId;
    const destination = clampMapPosition(portal.destination, portal.toMapId);
    player.x = destination.x;
    player.y = destination.y;
    player.moving = false;
    this.inputs.set(player.playerId, { ...ZERO_INPUT });
    this.moveTargets.delete(player.playerId);
    this.persistPlayer(player);
    this.broadcastCombatEvent(
      "notice",
      player.playerId,
      player.playerId,
      player.x,
      player.y,
      0,
      portal.toMapId === WULAND_MAP_ID ? "Entered WULAND" : `Entered ${portal.label.replace("enter ", "")}`,
      "#d8f5a2"
    );
  }

  private selectHotbarSlot(playerId: string, slotIndex: number): void {
    const player = this.state.players.get(playerId);

    if (!player || !player.online) {
      return;
    }

    player.selectedHotbarSlot = normalizeHotbarSlot(slotIndex);
    this.persistPlayer(player);
  }

  private moveInventoryItem(playerId: string, fromSlotIndex: number, toSlotIndex: number): void {
    const player = this.state.players.get(playerId);

    if (!player || !player.online || fromSlotIndex === toSlotIndex) {
      return;
    }

    const fromSlot = getInventorySlot(player, fromSlotIndex);
    const toSlot = getInventorySlot(player, toSlotIndex);

    if (!fromSlot || !toSlot) {
      return;
    }

    const fromRecord = slotRecordFromSchema(fromSlot);
    const toRecord = slotRecordFromSchema(toSlot);
    applySlotRecord(fromSlot, { ...toRecord, slotIndex: fromSlotIndex });
    applySlotRecord(toSlot, { ...fromRecord, slotIndex: toSlotIndex });
    this.persistPlayer(player);
  }

  private discardInventoryItem(playerId: string, slotIndex: number): void {
    const player = this.state.players.get(playerId);

    if (!player || !player.online) {
      return;
    }

    const slot = getInventorySlot(player, slotIndex);
    const item = slot ? slotRecordFromSchema(slot) : null;

    if (!slot || !item?.itemDefinitionId) {
      return;
    }

    const mapId = normalizeMapId(player.mapId);
    const dropPosition = clampMapPosition({
      x: player.x + vectorForDirection(player.direction).x * DROP_OFFSET,
      y: player.y + vectorForDirection(player.direction).y * DROP_OFFSET
    }, mapId);
    const droppedItem = droppedItemFromRecord({
      droppedItemId: `drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemDefinitionId: item.itemDefinitionId,
      itemInstanceId: item.quantity > 1
        ? createItemInstanceId(item.itemDefinitionId, `${player.playerId}-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        : item.itemInstanceId,
      quantity: 1,
      chargeRemainingMs: normalizeItemCharge(item.itemDefinitionId, item.chargeRemainingMs),
      mapId,
      x: dropPosition.x,
      y: dropPosition.y,
      droppedByPlayerId: player.playerId,
      droppedAt: new Date().toISOString(),
      expiresAt: item.itemDefinitionId === LIGHT_STICK_ITEM_ID ? Date.now() + LIGHT_STICK_DURATION_MS : 0
    });

    removeOneFromSlot(slot);
    this.state.droppedItems.set(droppedItem.droppedItemId, droppedItem);
    this.playerStore.upsertDroppedItem(recordFromDroppedItem(droppedItem));
    this.persistPlayer(player);
    this.broadcastCombatEvent("drop", player.playerId, droppedItem.droppedItemId, droppedItem.x, droppedItem.y, 0, "dropped", "#ffd8a8", item.itemDefinitionId);
    this.updateCounts();
  }

  private useSelectedItem(playerId: string): void {
    const player = this.state.players.get(playerId);

    if (!player || !canFight(player)) {
      return;
    }

    const slot = getInventorySlot(player, player.selectedHotbarSlot);
    const item = slot ? slotRecordFromSchema(slot) : null;

    if (!slot || !item?.itemDefinitionId) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Select an item", "#ffd8a8");
      return;
    }

    const definition = ITEM_DEFINITIONS[item.itemDefinitionId];

    if (definition.itemType !== "consumable" || !definition.healAmount) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Not usable", "#ffd8a8");
      return;
    }

    if (player.hp >= player.maxHp) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Already healthy", "#ffd8a8");
      return;
    }

    const healAmount = healAmountForItem(definition);
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    removeOneFromSlot(slot);

    if (slot.quantity <= 0) {
      clearSlot(slot);
    }

    this.persistPlayer(player);
    this.broadcastCombatEvent(
      "consume",
      player.playerId,
      player.playerId,
      player.x,
      player.y,
      player.hp - before,
      `Ate ${definition.displayName} +${player.hp - before}`,
      "#91f2bd",
      item.itemDefinitionId
    );
  }

  private pickupItem(playerId: string, requestedDroppedItemId?: string): void {
    const player = this.state.players.get(playerId);

    if (!player || !player.online || player.sleeping) {
      return;
    }

    const droppedItem = requestedDroppedItemId
      ? this.state.droppedItems.get(requestedDroppedItemId)
      : nearestDroppedItem(player, this.state.droppedItems, PICKUP_RANGE);

    if (
      !droppedItem ||
      droppedItem.mapId !== normalizeMapId(player.mapId) ||
      distance(player, droppedItem) > PICKUP_RANGE
    ) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "No item nearby", "#ffd8a8");
      return;
    }

    if (!addItemToInventory(player, recordFromDroppedItem(droppedItem))) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Inventory full", "#ffd8a8");
      return;
    }

    this.state.droppedItems.delete(droppedItem.droppedItemId);
    this.playerStore.removeDroppedItem(droppedItem.droppedItemId);
    this.persistPlayer(player);
    this.broadcastCombatEvent(
      "pickup",
      player.playerId,
      droppedItem.droppedItemId,
      player.x,
      player.y,
      0,
      `picked up ${ITEM_DEFINITIONS[droppedItem.itemDefinitionId as ItemDefinitionId].displayName}`,
      "#91f2bd",
      droppedItem.itemDefinitionId as ItemDefinitionId
    );
    this.updateCounts();
  }

  private buyItem(playerId: string, itemDefinitionId: ItemDefinitionId): ShopResultEvent {
    const player = this.state.players.get(playerId);
    const stockItem = WULAND_MERCHANT_STOCK.find((item) => item.itemDefinitionId === itemDefinitionId);
    const itemDefinition = ITEM_DEFINITIONS[itemDefinitionId];
    const playerLabel = player ? `${player.name} (${player.playerId})` : playerId;

    console.log(`${PURCHASE_LOG_PREFIX} attempt player=${playerLabel} item=${itemDefinitionId}`);

    if (!player || !player.online || player.sleeping || player.defeated) {
      console.warn(`${PURCHASE_LOG_PREFIX} failed player=${playerLabel} item=${itemDefinitionId} reason=player-unavailable`);
      return {
        ok: false,
        itemDefinitionId,
        message: "Player cannot shop right now"
      };
    }

    if (!stockItem || !itemDefinition) {
      console.warn(`${PURCHASE_LOG_PREFIX} failed player=${playerLabel} item=${itemDefinitionId} reason=item-not-for-sale`);
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Item is not for sale", "#ffd8a8");
      return {
        ok: false,
        itemDefinitionId,
        message: "Item is not for sale",
        money: player.money
      };
    }

    if (!isNearMerchant(player)) {
      console.warn(`${PURCHASE_LOG_PREFIX} failed player=${playerLabel} item=${itemDefinitionId} reason=too-far`);
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Shop is too far away", "#ffd8a8");
      return {
        ok: false,
        itemDefinitionId,
        message: "Shop is too far away",
        money: player.money
      };
    }

    player.money = normalizeMoney(player.money);

    if (player.money < stockItem.price) {
      console.warn(`${PURCHASE_LOG_PREFIX} failed player=${playerLabel} item=${itemDefinitionId} reason=not-enough-money money=${player.money} price=${stockItem.price}`);
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Not enough money", "#ffd8a8");
      return {
        ok: false,
        itemDefinitionId,
        message: "Not enough money",
        money: player.money
      };
    }

    const item = createInventoryItem(itemDefinitionId, player.playerId);

    if (!addItemToInventory(player, item)) {
      console.warn(`${PURCHASE_LOG_PREFIX} failed player=${playerLabel} item=${itemDefinitionId} reason=inventory-full`);
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Inventory full", "#ffd8a8");
      return {
        ok: false,
        itemDefinitionId,
        message: "Inventory full",
        money: player.money
      };
    }

    player.money -= stockItem.price;
    this.persistPlayer(player);
    console.log(`${PURCHASE_LOG_PREFIX} success player=${playerLabel} item=${itemDefinitionId} price=${stockItem.price} money=${player.money}`);
    this.broadcastCombatEvent(
      "shop",
      player.playerId,
      player.playerId,
      player.x,
      player.y,
      stockItem.price,
      `Bought ${itemDefinition.displayName}`,
      "#fff3bf",
      itemDefinitionId
    );
    return {
      ok: true,
      itemDefinitionId,
      message: `Bought ${itemDefinition.displayName}`,
      money: player.money
    };
  }

  private giftSelectedItem(playerId: string, requestedTargetPlayerId?: string): void {
    const giver = this.state.players.get(playerId);

    if (!giver || !giver.online || giver.sleeping || giver.defeated) {
      return;
    }

    const slot = getInventorySlot(giver, giver.selectedHotbarSlot);
    const item = slot ? slotRecordFromSchema(slot) : null;

    if (!slot || !item?.itemDefinitionId || !isCakeItemDefinitionId(item.itemDefinitionId)) {
      this.broadcastCombatEvent("notice", giver.playerId, giver.playerId, giver.x, giver.y, 0, "Select a cake to gift", "#ffd8a8");
      return;
    }

    const receiver = requestedTargetPlayerId
      ? this.state.players.get(requestedTargetPlayerId)
      : nearestGiftTarget(giver, this.state.players, GIFT_RANGE);

    if (
      !receiver ||
      receiver.playerId === giver.playerId ||
      !receiver.online ||
      receiver.sleeping ||
      normalizeMapId(receiver.mapId) !== normalizeMapId(giver.mapId) ||
      distance(giver, receiver) > GIFT_RANGE
    ) {
      this.broadcastCombatEvent("notice", giver.playerId, giver.playerId, giver.x, giver.y, 0, "No teammate nearby", "#ffd8a8");
      return;
    }

    const giftItem = {
      droppedItemId: "",
      itemDefinitionId: item.itemDefinitionId,
      itemInstanceId: createItemInstanceId(item.itemDefinitionId, `${giver.playerId}-gift-${Date.now()}`),
      quantity: 1,
      mapId: normalizeMapId(receiver.mapId),
      x: receiver.x,
      y: receiver.y,
      droppedByPlayerId: giver.playerId,
      droppedAt: new Date().toISOString()
    } satisfies DroppedItemNetworkState;

    if (!addItemToInventory(receiver, giftItem)) {
      this.broadcastCombatEvent("notice", giver.playerId, giver.playerId, giver.x, giver.y, 0, `${receiver.name}'s inventory is full`, "#ffd8a8");
      return;
    }

    removeOneFromSlot(slot);
    this.persistPlayer(giver);
    this.persistPlayer(receiver);
    const displayName = ITEM_DEFINITIONS[item.itemDefinitionId].displayName;
    this.broadcastCombatEvent("gift", giver.playerId, receiver.playerId, giver.x, giver.y, 0, `Gifted ${displayName} to ${receiver.name}`, "#ffdeeb", item.itemDefinitionId);
    this.broadcastCombatEvent("gift", giver.playerId, receiver.playerId, receiver.x, receiver.y, 0, `${giver.name} gave you ${displayName}`, "#ffdeeb", item.itemDefinitionId);
  }

  private petNpc(playerId: string, requestedNpcId?: string): void {
    const player = this.state.players.get(playerId);
    const now = Date.now();

    if (!player || !canFight(player)) {
      return;
    }

    const npc = requestedNpcId
      ? this.state.npcs.get(requestedNpcId)
      : nearestPetNpc(player, this.state.npcs, PET_RANGE);

    if (
      !npc ||
      !isPetNpcType(npc.type) ||
      npc.defeated ||
      normalizeMapId(npc.mapId) !== normalizeMapId(player.mapId) ||
      distance(player, npc) > PET_RANGE
    ) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "No pet nearby", "#ffd8a8");
      return;
    }

    if (npc.ownerPlayerId === player.playerId) {
      npc.ownerPlayerId = "";
      npc.speechText = npc.type === "cat" ? "Mrrrp!" : "Woof!";
      npc.speechUntil = now + PET_REACTION_DURATION_MS;
      npc.moving = false;
      this.petRetaliations.delete(npc.npcId);
      this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
      this.npcLastSavedAt.set(`${npc.npcId}:target`, now);
      this.persistNpcIfNeeded(npc, now, true);
      this.broadcastSpeechBubble({
        sourceType: "npc",
        sourceId: npc.npcId,
        mapId: normalizeMapId(npc.mapId),
        text: npc.speechText
      });
      this.broadcastCombatEvent("notice", player.playerId, npc.npcId, npc.x, npc.y, 0, `${npc.displayName} is roaming freely again.`, "#d0ebff");
      return;
    }

    if (npc.ownerPlayerId) {
      this.broadcastCombatEvent("notice", player.playerId, npc.npcId, npc.x, npc.y, 0, `${npc.displayName} already follows someone.`, "#ffd8a8");
      return;
    }

    const currentPet = this.petForOwner(player.playerId);

    if (currentPet) {
      this.broadcastCombatEvent("notice", player.playerId, currentPet.npcId, currentPet.x, currentPet.y, 0, `You already recruited ${currentPet.displayName}.`, "#ffd8a8");
      return;
    }

    const cakeCount = countCakesInInventory(player);

    if (cakeCount <= 0) {
      this.broadcastCombatEvent("notice", player.playerId, npc.npcId, npc.x, npc.y, 0, `${npc.displayName} wants cake first.`, "#ffd8a8");
      return;
    }

    removeAllCakesFromInventory(player);
    this.persistPlayer(player);

    const chance = petRecruitChance(cakeCount);
    const success = Math.random() < chance;

    if (success) {
      npc.ownerPlayerId = player.playerId;
      npc.mapId = normalizeMapId(player.mapId);
      const followPosition = petFollowPosition(player);
      npc.x = followPosition.x;
      npc.y = followPosition.y;
      npc.hp = npc.maxHp > 0 ? npc.maxHp : AMBIENT_NPC_MAX_HP;
      npc.defeated = false;
      npc.respawnAt = 0;
      npc.speechText = npc.type === "cat" ? "Purr!" : "Woof!";
      npc.speechUntil = now + PET_REACTION_DURATION_MS;
      npc.moving = false;
      this.npcTargets.delete(npc.npcId);
      this.persistNpcIfNeeded(npc, now, true);
      this.broadcastSpeechBubble({
        sourceType: "npc",
        sourceId: npc.npcId,
        mapId: normalizeMapId(npc.mapId),
        text: npc.speechText
      });
      this.broadcastCombatEvent("notice", player.playerId, npc.npcId, npc.x, npc.y, 0, `${npc.displayName} joins you! (${formatChance(chance)} chance)`, "#d8f5a2");
      return;
    }

    npc.speechText = npc.type === "cat" ? "Not today." : "Maybe later.";
    npc.speechUntil = now + PET_REACTION_DURATION_MS;
    npc.moving = false;
    this.npcTargets.set(npc.npcId, randomNpcTarget(npc));
    this.npcLastSavedAt.set(`${npc.npcId}:target`, now);
    this.persistNpcIfNeeded(npc, now, true);
    this.broadcastSpeechBubble({
      sourceType: "npc",
      sourceId: npc.npcId,
      mapId: normalizeMapId(npc.mapId),
      text: npc.speechText
    });
    this.broadcastCombatEvent("notice", player.playerId, npc.npcId, npc.x, npc.y, 0, `${npc.displayName} ate ${cakeCount} cake${cakeCount === 1 ? "" : "s"} but stayed independent. (${formatChance(chance)} chance)`, "#ffd8a8");
  }

  private handleChat(playerId: string, rawText: string): void {
    const player = this.state.players.get(playerId);
    const now = Date.now();

    if (!player || !player.online || player.sleeping) {
      return;
    }

    const previous = this.lastChatAt.get(playerId) ?? 0;

    if (now - previous < CHAT_COOLDOWN_MS) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Chat cooldown", "#ffd8a8");
      return;
    }

    const text = sanitizeChatText(rawText);

    if (!text) {
      return;
    }

    this.lastChatAt.set(playerId, now);
    this.chatEventCounter += 1;
    const message = {
      messageId: `${now}-${this.chatEventCounter}`,
      playerId: player.playerId,
      playerName: player.name,
      mapId: normalizeMapId(player.mapId),
      text,
      sentAt: new Date(now).toISOString()
    } satisfies ChatMessage;
    this.playerStore.appendChatMessage(message);
    this.broadcast("chatMessage", message);
    this.broadcastSpeechBubble({
      sourceType: "player",
      sourceId: player.playerId,
      mapId: normalizeMapId(player.mapId),
      text
    });
  }

  private deleteDroppedItem(requesterId: string, request: DeleteDroppedItemRequest): void {
    const requester = this.state.players.get(requesterId);
    const droppedItem = this.state.droppedItems.get(request.droppedItemId);

    if (!requester || !requester.online || !this.canUseGodMode(requester, request.code)) {
      return;
    }

    if (!droppedItem || normalizeMapId(droppedItem.mapId) !== normalizeMapId(requester.mapId)) {
      this.broadcastCombatEvent("notice", requester.playerId, requester.playerId, requester.x, requester.y, 0, "No item to delete here", "#ffd8a8");
      return;
    }

    const mapId = normalizeMapId(droppedItem.mapId);
    const x = droppedItem.x;
    const y = droppedItem.y;
    const itemName = ITEM_DEFINITIONS[droppedItem.itemDefinitionId as ItemDefinitionId]?.displayName ?? "Item";
    this.state.droppedItems.delete(droppedItem.droppedItemId);
    this.playerStore.removeDroppedItem(droppedItem.droppedItemId, { immediate: true });
    this.updateCounts();
    this.broadcastMapEvent("delete", requester.playerId, droppedItem.droppedItemId, mapId, x, y, `${itemName} deleted`, "#ff8787");
  }

  private deletePlayer(requesterId: string, request: DeletePlayerRequest): void {
    const requester = this.state.players.get(requesterId);

    if (!requester || !requester.online || !this.canUseGodMode(requester, request.code)) {
      return;
    }

    if (request.playerId === requester.playerId) {
      this.broadcastCombatEvent("notice", requester.playerId, requester.playerId, requester.x, requester.y, 0, "Cannot delete yourself", "#ffd8a8");
      return;
    }

    const target = this.state.players.get(request.playerId);

    if (!target) {
      this.releasePetsForOwner(request.playerId, Date.now());
      this.playerStore.markPlayerDeleted(request.playerId, { immediate: true });
      this.broadcastCombatEvent("notice", requester.playerId, requester.playerId, requester.x, requester.y, 0, "Player record deleted", "#ff8787");
      return;
    }

    const targetMapId = normalizeMapId(target.mapId);
    const targetX = target.x;
    const targetY = target.y;
    const targetName = target.name;
    const targetSessionId = target.sessionId;
    const targetClient = targetSessionId
      ? this.clients.find((client) => client.sessionId === targetSessionId)
      : undefined;

    if (targetClient) {
      targetClient.send("forceDeleted", {
        playerId: target.playerId,
        message: "Your character was deleted. Create a new one to re-enter WULAND."
      });
    }

    this.state.players.delete(target.playerId);
    this.sessionToPlayerId.delete(targetSessionId);
    this.inputs.delete(target.playerId);
    this.moveTargets.delete(target.playerId);
    this.lastBasicAttack.delete(target.playerId);
    this.lastChatAt.delete(target.playerId);
    this.lastPersistedPosition.delete(target.playerId);
    this.releasePetsForOwner(target.playerId, Date.now());
    this.playerStore.markPlayerDeleted(target.playerId, { immediate: true });
    this.updateCounts();
    this.broadcastMapEvent("delete", requester.playerId, target.playerId, targetMapId, targetX, targetY, `${targetName} deleted`, "#ff8787");

    if (targetClient) {
      targetClient.leave(FORCE_DELETED_CLOSE_CODE, "PLAYER_DELETED");
    }
  }

  private clearChat(requesterId: string, request: ClearChatRequest): void {
    const requester = this.state.players.get(requesterId);

    if (!requester || !requester.online || !this.canUseGodMode(requester, request.code)) {
      return;
    }

    this.playerStore.clearChatMessages({ immediate: true });
    this.broadcast("chatCleared", {
      clearedByPlayerId: requester.playerId,
      clearedByName: requester.name,
      clearedAt: new Date().toISOString()
    });
    this.broadcastCombatEvent("notice", requester.playerId, requester.playerId, requester.x, requester.y, 0, "Chat cleared", "#ffd8a8");
    console.log(`[WULAND][GOD] chat cleared by ${requester.name} (${requester.playerId})`);
  }

  private canUseGodMode(player: WulandPlayerSchema, code: string | undefined): boolean {
    if (!this.godModeEnabled) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "God Mode is disabled", "#ffd8a8");
      return false;
    }

    if (this.godModeCode && code !== this.godModeCode) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Wrong God Mode code", "#ffd8a8");
      return false;
    }

    return true;
  }

  private respawnEnemy(enemy: WulandEnemySchema): void {
    const definition = ENEMY_DEFINITIONS[enemy.type as EnemyType];
    const spawn = enemy.type === "zombie"
      ? WULAND_ENEMY_SPAWNS.find((candidate) => candidate.id === enemy.enemyId)
      : undefined;

    if (spawn && isCaveMapId(normalizeMapId(spawn.mapId ?? WULAND_MAP_ID))) {
      enemy.mapId = normalizeMapId(spawn.mapId);
      enemy.spawnX = spawn.x;
      enemy.spawnY = spawn.y;
    }

    enemy.x = enemy.spawnX;
    enemy.y = enemy.spawnY;
    enemy.hp = definition.maxHp;
    enemy.maxHp = definition.maxHp;
    enemy.alive = true;
    enemy.targetPlayerId = "";
    enemy.markedBy = "";
    enemy.markedUntil = 0;
    enemy.weakenedUntil = 0;
    enemy.respawnAt = 0;
    this.enemyWanderTargets.delete(enemy.enemyId);
    this.enemyWanderTargetSetAt.delete(enemy.enemyId);
    this.broadcastCombatEvent("respawn", enemy.enemyId, enemy.enemyId, enemy.x, enemy.y, 0, "respawn", "#91f2bd");
    this.updateCounts();
  }

  private respawnNpc(npc: WulandNpcSchema): void {
    const mapId = normalizeMapId(npc.mapId);
    const position = randomWalkablePosition(mapId);
    npc.mapId = mapId;
    npc.x = position.x;
    npc.y = position.y;
    npc.hp = npc.maxHp > 0 ? npc.maxHp : AMBIENT_NPC_MAX_HP;
    npc.maxHp = npc.maxHp > 0 ? npc.maxHp : AMBIENT_NPC_MAX_HP;
    npc.defeated = false;
    npc.respawnAt = 0;
    npc.moving = false;
    npc.speechText = "";
    npc.speechUntil = 0;
    this.broadcastCombatEvent("respawn", npc.npcId, npc.npcId, npc.x, npc.y, 0, "respawn", "#91f2bd");
  }

  private broadcastCombatEvent(
    type: CombatEvent["type"],
    sourceId: string,
    targetId: string,
    x: number,
    y: number,
    value: number,
    text: string,
    color: string,
    itemDefinitionId?: ItemDefinitionId
  ): void {
    this.combatEventCounter += 1;
    this.broadcast("combatEvent", {
      id: `${Date.now()}-${this.combatEventCounter}`,
      type,
      sourceId,
      targetId,
      mapId: this.mapIdForCombatEvent(sourceId, targetId),
      x,
      y,
      value,
      text,
      color,
      itemDefinitionId
    } satisfies CombatEvent);
  }

  private broadcastMapEvent(
    type: CombatEvent["type"],
    sourceId: string,
    targetId: string,
    mapId: WulandMapId,
    x: number,
    y: number,
    text: string,
    color: string
  ): void {
    this.combatEventCounter += 1;
    this.broadcast("combatEvent", {
      id: `${Date.now()}-${this.combatEventCounter}`,
      type,
      sourceId,
      targetId,
      mapId,
      x,
      y,
      value: 0,
      text,
      color
    } satisfies CombatEvent);
  }

  private broadcastSpeechBubble(
    event: Omit<SpeechBubbleEvent, "id" | "sentAt">
  ): void {
    this.speechEventCounter += 1;
    this.broadcast("speechBubble", {
      ...event,
      id: `${Date.now()}-${this.speechEventCounter}`,
      text: sanitizeChatText(event.text),
      sentAt: new Date().toISOString()
    } satisfies SpeechBubbleEvent);
  }

  private mapIdForCombatEvent(sourceId: string, targetId: string): WulandMapId {
    return normalizeMapId(
      this.state.players.get(sourceId)?.mapId ??
      this.state.players.get(targetId)?.mapId ??
      this.state.enemies.get(sourceId)?.mapId ??
      this.state.enemies.get(targetId)?.mapId ??
      this.state.npcs.get(sourceId)?.mapId ??
      this.state.npcs.get(targetId)?.mapId ??
      this.state.droppedItems.get(sourceId)?.mapId ??
      this.state.droppedItems.get(targetId)?.mapId ??
      WULAND_MAP_ID
    );
  }

  private persistIfNeeded(player: WulandPlayerSchema): void {
    const previous = this.lastPersistedPosition.get(player.playerId);
    const now = Date.now();
    const movedDistanceSquared = previous
      ? (player.x - previous.x) ** 2 + (player.y - previous.y) ** 2
      : Number.POSITIVE_INFINITY;

    if (
      !previous ||
      movedDistanceSquared >= SAVE_POSITION_DELTA_SQUARED ||
      now - previous.at >= SAVE_INTERVAL_MS
    ) {
      player.lastSavedAt = new Date().toISOString();
      this.lastPersistedPosition.set(player.playerId, {
        x: player.x,
        y: player.y,
        at: now
      });
      this.playerStore.upsert(recordFromSchema(player));
    }
  }

  private persistPlayer(player: WulandPlayerSchema, immediate = false): void {
    this.lastPersistedPosition.set(player.playerId, {
      x: player.x,
      y: player.y,
      at: Date.now()
    });
    this.playerStore.upsert(recordFromSchema(player), { immediate });
  }

  private persistNpcIfNeeded(npc: WulandNpcSchema, now: number, force = false): void {
    const previous = this.npcLastSavedAt.get(npc.npcId) ?? 0;

    if (!force && now - previous < NPC_SAVE_INTERVAL_MS) {
      return;
    }

    this.npcLastSavedAt.set(npc.npcId, now);
    this.playerStore.upsertNpcState(recordFromNpc(npc));
  }

  private cleanupExpiredOfflinePlayers(): void {
    this.playerStore.removeExpiredOfflinePlayers();
    const visibleIds = new Set(this.playerStore.allVisiblePlayers().map((player) => player.playerId));

    this.state.players.forEach((player, playerId) => {
      if (!player.online && !visibleIds.has(playerId)) {
        this.state.players.delete(playerId);
        this.lastPersistedPosition.delete(playerId);
      }
    });

    this.updateCounts();
  }

  private updateCounts(): void {
    let totalPlayers = 0;
    let onlinePlayers = 0;
    let sleepingPlayers = 0;
    let totalEnemies = 0;
    let aliveEnemies = 0;

    this.state.players.forEach((player) => {
      totalPlayers += 1;

      if (player.online) {
        onlinePlayers += 1;
      }

      if (player.sleeping || !player.online) {
        sleepingPlayers += 1;
      }
    });

    this.state.enemies.forEach((enemy) => {
      totalEnemies += 1;

      if (enemy.alive) {
        aliveEnemies += 1;
      }
    });

    this.state.totalPlayers = totalPlayers;
    this.state.onlinePlayers = onlinePlayers;
    this.state.sleepingPlayers = sleepingPlayers;
    this.state.totalEnemies = totalEnemies;
    this.state.aliveEnemies = aliveEnemies;
    this.state.totalDroppedItems = this.state.droppedItems.size;
  }
}

const validateJoinOptions = (options: unknown): WulandJoinOptions => {
  if (typeof options !== "object" || options === null || !("profile" in options)) {
    throw new Error("Missing WULAND player profile.");
  }

  const joinOptions = options as WulandJoinOptions;

  if (!isValidPlayerProfile(joinOptions.profile)) {
    throw new Error("Invalid WULAND player profile.");
  }

  if (
    joinOptions.localProgress !== undefined &&
    joinOptions.localProgress !== null &&
    !isValidLocalProgress(joinOptions.localProgress)
  ) {
    throw new Error("Invalid WULAND local progress.");
  }

  if (
    joinOptions.localProgress &&
    joinOptions.localProgress.playerId !== joinOptions.profile.playerId
  ) {
    throw new Error("WULAND local progress does not belong to this player.");
  }

  return {
    profile: {
      ...joinOptions.profile,
      name: joinOptions.profile.name.trim().slice(0, 24)
    },
    localProgress: joinOptions.localProgress ?? null
  };
};

const applyProfileToSchema = (
  player: WulandPlayerSchema,
  profile: PlayerProfile
): void => {
  player.playerId = profile.playerId;
  player.name = profile.name;
  player.className = profile.class;
  player.gender = profile.gender;
  player.skinTone = profile.cosmetics.skinTone;
  player.hairStyle = profile.cosmetics.hairStyle;
  player.hairColor = profile.cosmetics.hairColor;
  player.outfitColor = profile.cosmetics.outfitColor;
  player.accessory = profile.cosmetics.accessory;
  player.spriteVariant = profile.cosmetics.spriteVariant;
  player.role = CLASS_METADATA[profile.class].futureRole;
};

const resetPlayerCombat = (player: WulandPlayerSchema): void => {
  player.maxHp = PLAYER_MAX_HP;
  player.hp = PLAYER_MAX_HP;
  player.shield = 0;
  player.defeated = false;
  player.respawnAt = 0;
  player.specialCooldownUntil = 0;
  player.activeBuffs = "";
  player.markedTargets = "";
};

const enemyFromSpawn = (
  enemyId: string,
  type: EnemyType,
  x: number,
  y: number,
  mapId: WulandMapId = WULAND_MAP_ID
): WulandEnemySchema => {
  const definition = ENEMY_DEFINITIONS[type];
  const enemy = new WulandEnemySchema();
  enemy.enemyId = enemyId;
  enemy.type = type;
  enemy.name = definition.displayName;
  enemy.mapId = mapId;
  enemy.x = x;
  enemy.y = y;
  enemy.spawnX = x;
  enemy.spawnY = y;
  enemy.hp = definition.maxHp;
  enemy.maxHp = definition.maxHp;
  enemy.alive = true;
  return enemy;
};

const npcDefinitionFor = (npcId: string): AmbientNpcDefinition | undefined =>
  WULAND_AMBIENT_NPCS.find((npc) => npc.npcId === npcId);

const npcFromDefinition = (
  definition: AmbientNpcDefinition,
  record?: AmbientNpcNetworkState
): WulandNpcSchema => {
  const npc = new WulandNpcSchema();
  const persistedMapId = normalizeMapId(record?.mapId ?? definition.mapId);
  const mapId = isCaveMapId(persistedMapId)
    ? normalizeMapId(definition.mapId)
    : persistedMapId;
  const position = clampMapPosition(
    record &&
      persistedMapId === mapId &&
      isValidMapPosition({ x: record.x, y: record.y }, mapId)
      ? { x: record.x, y: record.y }
      : { x: definition.x, y: definition.y },
    mapId
  );

  npc.npcId = definition.npcId;
  npc.type = definition.type;
  npc.displayName = definition.displayName;
  npc.ownerPlayerId = isPetNpcType(definition.type) ? record?.ownerPlayerId ?? "" : "";
  npc.mapId = mapId;
  npc.x = position.x;
  npc.y = position.y;
  npc.spawnX = definition.x;
  npc.spawnY = definition.y;
  npc.wanderRadius = definition.wanderRadius;
  npc.maxHp = normalizeNpcHp(record?.maxHp, AMBIENT_NPC_MAX_HP);
  npc.hp = normalizeNpcHp(record?.hp, npc.maxHp, true);
  npc.defeated = record?.defeated ?? false;
  npc.respawnAt = Number.isFinite(record?.respawnAt) ? record?.respawnAt ?? 0 : 0;
  npc.direction = record?.direction ?? "down";
  npc.moving = false;
  npc.speechText = record?.speechText ?? "";
  npc.speechUntil = record?.speechUntil ?? 0;
  return npc;
};

const recordFromNpc = (npc: WulandNpcSchema): AmbientNpcNetworkState => ({
  npcId: npc.npcId,
  type: npc.type as AmbientNpcType,
  displayName: npc.displayName,
  ownerPlayerId: npc.ownerPlayerId,
  mapId: normalizeMapId(npc.mapId),
  x: npc.x,
  y: npc.y,
  spawnX: npc.spawnX,
  spawnY: npc.spawnY,
  wanderRadius: npc.wanderRadius,
  hp: npc.hp,
  maxHp: npc.maxHp,
  defeated: npc.defeated,
  respawnAt: npc.respawnAt,
  direction: npc.direction,
  moving: npc.moving,
  speechText: npc.speechText,
  speechUntil: npc.speechUntil
});

const normalizeNpcHp = (value: unknown, fallback: number, allowZero = false): number =>
  typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
    ? Math.floor(value)
    : fallback;

const randomAmbientNpcMapId = (currentMapId: WulandMapId): WulandMapId => {
  const allowedMaps = WULAND_MAP_IDS.filter((mapId) => !isCaveMapId(mapId));
  const candidates = allowedMaps.filter((mapId) => mapId !== currentMapId);
  return randomChoice(candidates.length > 0 ? candidates : allowedMaps);
};

const randomWalkablePosition = (mapId: WulandMapId): WorldPosition => {
  const map = getMapDefinition(mapId);
  const collisions = getMapCollisionRects(mapId);
  const margin = 54;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = clampMapPosition({
      x: randomBetween(margin, Math.max(margin, map.width - margin)),
      y: randomBetween(margin, Math.max(margin, map.height - margin))
    }, mapId);

    if (!collidesWithWorld(candidate, collisions)) {
      return candidate;
    }
  }

  return clampMapPosition(map.defaultSpawn, mapId);
};

const respawnNearMerchant = (): WorldPosition => {
  const collisions = getMapCollisionRects(WULAND_MAP_ID);
  const candidates: WorldPosition[] = [
    { x: WULAND_MERCHANT.x + 88, y: WULAND_MERCHANT.y + 42 },
    { x: WULAND_MERCHANT.x - 88, y: WULAND_MERCHANT.y + 42 },
    { x: WULAND_MERCHANT.x, y: WULAND_MERCHANT.y + 120 },
    { x: WULAND_MERCHANT.x + 118, y: WULAND_MERCHANT.y - 36 },
    { x: WULAND_MERCHANT.x - 118, y: WULAND_MERCHANT.y - 36 }
  ];

  for (const candidate of candidates) {
    const position = clampMapPosition(candidate, WULAND_MAP_ID);

    if (!collidesWithWorld(position, collisions)) {
      return position;
    }
  }

  return clampMapPosition(WULAND_WORLD.defaultSpawn, WULAND_MAP_ID);
};

const randomNpcTarget = (npc: WulandNpcSchema): NpcTravelTarget => {
  const currentMapId = normalizeMapId(npc.mapId);
  const mapId = Math.random() < NPC_MAP_CHANGE_CHANCE
    ? randomAmbientNpcMapId(currentMapId)
    : isCaveMapId(currentMapId)
      ? randomAmbientNpcMapId(currentMapId)
      : currentMapId;

  return {
    ...randomWalkablePosition(mapId),
    mapId
  };
};

const isRestingPet = (npc: WulandNpcSchema): boolean =>
  isPetNpcType(npc.type) &&
  !npc.ownerPlayerId &&
  ["Zzz", "Purr.", "Soft snore.", "Dreams about snacks."].includes(npc.speechText) &&
  npc.speechUntil > Date.now();

const countCakesInInventory = (player: WulandPlayerSchema): number => {
  let total = 0;

  player.inventory.forEach((slot) => {
    if (isCakeItemDefinitionId(slot.itemDefinitionId)) {
      total += Math.max(0, Math.floor(slot.quantity));
    }
  });

  return total;
};

const removeAllCakesFromInventory = (player: WulandPlayerSchema): void => {
  player.inventory.forEach((slot) => {
    if (isCakeItemDefinitionId(slot.itemDefinitionId)) {
      clearSlot(slot);
    }
  });
};

const petRecruitChance = (cakeCount: number): number => {
  if (cakeCount <= 0) {
    return 0;
  }

  const effectiveCakes = Math.min(PET_RECRUIT_MAX_CAKES, Math.max(1, Math.floor(cakeCount)));
  const progress = (effectiveCakes - 1) / (PET_RECRUIT_MAX_CAKES - 1);
  return Math.min(
    PET_RECRUIT_MAX_CHANCE,
    PET_RECRUIT_ONE_CAKE_CHANCE + progress * (PET_RECRUIT_MAX_CHANCE - PET_RECRUIT_ONE_CAKE_CHANCE)
  );
};

const formatChance = (chance: number): string =>
  `${Math.round(chance * 100)}%`;

const petFollowPosition = (owner: WulandPlayerSchema): WorldPosition => {
  const offset = vectorForDirection(owner.direction);
  return clampMapPosition({
    x: owner.x - offset.x * 42,
    y: owner.y - offset.y * 42
  }, normalizeMapId(owner.mapId));
};

const petBiteDamage = (targetMaxHp: number): number =>
  Math.max(1, Math.round(Math.max(1, targetMaxHp) * PET_DAMAGE_RATIO));

const nearestPetNpc = (
  player: WulandPlayerSchema,
  npcs: MapSchema<WulandNpcSchema>,
  range: number
): WulandNpcSchema | null => {
  let best: WulandNpcSchema | null = null;
  let bestDistance = range;

  npcs.forEach((npc) => {
    if (
      !isPetNpcType(npc.type) ||
      npc.defeated ||
      normalizeMapId(npc.mapId) !== normalizeMapId(player.mapId)
    ) {
      return;
    }

    const distanceToNpc = distance(player, npc);

    if (distanceToNpc <= bestDistance) {
      best = npc;
      bestDistance = distanceToNpc;
    }
  });

  return best;
};

const canFight = (player: WulandPlayerSchema): boolean =>
  player.online && !player.sleeping && !player.defeated && player.hp > 0;

const canDamagePlayer = (player: WulandPlayerSchema): boolean =>
  !player.defeated && player.hp > 0;

const canDamageNpc = (npc: WulandNpcSchema): boolean =>
  !npc.defeated && npc.hp > 0;

const weaponTargetId = (target: WeaponTarget): string => {
  if (target.kind === "enemy") {
    return target.entity.enemyId;
  }

  if (target.kind === "npc") {
    return target.entity.npcId;
  }

  return target.entity.playerId;
};

const weaponTargetPosition = (target: WeaponTarget): WorldPosition => ({
  x: target.entity.x,
  y: target.entity.y
});

const distance = (a: WorldPosition, b: WorldPosition): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const hasLineOfSight = (from: WorldPosition, to: WorldPosition, mapId: WulandMapId): boolean => {
  const collisions = getMapCollisionRects(mapId);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length / 24));

  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;

    if (collidesWithWorld({ x: from.x + dx * t, y: from.y + dy * t }, collisions)) {
      return false;
    }
  }

  return true;
};

const vectorForDirection = (direction: Direction): WorldPosition => {
  if (direction === "left") {
    return { x: -1, y: 0 };
  }

  if (direction === "right") {
    return { x: 1, y: 0 };
  }

  if (direction === "up") {
    return { x: 0, y: -1 };
  }

  return { x: 0, y: 1 };
};

const isInFrontArc = (
  player: WulandPlayerSchema,
  target: WorldPosition,
  direction: Direction
): boolean => {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const length = Math.hypot(dx, dy);

  if (length <= 0) {
    return true;
  }

  const facing = vectorForDirection(direction);
  return (dx / length) * facing.x + (dy / length) * facing.y >= BASIC_FACING_DOT;
};

const isPlayerNearPortal = (
  player: WulandPlayerSchema,
  portal: PortalDefinition
): boolean => {
  if (portal.fromMapId !== normalizeMapId(player.mapId)) {
    return false;
  }

  if (portalAtPosition(normalizeMapId(player.mapId), player)?.id === portal.id) {
    return true;
  }

  const rect = portal.sourceRect;
  const nearest = {
    x: Math.max(rect.x, Math.min(player.x, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(player.y, rect.y + rect.height))
  };
  return distance(player, nearest) <= PORTAL_INTERACT_RANGE;
};

const normalizeHotbarSlot = (slotIndex: unknown): number =>
  typeof slotIndex === "number" &&
  Number.isInteger(slotIndex) &&
  slotIndex >= 0 &&
  slotIndex < HOTBAR_SLOT_COUNT
    ? slotIndex
    : 0;

const normalizeMoney = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : PLAYER_STARTING_MONEY;

const normalizeItemCharge = (
  itemDefinitionId: ItemDefinitionId | "",
  value: unknown
): number => {
  const maxCharge = defaultItemChargeMs(itemDefinitionId);

  if (maxCharge <= 0) {
    return 0;
  }

  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(maxCharge, Math.floor(value))
    : maxCharge;
};

const slotRecordFromSchema = (slot: WulandInventorySlotSchema): InventorySlotState => ({
  slotIndex: normalizeHotbarSlot(slot.slotIndex),
  itemDefinitionId: slot.itemDefinitionId as InventorySlotState["itemDefinitionId"],
  itemInstanceId: slot.itemInstanceId,
  quantity: slot.quantity,
  chargeRemainingMs: normalizeItemCharge(
    slot.itemDefinitionId as InventorySlotState["itemDefinitionId"],
    slot.chargeRemainingMs
  )
});

const applySlotRecord = (
  slot: WulandInventorySlotSchema,
  record: InventorySlotState
): void => {
  slot.slotIndex = normalizeHotbarSlot(record.slotIndex);
  slot.itemDefinitionId = record.itemDefinitionId;
  slot.itemInstanceId = record.itemInstanceId;
  slot.quantity = record.quantity;
  slot.chargeRemainingMs = normalizeItemCharge(record.itemDefinitionId, record.chargeRemainingMs);
};

const clearSlot = (slot: WulandInventorySlotSchema): void => {
  slot.itemDefinitionId = "";
  slot.itemInstanceId = "";
  slot.quantity = 0;
  slot.chargeRemainingMs = 0;
};

const removeOneFromSlot = (slot: WulandInventorySlotSchema): void => {
  slot.quantity -= 1;

  if (slot.quantity <= 0) {
    clearSlot(slot);
  }
};

const getInventorySlot = (
  player: WulandPlayerSchema,
  slotIndex: number
): WulandInventorySlotSchema | undefined =>
  player.inventory.find((slot) => slot.slotIndex === slotIndex);

const inventorySlotAt = (
  player: WulandPlayerSchema,
  slotIndex: number
): InventorySlotState | null => {
  const slot = getInventorySlot(player, slotIndex);
  const record = slot ? slotRecordFromSchema(slot) : null;
  return record?.itemDefinitionId ? record : null;
};

const applyInventoryToSchema = (
  player: WulandPlayerSchema,
  inventory: InventorySlotState[] | undefined,
  seedPrefix: string,
  options: { starterWhenEmpty?: boolean } = {}
): void => {
  const source = normalizeInventory(inventory, seedPrefix, options);
  player.inventory.clear();
  source.forEach((slot) => {
    const slotSchema = new WulandInventorySlotSchema();
    applySlotRecord(slotSchema, slot);
    player.inventory.push(slotSchema);
  });
};

const inventoryFromSchema = (player: WulandPlayerSchema): InventorySlotState[] =>
  Array.from({ length: HOTBAR_SLOT_COUNT }, (_value, slotIndex) => {
    const slot = getInventorySlot(player, slotIndex);
    return slot
      ? slotRecordFromSchema(slot)
      : {
          slotIndex,
          itemDefinitionId: "",
          itemInstanceId: "",
          quantity: 0
        };
  });

const createInventoryItem = (
  itemDefinitionId: ItemDefinitionId,
  seedPrefix: string
): DroppedItemNetworkState => ({
  droppedItemId: "",
  itemDefinitionId,
  itemInstanceId: createItemInstanceId(
    itemDefinitionId,
    `${seedPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  ),
  quantity: 1,
  chargeRemainingMs: defaultItemChargeMs(itemDefinitionId),
  mapId: WULAND_MAP_ID,
  x: WULAND_MERCHANT.x,
  y: WULAND_MERCHANT.y,
  droppedByPlayerId: WULAND_MERCHANT.id,
  droppedAt: new Date().toISOString()
});

const canFitItemInInventory = (
  player: WulandPlayerSchema,
  item: DroppedItemNetworkState,
  definition: ItemDefinition
): boolean => {
  let remaining = Math.max(1, Math.floor(item.quantity));

  if (definition.stackable) {
    player.inventory.forEach((slot) => {
      if (
        slot.itemDefinitionId === item.itemDefinitionId &&
        slot.quantity > 0 &&
        slot.quantity < definition.maxStack
      ) {
        remaining -= Math.min(definition.maxStack - slot.quantity, remaining);
      }
    });
  }

  if (remaining <= 0) {
    return true;
  }

  const emptySlots = player.inventory.filter((slot) => !slot.itemDefinitionId).length;
  return emptySlots >= Math.ceil(remaining / definition.maxStack);
};

const addItemToInventory = (
  player: WulandPlayerSchema,
  item: DroppedItemNetworkState
): boolean => {
  const definition = ITEM_DEFINITIONS[item.itemDefinitionId];
  let remaining = Math.max(1, Math.floor(item.quantity));

  if (!canFitItemInInventory(player, item, definition)) {
    return false;
  }

  if (definition.stackable) {
    player.inventory.forEach((slot) => {
      if (
        remaining <= 0 ||
        slot.itemDefinitionId !== item.itemDefinitionId ||
        slot.quantity <= 0 ||
        slot.quantity >= definition.maxStack
      ) {
        return;
      }

      const moved = Math.min(definition.maxStack - slot.quantity, remaining);
      slot.quantity += moved;
      remaining -= moved;
    });

    if (remaining <= 0) {
      return true;
    }
  }

  while (remaining > 0) {
    const emptySlot = player.inventory.find((slot) => !slot.itemDefinitionId);

    if (!emptySlot) {
      return false;
    }

    emptySlot.itemDefinitionId = item.itemDefinitionId;
    emptySlot.itemInstanceId = item.itemInstanceId;
    emptySlot.quantity = Math.min(remaining, definition.maxStack);
    emptySlot.chargeRemainingMs = normalizeItemCharge(item.itemDefinitionId, item.chargeRemainingMs);
    remaining -= emptySlot.quantity;
  }

  return true;
};

const nearestDroppedItem = (
  position: WorldPosition & { mapId?: string },
  droppedItems: MapSchema<WulandDroppedItemSchema>,
  range: number
): WulandDroppedItemSchema | null => {
  let best: WulandDroppedItemSchema | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  droppedItems.forEach((item) => {
    const distanceToItem = distance(position, item);

    if (
      item.mapId === normalizeMapId(position.mapId) &&
      distanceToItem <= range &&
      distanceToItem < bestDistance
    ) {
      best = item;
      bestDistance = distanceToItem;
    }
  });

  return best;
};

const nearestGiftTarget = (
  giver: WulandPlayerSchema,
  players: MapSchema<WulandPlayerSchema>,
  range: number
): WulandPlayerSchema | null => {
  let best: WulandPlayerSchema | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  players.forEach((player) => {
    if (
      player.playerId === giver.playerId ||
      !player.online ||
      player.sleeping ||
      player.defeated ||
      normalizeMapId(player.mapId) !== normalizeMapId(giver.mapId)
    ) {
      return;
    }

    const distanceToPlayer = distance(giver, player);

    if (distanceToPlayer <= range && distanceToPlayer < bestDistance) {
      best = player;
      bestDistance = distanceToPlayer;
    }
  });

  return best;
};

const isNearMerchant = (player: WulandPlayerSchema): boolean =>
  normalizeMapId(player.mapId) === WULAND_MAP_ID &&
  distance(player, WULAND_MERCHANT) <= WULAND_MERCHANT.interactionRange;

const healAmountForItem = (definition: ItemDefinition): number => {
  if (
    definition.healAmountMin !== undefined &&
    definition.healAmountMax !== undefined &&
    definition.healAmountMax > definition.healAmountMin
  ) {
    const range = definition.healAmountMax - definition.healAmountMin;
    return Math.round(definition.healAmountMin + Math.random() * range);
  }

  return definition.healAmount ?? 0;
};

const sanitizeChatText = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_MESSAGE_LENGTH);

const randomBetween = (min: number, max: number): number =>
  min + Math.floor(Math.random() * Math.max(1, max - min));

const randomChoice = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)] ?? items[0];

const droppedItemFromRecord = (record: DroppedItemNetworkState): WulandDroppedItemSchema => {
  const droppedItem = new WulandDroppedItemSchema();
  droppedItem.droppedItemId = record.droppedItemId;
  droppedItem.itemDefinitionId = record.itemDefinitionId;
  droppedItem.itemInstanceId = record.itemInstanceId;
  droppedItem.quantity = record.quantity;
  droppedItem.chargeRemainingMs = normalizeItemCharge(record.itemDefinitionId, record.chargeRemainingMs);
  droppedItem.mapId = normalizeMapId(record.mapId);
  droppedItem.x = record.x;
  droppedItem.y = record.y;
  droppedItem.droppedByPlayerId = record.droppedByPlayerId;
  droppedItem.droppedAt = record.droppedAt;
  droppedItem.expiresAt = normalizeDroppedItemExpiresAt(record);
  return droppedItem;
};

const recordFromDroppedItem = (item: WulandDroppedItemSchema): DroppedItemNetworkState => ({
  droppedItemId: item.droppedItemId,
  itemDefinitionId: item.itemDefinitionId as ItemDefinitionId,
  itemInstanceId: item.itemInstanceId,
  quantity: item.quantity,
  chargeRemainingMs: normalizeItemCharge(item.itemDefinitionId as ItemDefinitionId, item.chargeRemainingMs),
  mapId: normalizeMapId(item.mapId),
  x: item.x,
  y: item.y,
  droppedByPlayerId: item.droppedByPlayerId,
  droppedAt: item.droppedAt,
  expiresAt: item.expiresAt
});

const normalizeDroppedItemExpiresAt = (item: DroppedItemNetworkState): number => {
  if (item.itemDefinitionId !== LIGHT_STICK_ITEM_ID) {
    return 0;
  }

  if (typeof item.expiresAt === "number" && Number.isFinite(item.expiresAt) && item.expiresAt > 0) {
    return Math.floor(item.expiresAt);
  }

  const droppedAtMs = Date.parse(item.droppedAt);
  return Number.isFinite(droppedAtMs)
    ? droppedAtMs + LIGHT_STICK_DURATION_MS
    : Date.now() + LIGHT_STICK_DURATION_MS;
};

const isExpiredLightStickRecord = (item: DroppedItemNetworkState, now: number): boolean =>
  item.itemDefinitionId === LIGHT_STICK_ITEM_ID &&
  normalizeDroppedItemExpiresAt(item) > 0 &&
  now >= normalizeDroppedItemExpiresAt(item);

const colorForItem = (itemDefinition: ItemDefinition): string => {
  if (itemDefinition.itemDefinitionId === "sword") {
    return "#f8f9fa";
  }

  if (itemDefinition.itemDefinitionId === "magic-wand") {
    return "#b197fc";
  }

  if (itemDefinition.itemDefinitionId === "rock") {
    return "#ced4da";
  }

  return "#91f2bd";
};

const schemaFromRecord = (record: PlayerNetworkState): WulandPlayerSchema => {
  const player = new WulandPlayerSchema();
  player.playerId = record.playerId;
  player.sessionId = record.online ? record.sessionId : "";
  player.name = record.name;
  player.className = record.className;
  player.gender = record.gender;
  player.skinTone = record.skinTone;
  player.hairStyle = record.hairStyle;
  player.hairColor = record.hairColor;
  player.outfitColor = record.outfitColor;
  player.accessory = record.accessory;
  player.spriteVariant = record.spriteVariant;
  player.mapId = normalizeMapId(record.mapId);
  player.x = record.x;
  player.y = record.y;
  player.direction = record.direction;
  player.moving = record.online ? record.moving : false;
  player.online = record.online;
  player.sleeping = record.sleeping || !record.online;
  player.role = record.role || CLASS_METADATA[record.className].futureRole;
  player.joinedAt = record.joinedAt;
  player.lastSeenAt = record.lastSeenAt;
  player.lastSavedAt = record.lastSavedAt;
  player.money = normalizeMoney(record.money);
  player.maxHp = typeof record.maxHp === "number" && Number.isFinite(record.maxHp) && record.maxHp > 0
    ? record.maxHp
    : PLAYER_MAX_HP;
  player.hp = typeof record.hp === "number" && Number.isFinite(record.hp)
    ? Math.min(Math.max(0, record.hp), player.maxHp)
    : player.maxHp;
  player.shield = typeof record.shield === "number" && Number.isFinite(record.shield)
    ? Math.max(0, record.shield)
    : 0;
  player.defeated = Boolean(record.defeated);
  player.respawnAt = typeof record.respawnAt === "number" && Number.isFinite(record.respawnAt)
    ? record.respawnAt
    : 0;
  player.specialCooldownUntil = typeof record.specialCooldownUntil === "number" && Number.isFinite(record.specialCooldownUntil)
    ? record.specialCooldownUntil
    : 0;
  player.activeBuffs = record.activeBuffs ?? "";
  player.markedTargets = record.markedTargets ?? "";
  applyInventoryToSchema(player, record.inventory, record.playerId, {
    starterWhenEmpty: false
  });
  player.selectedHotbarSlot = normalizeHotbarSlot(record.selectedHotbarSlot);
  return player;
};

const recordFromSchema = (player: WulandPlayerSchema): PlayerNetworkState => ({
  playerId: player.playerId,
  sessionId: player.sessionId,
  name: player.name,
  className: player.className as PlayerNetworkState["className"],
  gender: player.gender as PlayerNetworkState["gender"],
  skinTone: player.skinTone as PlayerNetworkState["skinTone"],
  hairStyle: player.hairStyle as PlayerNetworkState["hairStyle"],
  hairColor: player.hairColor as PlayerNetworkState["hairColor"],
  outfitColor: player.outfitColor as PlayerNetworkState["outfitColor"],
  accessory: player.accessory as PlayerNetworkState["accessory"],
  spriteVariant: player.spriteVariant as PlayerNetworkState["spriteVariant"],
  mapId: normalizeMapId(player.mapId),
  x: player.x,
  y: player.y,
  direction: player.direction,
  moving: player.moving,
  online: player.online,
  sleeping: player.sleeping,
  hp: player.hp,
  maxHp: player.maxHp,
  shield: player.shield,
  defeated: player.defeated,
  respawnAt: player.respawnAt,
  specialCooldownUntil: player.specialCooldownUntil,
  activeBuffs: player.activeBuffs,
  markedTargets: player.markedTargets,
  inventory: inventoryFromSchema(player),
  selectedHotbarSlot: normalizeHotbarSlot(player.selectedHotbarSlot),
  money: normalizeMoney(player.money),
  role: player.role,
  joinedAt: player.joinedAt,
  lastSeenAt: player.lastSeenAt,
  lastSavedAt: player.lastSavedAt
});
