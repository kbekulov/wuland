import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  CLASS_COMBAT_METADATA,
  CLASS_METADATA,
  DEFAULT_OFFLINE_PLAYER_TTL_HOURS,
  ENEMY_DEFINITIONS,
  MARK_DAMAGE_MULTIPLIER,
  NETWORK_TICK_RATE,
  PLAYER_MAX_HP,
  PLAYER_MOVE_SPEED,
  PLAYER_RESPAWN_MS,
  WULAND_COLLISION_RECTS,
  WULAND_ENEMY_SPAWNS,
  WULAND_WORLD,
  applyServerMovement,
  applyServerVectorMovement,
  clampWorldPosition,
  collidesWithWorld,
  isCombatRequest,
  isMoveTargetRequest,
  isMovementInput,
  isValidLocalProgress,
  isValidPlayerProfile,
  isValidWorldPosition,
  type BuffType,
  type CombatEvent,
  type CombatRequest,
  type Direction,
  type EnemyNetworkState,
  type EnemyType,
  type LocalProgress,
  type MovementInput,
  type MoveTargetRequest,
  type PlayerClass,
  type PlayerNetworkState,
  type PlayerProfile,
  type WorldPosition,
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
const BUFF_DURATION_MS = 5200;
const MARK_DURATION_MS = 6500;
const WEAKEN_DURATION_MS = 6200;
const BASIC_FACING_DOT = Math.cos((85 * Math.PI) / 180);
const BASE_ASSIST_RANGE = 230;

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
  @type("string") role = "";
  @type("string") joinedAt = "";
  @type("string") lastSeenAt = "";
  @type("string") lastSavedAt = "";
}

export class WulandEnemySchema extends Schema {
  @type("string") enemyId = "";
  @type("string") type = "";
  @type("string") name = "";
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

export class WulandRoomState extends Schema {
  @type({ map: WulandPlayerSchema }) players = new MapSchema<WulandPlayerSchema>();
  @type({ map: WulandEnemySchema }) enemies = new MapSchema<WulandEnemySchema>();
  @type("number") totalPlayers = 0;
  @type("number") onlinePlayers = 0;
  @type("number") sleepingPlayers = 0;
  @type("number") totalEnemies = 0;
  @type("number") aliveEnemies = 0;
}

interface WulandRoomOptions {
  playerStore: PlayerStore;
  offlinePlayerTtlHours?: number;
}

export class WulandRoom extends Room<WulandRoomState> {
  private playerStore!: PlayerStore;
  private readonly inputs = new Map<string, MovementInput>();
  private readonly moveTargets = new Map<string, MoveTargetRequest>();
  private readonly sessionToPlayerId = new Map<string, string>();
  private readonly lastPersistedPosition = new Map<string, { x: number; y: number; at: number }>();
  private readonly lastBasicAttack = new Map<string, number>();
  private readonly enemyContactTimes = new Map<string, number>();
  private combatEventCounter = 0;
  private dynamicEnemyCounter = 0;

  onCreate(options: WulandRoomOptions): void {
    this.roomId = ROOM_ID;
    this.maxClients = 100;
    this.autoDispose = false;
    this.patchRate = 1000 / NETWORK_TICK_RATE;
    this.playerStore = options.playerStore;

    this.setState(new WulandRoomState());
    this.playerStore.allVisiblePlayers().forEach((player) => {
      this.state.players.set(player.playerId, schemaFromRecord(player));
      this.lastPersistedPosition.set(player.playerId, {
        x: player.x,
        y: player.y,
        at: Date.now()
      });
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

      this.moveTargets.set(playerId, clampWorldPosition(message));
    });

    this.onMessage("clearMoveTarget", (client) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (playerId) {
        this.moveTargets.delete(playerId);
      }
    });

    this.onMessage("basicAttack", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isCombatRequest(message)) {
        return;
      }

      this.handleBasicAttack(playerId, message);
    });

    this.onMessage("specialAbility", (client, message: unknown) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId || !isCombatRequest(message)) {
        return;
      }

      this.handleSpecialAbility(playerId, message);
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
    const preferredPosition =
      (stored && isValidWorldPosition({ x: stored.x, y: stored.y })
        ? { x: stored.x, y: stored.y }
        : null) ??
      (existing && isValidWorldPosition({ x: existing.x, y: existing.y })
        ? { x: existing.x, y: existing.y }
        : null) ??
      (options.localProgress && isValidWorldPosition(options.localProgress.lastPosition)
        ? options.localProgress.lastPosition
        : null) ??
      WULAND_WORLD.defaultSpawn;
    const position = clampWorldPosition(preferredPosition);
    const player = existing ?? new WulandPlayerSchema();

    applyProfileToSchema(player, options.profile);
    resetPlayerCombat(player);
    player.sessionId = client.sessionId;
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

      player.activeBuffs = pruneBuffs(player.activeBuffs, now);

      if (player.defeated) {
        player.moving = false;

        if (player.respawnAt > 0 && now >= player.respawnAt) {
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
      const moveDelta = hasBuff(player, "department-rally", now) ? deltaMs * 1.12 : deltaMs;
      const result = this.applyPlayerMovement(player, input, moveDelta);
      const timestamp = new Date().toISOString();

      player.x = result.position.x;
      player.y = result.position.y;
      player.direction = result.moving ? result.direction : player.direction;
      player.moving = result.moving;
      player.lastSeenAt = timestamp;

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

    if (hasDirectInput) {
      this.moveTargets.delete(player.playerId);
      return applyServerMovement(
        { x: player.x, y: player.y },
        input,
        deltaMs,
        WULAND_COLLISION_RECTS
      );
    }

    const target = this.moveTargets.get(player.playerId);

    if (!target) {
      return applyServerMovement(
        { x: player.x, y: player.y },
        ZERO_INPUT,
        deltaMs,
        WULAND_COLLISION_RECTS
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
      WULAND_COLLISION_RECTS
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
      this.state.enemies.set(spawn.id, enemyFromSpawn(spawn.id, spawn.type, spawn.x, spawn.y));
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

      const distanceToEnemy = distance(enemy, player);

      if (distanceToEnemy > definition.aggroRange) {
        return;
      }

      const className = player.className as PlayerClass;
      const clientPressure =
        enemy.type === "angry-client" || enemy.type === "escalation-demon";
      const score = clientPressure && className.includes("product owner")
        ? distanceToEnemy - 85
        : distanceToEnemy;

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
    let next = clampWorldPosition({
      x: enemy.x + vector.x * distanceToMove,
      y: enemy.y
    });

    if (collidesWithWorld(next, WULAND_COLLISION_RECTS)) {
      next = { x: enemy.x, y: enemy.y };
    }

    next = clampWorldPosition({
      x: next.x,
      y: next.y + vector.y * distanceToMove
    });

    if (collidesWithWorld(next, WULAND_COLLISION_RECTS)) {
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

  private handleBasicAttack(playerId: string, request: CombatRequest): void {
    const player = this.state.players.get(playerId);
    const now = Date.now();

    if (!player || !canFight(player)) {
      return;
    }

    const combat = CLASS_COMBAT_METADATA[player.className as PlayerClass];
    const previous = this.lastBasicAttack.get(playerId) ?? 0;

    if (now - previous < combat.basicCooldownMs) {
      return;
    }

    const target = this.resolveEnemyTarget(player, request, combat.basicRange, now);

    if (!target) {
      return;
    }

    this.lastBasicAttack.set(playerId, now);
    const damage = this.calculatePlayerDamage(player, target, combat.basicDamage, now);
    this.damageEnemy(target, damage, player, now, combat.basicName);

    if (player.className === "business analyst") {
      this.markEnemy(target, player.playerId, now, true);
    }

    this.broadcastCombatEvent(
      "basic",
      player.playerId,
      target.enemyId,
      target.x,
      target.y,
      damage,
      combat.basicName,
      combat.effectColor
    );
  }

  private handleSpecialAbility(playerId: string, request: CombatRequest): void {
    const player = this.state.players.get(playerId);
    const now = Date.now();

    if (!player || !canFight(player)) {
      return;
    }

    const playerClass = player.className as PlayerClass;
    const combat = CLASS_COMBAT_METADATA[playerClass];

    if (now < player.specialCooldownUntil) {
      return;
    }

    player.specialCooldownUntil = now + combat.specialCooldownMs;

    if (playerClass === "developer") {
      const target = this.resolveEnemyTarget(player, request, combat.specialRange, now);
      if (target) {
        const damage = this.calculatePlayerDamage(player, target, combat.specialDamage, now);
        this.damageEnemy(target, damage, player, now, combat.specialName);
        this.broadcastCombatEvent("special", player.playerId, target.enemyId, target.x, target.y, damage, combat.specialName, combat.effectColor);
      }
      return;
    }

    if (playerClass === "senior developer") {
      this.applyBuffAround(player, "rule-shield", combat.specialRange, now, 35);
      this.broadcastCombatEvent("shield", player.playerId, player.playerId, player.x, player.y, 35, combat.specialName, combat.effectColor);
      return;
    }

    if (playerClass === "business analyst") {
      const target = this.resolveEnemyTarget(player, request, combat.specialRange, now);
      if (target) {
        this.markEnemy(target, player.playerId, now, true);
        const damage = target.type === "scope-blob"
          ? Math.round(combat.specialDamage * 1.5)
          : combat.specialDamage;
        this.damageEnemy(target, damage, player, now, combat.specialName);

        if (target.type === "scope-blob") {
          this.spawnScopeShards(target);
        }

        this.broadcastCombatEvent("mark", player.playerId, target.enemyId, target.x, target.y, damage, combat.specialName, combat.effectColor);
      }
      return;
    }

    if (playerClass === "senior business analyst") {
      const enemies = this.enemiesNear(player, combat.specialRange).slice(0, 5);
      enemies.forEach((enemy) => {
        this.markEnemy(enemy, player.playerId, now, true);
        this.damageEnemy(enemy, combat.specialDamage, player, now, combat.specialName);
      });
      this.applyBuffAround(player, "clarity", BASE_ASSIST_RANGE, now, 0);
      this.broadcastCombatEvent("mark", player.playerId, player.playerId, player.x, player.y, enemies.length, combat.specialName, combat.effectColor);
      return;
    }

    if (playerClass === "product owner") {
      this.applyBuffAround(player, "take-the-hit", combat.specialRange, now, 24);
      this.broadcastCombatEvent("shield", player.playerId, player.playerId, player.x, player.y, 24, combat.specialName, combat.effectColor);
      return;
    }

    if (playerClass === "senior product owner") {
      this.applyBuffAround(player, "department-rally", combat.specialRange, now, 18);
      this.broadcastCombatEvent("buff", player.playerId, player.playerId, player.x, player.y, 18, combat.specialName, combat.effectColor);
      return;
    }

    if (playerClass === "architect") {
      const enemies = this.enemiesNear(player, combat.specialRange);
      enemies.forEach((enemy) => {
        const damage = this.calculatePlayerDamage(player, enemy, combat.specialDamage, now);
        this.damageEnemy(enemy, damage, player, now, combat.specialName);
      });
      this.applyBuffAround(player, "platform-zone", combat.specialRange, now, 14);
      this.broadcastCombatEvent("special", player.playerId, player.playerId, player.x, player.y, enemies.length, combat.specialName, combat.effectColor);
    }
  }

  private resolveEnemyTarget(
    player: WulandPlayerSchema,
    request: CombatRequest,
    range: number,
    now: number
  ): WulandEnemySchema | null {
    const effectiveRange = hasNearbyClass(player, this.state.players, ["senior business analyst"], 220)
      ? range + 24
      : range;

    if (request.targetEnemyId) {
      const requested = this.state.enemies.get(request.targetEnemyId);

      if (requested?.alive && distance(player, requested) <= effectiveRange) {
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

      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distanceToEnemy = Math.hypot(dx, dy);

      if (distanceToEnemy > effectiveRange) {
        return;
      }

      const dot = distanceToEnemy > 0
        ? (dx / distanceToEnemy) * facing.x + (dy / distanceToEnemy) * facing.y
        : 1;
      const markedPriority = enemy.markedUntil > now ? -35 : 0;

      if (dot >= BASIC_FACING_DOT && distanceToEnemy + markedPriority < bestDistance) {
        bestDistance = distanceToEnemy + markedPriority;
        best = enemy;
      }
    });

    return best ?? nearestAliveEnemy(player, this.state.enemies, effectiveRange);
  }

  private calculatePlayerDamage(
    player: WulandPlayerSchema,
    enemy: WulandEnemySchema,
    baseDamage: number,
    now: number
  ): number {
    let damage = baseDamage;
    const playerClass = player.className as PlayerClass;

    if (
      playerClass === "developer" &&
      (enemy.type === "bug" || enemy.type === "task-slime" || enemy.type === "broken-bot")
    ) {
      damage += 7;
    }

    if (playerClass === "architect" && enemy.type === "legacy-system-golem") {
      damage += 10;
    }

    if (
      playerClass === "developer" &&
      enemy.markedUntil > now &&
      this.state.players.get(enemy.markedBy)?.className === "business analyst"
    ) {
      damage *= MARK_DAMAGE_MULTIPLIER;
    }

    if (enemy.weakenedUntil > now) {
      damage *= 1.18;
    }

    if (hasBuff(player, "department-rally", now)) {
      damage *= 1.2;
    }

    return Math.max(1, Math.round(damage));
  }

  private markEnemy(
    enemy: WulandEnemySchema,
    playerId: string,
    now: number,
    weaken: boolean
  ): void {
    enemy.markedBy = playerId;
    enemy.markedUntil = now + MARK_DURATION_MS;
    enemy.weakenedUntil = weaken ? now + WEAKEN_DURATION_MS : enemy.weakenedUntil;
    const player = this.state.players.get(playerId);

    if (player) {
      player.markedTargets = enemy.enemyId;
    }
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

    let damage = amount;
    const playerClass = player.className as PlayerClass;

    if (playerClass === "senior developer") {
      damage *= 0.86;
    }

    if (
      playerClass === "product owner" &&
      hasNearbyClass(player, this.state.players, ["business analyst", "senior business analyst", "developer"], 210)
    ) {
      damage *= 0.84;
    }

    if (hasBuff(player, "rule-shield", now)) {
      damage *= 0.72;
    }

    if (hasBuff(player, "take-the-hit", now) || hasBuff(player, "department-rally", now)) {
      damage *= 0.82;
    }

    if (hasBuff(player, "platform-zone", now)) {
      damage *= 0.88;
    }

    const rounded = Math.max(1, Math.round(damage));
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

  private enemiesNear(position: WorldPosition, range: number): WulandEnemySchema[] {
    const enemies: WulandEnemySchema[] = [];

    this.state.enemies.forEach((enemy) => {
      if (enemy.alive && distance(position, enemy) <= range) {
        enemies.push(enemy);
      }
    });

    return enemies.sort((a, b) => distance(position, a) - distance(position, b));
  }

  private applyBuffAround(
    caster: WulandPlayerSchema,
    buff: BuffType,
    range: number,
    now: number,
    shield: number
  ): void {
    const duration = caster.className === "senior product owner"
      ? BUFF_DURATION_MS + 1300
      : BUFF_DURATION_MS;

    this.state.players.forEach((player) => {
      if (!canFight(player) || distance(caster, player) > range) {
        return;
      }

      player.activeBuffs = setBuff(player.activeBuffs, buff, now + duration);
      player.shield = Math.min(80, Math.max(player.shield, shield));
    });
  }

  private spawnScopeShards(scopeBlob: WulandEnemySchema): void {
    for (let index = 0; index < 2; index += 1) {
      this.dynamicEnemyCounter += 1;
      const offset = index === 0 ? -34 : 34;
      const enemyId = `scope-shard-${this.dynamicEnemyCounter}`;
      this.state.enemies.set(
        enemyId,
        enemyFromSpawn(enemyId, "task-slime", scopeBlob.x + offset, scopeBlob.y + 18)
      );
    }

    this.updateCounts();
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
    color: string
  ): void {
    this.combatEventCounter += 1;
    this.broadcast("combatEvent", {
      id: `${Date.now()}-${this.combatEventCounter}`,
      type,
      sourceId,
      targetId,
      x,
      y,
      value,
      text,
      color
    } satisfies CombatEvent);
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
  player.role = CLASS_COMBAT_METADATA[profile.class].role;
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
  y: number
): WulandEnemySchema => {
  const definition = ENEMY_DEFINITIONS[type];
  const enemy = new WulandEnemySchema();
  enemy.enemyId = enemyId;
  enemy.type = type;
  enemy.name = definition.displayName;
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

const nearestAliveEnemy = (
  position: WorldPosition,
  enemies: MapSchema<WulandEnemySchema>,
  range: number
): WulandEnemySchema | null => {
  let best: WulandEnemySchema | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  enemies.forEach((enemy) => {
    const distanceToEnemy = distance(position, enemy);

    if (enemy.alive && distanceToEnemy <= range && distanceToEnemy < bestDistance) {
      best = enemy;
      bestDistance = distanceToEnemy;
    }
  });

  return best;
};

const hasNearbyClass = (
  player: WulandPlayerSchema,
  players: MapSchema<WulandPlayerSchema>,
  classNames: PlayerClass[],
  range: number
): boolean => {
  let found = false;

  players.forEach((other) => {
    if (
      other.playerId !== player.playerId &&
      canFight(other) &&
      classNames.includes(other.className as PlayerClass) &&
      distance(player, other) <= range
    ) {
      found = true;
    }
  });

  return found;
};

const parseBuffs = (activeBuffs: string): Array<{ type: BuffType; until: number }> =>
  activeBuffs
    .split("|")
    .filter(Boolean)
    .map((entry) => {
      const [type, until] = entry.split(":");
      return {
        type: type as BuffType,
        until: Number.parseInt(until ?? "0", 10)
      };
    })
    .filter((entry) => Number.isFinite(entry.until));

const serializeBuffs = (buffs: Array<{ type: BuffType; until: number }>): string =>
  buffs.map((buff) => `${buff.type}:${buff.until}`).join("|");

const pruneBuffs = (activeBuffs: string, now: number): string =>
  serializeBuffs(parseBuffs(activeBuffs).filter((buff) => buff.until > now));

const setBuff = (activeBuffs: string, type: BuffType, until: number): string => {
  const buffs = parseBuffs(activeBuffs).filter((buff) => buff.type !== type);
  buffs.push({ type, until });
  return serializeBuffs(buffs);
};

const hasBuff = (player: WulandPlayerSchema, type: BuffType, now: number): boolean =>
  parseBuffs(player.activeBuffs).some((buff) => buff.type === type && buff.until > now);

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
  role: player.role,
  joinedAt: player.joinedAt,
  lastSeenAt: player.lastSeenAt,
  lastSavedAt: player.lastSavedAt
});
