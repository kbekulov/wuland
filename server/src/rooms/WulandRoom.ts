import { Client, Room } from "colyseus";
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  CLASS_METADATA,
  DEFAULT_OFFLINE_PLAYER_TTL_HOURS,
  ENEMY_DEFINITIONS,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  NETWORK_TICK_RATE,
  PLAYER_MAX_HP,
  PLAYER_MOVE_SPEED,
  PLAYER_RESPAWN_MS,
  WULAND_ENEMY_SPAWNS,
  WULAND_MAP_ID,
  WULAND_MERCHANT,
  WULAND_MERCHANT_STOCK,
  WULAND_WORLD,
  applyServerMovement,
  applyServerVectorMovement,
  clampMapPosition,
  clampWorldPosition,
  collidesWithWorld,
  createItemInstanceId,
  getMapCollisionRects,
  getMapDefinition,
  isBuyItemRequest,
  isCakeItemDefinitionId,
  isCombatRequest,
  isGiftItemRequest,
  isHotbarSelectRequest,
  isInventoryMoveRequest,
  isInventorySlotRequest,
  isMoveTargetRequest,
  isMovementInput,
  isPickupItemRequest,
  isPortalTransitionRequest,
  isValidLocalProgress,
  isValidMapPosition,
  isValidPlayerProfile,
  normalizeMapId,
  normalizeInventory,
  portalAtPosition,
  portalsForMap,
  type CombatEvent,
  type CombatRequest,
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
  type PlayerNetworkState,
  type PlayerProfile,
  type PortalDefinition,
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
const PORTAL_INTERACT_RANGE = 84;
const DROP_OFFSET = 34;

export class WulandInventorySlotSchema extends Schema {
  @type("number") slotIndex = 0;
  @type("string") itemDefinitionId = "";
  @type("string") itemInstanceId = "";
  @type("number") quantity = 0;
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
  @type("string") mapId: WulandMapId = WULAND_MAP_ID;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") droppedByPlayerId = "";
  @type("string") droppedAt = "";
}

export class WulandRoomState extends Schema {
  @type({ map: WulandPlayerSchema }) players = new MapSchema<WulandPlayerSchema>();
  @type({ map: WulandEnemySchema }) enemies = new MapSchema<WulandEnemySchema>();
  @type({ map: WulandDroppedItemSchema }) droppedItems = new MapSchema<WulandDroppedItemSchema>();
  @type("number") totalPlayers = 0;
  @type("number") onlinePlayers = 0;
  @type("number") sleepingPlayers = 0;
  @type("number") totalEnemies = 0;
  @type("number") aliveEnemies = 0;
  @type("number") totalDroppedItems = 0;
}

interface WulandRoomOptions {
  playerStore: PlayerStore;
  offlinePlayerTtlHours?: number;
  enemyAiPaused?: boolean;
}

export class WulandRoom extends Room<WulandRoomState> {
  private playerStore!: PlayerStore;
  private readonly inputs = new Map<string, MovementInput>();
  private readonly moveTargets = new Map<string, MoveTargetRequest>();
  private readonly sessionToPlayerId = new Map<string, string>();
  private readonly lastPersistedPosition = new Map<string, { x: number; y: number; at: number }>();
  private readonly lastBasicAttack = new Map<string, number>();
  private readonly enemyContactTimes = new Map<string, number>();
  private enemyAiPaused = false;
  private combatEventCounter = 0;

  onCreate(options: WulandRoomOptions): void {
    this.roomId = ROOM_ID;
    this.maxClients = 100;
    this.autoDispose = false;
    this.patchRate = 1000 / NETWORK_TICK_RATE;
    this.playerStore = options.playerStore;
    this.enemyAiPaused = options.enemyAiPaused ?? false;

    this.setState(new WulandRoomState());
    this.playerStore.allVisiblePlayers().forEach((player) => {
      this.state.players.set(player.playerId, schemaFromRecord(player));
      this.lastPersistedPosition.set(player.playerId, {
        x: player.x,
        y: player.y,
        at: Date.now()
      });
    });
    this.playerStore.allDroppedItems().forEach((item) => {
      this.state.droppedItems.set(item.droppedItemId, droppedItemFromRecord(item));
    });
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

    this.onMessage("buyItem", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isBuyItemRequest(message)) {
        return;
      }

      this.buyItem(playerId, message.itemDefinitionId);
    });

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

    this.setSimulationInterval(
      (deltaMs) => this.updateSimulation(deltaMs),
      1000 / NETWORK_TICK_RATE
    );

    this.clock.setInterval(() => this.cleanupExpiredOfflinePlayers(), CLEANUP_INTERVAL_MS);
  }

  onAuth(_client: Client, options: unknown): WulandJoinOptions {
    const joinOptions = validateJoinOptions(options);
    const existing = this.state.players.get(joinOptions.profile.playerId);

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

    applyProfileToSchema(player, options.profile);
    resetPlayerCombat(player);
    applyInventoryToSchema(player, inventory, options.profile.playerId);
    player.selectedHotbarSlot = normalizeHotbarSlot(
      stored?.selectedHotbarSlot ?? existingRecord?.selectedHotbarSlot ?? player.selectedHotbarSlot
    );
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
    this.updateCounts();
  }

  async onDispose(): Promise<void> {
    await this.playerStore.saveNow();
  }

  private updateSimulation(deltaMs: number): void {
    const now = Date.now();
    let anyCountChange = false;

    this.state.players.forEach((player) => {
      if (!player.online) {
        return;
      }

      if (player.defeated) {
        player.moving = false;

        if (player.respawnAt > 0 && now >= player.respawnAt) {
          player.mapId = WULAND_MAP_ID;
          player.x = WULAND_WORLD.defaultSpawn.x;
          player.y = WULAND_WORLD.defaultSpawn.y;
          player.hp = player.maxHp;
          player.shield = 0;
          player.defeated = false;
          player.respawnAt = 0;
          this.broadcastCombatEvent("respawn", player.playerId, player.playerId, player.x, player.y, 0, "respawn", "#91f2bd");
        }

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
      this.persistIfNeeded(player);
      anyCountChange = true;
    });

    this.updateEnemies(deltaMs, now);

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

  private spawnInitialEnemies(): void {
    WULAND_ENEMY_SPAWNS.forEach((spawn) => {
      this.state.enemies.set(spawn.id, enemyFromSpawn(spawn.id, spawn.type, spawn.x, spawn.y, spawn.mapId));
    });
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

      if (this.enemyAiPaused) {
        enemy.targetPlayerId = "";
        return;
      }

      const definition = ENEMY_DEFINITIONS[enemy.type as EnemyType];
      const target = this.findEnemyTarget(enemy, definition);
      enemy.targetPlayerId = target?.playerId ?? "";

      if (target) {
        this.moveEnemyToward(enemy, { x: target.x, y: target.y }, definition.speed, deltaMs);
        this.applyContactDamage(enemy, target, definition, now);
        return;
      }

      const phase = (now / 1000 + enemy.enemyId.length * 0.47) % (Math.PI * 2);
      const wanderTarget = {
        x: enemy.spawnX + Math.cos(phase) * 42,
        y: enemy.spawnY + Math.sin(phase * 0.8) * 34
      };
      this.moveEnemyToward(enemy, wanderTarget, definition.speed * 0.35, deltaMs);
    });
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

      if (distanceToEnemy > definition.aggroRange) {
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
    this.damagePlayer(player, definition.damage, enemy.enemyId, now);
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
    this.damageEnemy(target, damage, player, now, itemDefinition.displayName);

    this.broadcastCombatEvent(
      "weapon",
      player.playerId,
      target.enemyId,
      target.x,
      target.y,
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
  ): WulandEnemySchema | null {
    const range = itemDefinition.range ?? 0;

    if (request.targetEnemyId) {
      const requested = this.state.enemies.get(request.targetEnemyId);

      if (
        requested?.alive &&
        normalizeMapId(requested.mapId) === normalizeMapId(player.mapId) &&
        distance(player, requested) <= range &&
        (itemDefinition.attackShape !== "arc" || isInFrontArc(player, requested, request.direction ?? player.direction))
      ) {
        return requested;
      }
    }

    const direction = request.direction ?? player.direction;
    const facing = vectorForDirection(direction);
    let best: WulandEnemySchema | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.state.enemies.forEach((enemy) => {
      if (!enemy.alive) {
        return;
      }

      if (normalizeMapId(enemy.mapId) !== normalizeMapId(player.mapId)) {
        return;
      }

      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distanceToEnemy = Math.hypot(dx, dy);

      if (distanceToEnemy > range) {
        return;
      }

      const dot = distanceToEnemy > 0
        ? (dx / distanceToEnemy) * facing.x + (dy / distanceToEnemy) * facing.y
        : 1;

      if (
        (itemDefinition.attackShape !== "arc" || dot >= BASIC_FACING_DOT) &&
        dot >= (itemDefinition.attackShape === "projectile" ? Math.cos((110 * Math.PI) / 180) : BASIC_FACING_DOT) &&
        distanceToEnemy < bestDistance
      ) {
        bestDistance = distanceToEnemy;
        best = enemy;
      }
    });

    return best;
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
    this.broadcastCombatEvent("enemy-defeated", player.playerId, enemy.enemyId, enemy.x, enemy.y, 0, `${label} cleared`, "#91f2bd");
    this.updateCounts();
  }

  private damagePlayer(
    player: WulandPlayerSchema,
    amount: number,
    sourceId: string,
    now: number
  ): void {
    if (!canFight(player)) {
      return;
    }

    const rounded = Math.max(1, Math.round(amount));
    const shieldDamage = Math.min(player.shield, rounded);
    player.shield = Math.max(0, player.shield - shieldDamage);
    const hpDamage = rounded - shieldDamage;
    player.hp = Math.max(0, player.hp - hpDamage);
    this.broadcastCombatEvent("damage", sourceId, player.playerId, player.x, player.y, rounded, `-${rounded}`, "#ff8787");

    if (player.hp > 0) {
      return;
    }

    player.defeated = true;
    player.moving = false;
    player.respawnAt = now + PLAYER_RESPAWN_MS;
    this.inputs.set(player.playerId, { ...ZERO_INPUT });
    this.moveTargets.delete(player.playerId);
    this.broadcastCombatEvent("player-defeated", sourceId, player.playerId, player.x, player.y, 0, "defeated", "#ff8787");
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
      itemInstanceId: item.itemInstanceId,
      quantity: item.quantity,
      mapId,
      x: dropPosition.x,
      y: dropPosition.y,
      droppedByPlayerId: player.playerId,
      droppedAt: new Date().toISOString()
    });

    clearSlot(slot);
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

  private buyItem(playerId: string, itemDefinitionId: ItemDefinitionId): void {
    const player = this.state.players.get(playerId);
    const stockItem = WULAND_MERCHANT_STOCK.find((item) => item.itemDefinitionId === itemDefinitionId);

    if (!player || !player.online || player.sleeping || player.defeated || !stockItem) {
      return;
    }

    if (!isNearMerchant(player)) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Shop is too far away", "#ffd8a8");
      return;
    }

    const item = createInventoryItem(itemDefinitionId, player.playerId);

    if (!addItemToInventory(player, item)) {
      this.broadcastCombatEvent("notice", player.playerId, player.playerId, player.x, player.y, 0, "Inventory full", "#ffd8a8");
      return;
    }

    this.persistPlayer(player);
    this.broadcastCombatEvent(
      "shop",
      player.playerId,
      player.playerId,
      player.x,
      player.y,
      0,
      `Bought ${ITEM_DEFINITIONS[itemDefinitionId].displayName}`,
      "#fff3bf",
      itemDefinitionId
    );
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

  private respawnEnemy(enemy: WulandEnemySchema): void {
    const definition = ENEMY_DEFINITIONS[enemy.type as EnemyType];
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
    this.broadcastCombatEvent("respawn", enemy.enemyId, enemy.enemyId, enemy.x, enemy.y, 0, "respawn", "#91f2bd");
    this.updateCounts();
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

  private mapIdForCombatEvent(sourceId: string, targetId: string): WulandMapId {
    return normalizeMapId(
      this.state.players.get(sourceId)?.mapId ??
      this.state.players.get(targetId)?.mapId ??
      this.state.enemies.get(sourceId)?.mapId ??
      this.state.enemies.get(targetId)?.mapId ??
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

const canFight = (player: WulandPlayerSchema): boolean =>
  player.online && !player.sleeping && !player.defeated && player.hp > 0;

const distance = (a: WorldPosition, b: WorldPosition): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

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

const slotRecordFromSchema = (slot: WulandInventorySlotSchema): InventorySlotState => ({
  slotIndex: normalizeHotbarSlot(slot.slotIndex),
  itemDefinitionId: slot.itemDefinitionId as InventorySlotState["itemDefinitionId"],
  itemInstanceId: slot.itemInstanceId,
  quantity: slot.quantity
});

const applySlotRecord = (
  slot: WulandInventorySlotSchema,
  record: InventorySlotState
): void => {
  slot.slotIndex = normalizeHotbarSlot(record.slotIndex);
  slot.itemDefinitionId = record.itemDefinitionId;
  slot.itemInstanceId = record.itemInstanceId;
  slot.quantity = record.quantity;
};

const clearSlot = (slot: WulandInventorySlotSchema): void => {
  slot.itemDefinitionId = "";
  slot.itemInstanceId = "";
  slot.quantity = 0;
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
  seedPrefix: string
): void => {
  const source = normalizeInventory(inventory, seedPrefix);
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

const droppedItemFromRecord = (record: DroppedItemNetworkState): WulandDroppedItemSchema => {
  const droppedItem = new WulandDroppedItemSchema();
  droppedItem.droppedItemId = record.droppedItemId;
  droppedItem.itemDefinitionId = record.itemDefinitionId;
  droppedItem.itemInstanceId = record.itemInstanceId;
  droppedItem.quantity = record.quantity;
  droppedItem.mapId = normalizeMapId(record.mapId);
  droppedItem.x = record.x;
  droppedItem.y = record.y;
  droppedItem.droppedByPlayerId = record.droppedByPlayerId;
  droppedItem.droppedAt = record.droppedAt;
  return droppedItem;
};

const recordFromDroppedItem = (item: WulandDroppedItemSchema): DroppedItemNetworkState => ({
  droppedItemId: item.droppedItemId,
  itemDefinitionId: item.itemDefinitionId as ItemDefinitionId,
  itemInstanceId: item.itemInstanceId,
  quantity: item.quantity,
  mapId: normalizeMapId(item.mapId),
  x: item.x,
  y: item.y,
  droppedByPlayerId: item.droppedByPlayerId,
  droppedAt: item.droppedAt
});

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
  resetPlayerCombat(player);
  applyInventoryToSchema(player, record.inventory, record.playerId);
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
  hp: PLAYER_MAX_HP,
  maxHp: PLAYER_MAX_HP,
  shield: 0,
  defeated: false,
  respawnAt: 0,
  specialCooldownUntil: 0,
  activeBuffs: "",
  markedTargets: "",
  inventory: inventoryFromSchema(player),
  selectedHotbarSlot: normalizeHotbarSlot(player.selectedHotbarSlot),
  role: player.role,
  joinedAt: player.joinedAt,
  lastSeenAt: player.lastSeenAt,
  lastSavedAt: player.lastSavedAt
});
