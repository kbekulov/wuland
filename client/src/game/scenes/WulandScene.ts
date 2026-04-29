import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CHAT_MAX_MESSAGE_LENGTH,
  CLASS_METADATA,
  ENEMY_DEFINITIONS,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  WULAND_AMBIENT_NPCS,
  MAP_ID_TO_BUILDING_NAME,
  WULAND_MAP_ID,
  WULAND_MAPS,
  WULAND_WORLD,
  WULAND_MERCHANT,
  clampMapPosition,
  collidesWithMap,
  getMapDefinition,
  getMapDisplayName,
  isCakeItemDefinitionId,
  portalAtPosition,
  portalsForMap,
  type AmbientNpcNetworkState,
  type ChatMessage,
  type BuildingName,
  type CombatEvent,
  type Direction,
  type DroppedItemNetworkState,
  type EnemyNetworkState,
  type ForceDeletedEvent,
  type InventorySlotState,
  type ItemDefinitionId,
  type LocalProgress,
  type MovementInput,
  type PlayerNetworkState,
  type PlayerProfile,
  type PortalDefinition,
  type SpeechBubbleEvent,
  type WulandMapId
} from "@wuland/shared";
import {
  clearAllSaveData,
  createInitialProgress,
  loadPlayerProfile,
  loadProgress,
  saveProgress
} from "../../persistence/localSave.ts";
import {
  characterTextureProfileFromNetwork,
  createCharacterTexture
} from "../player/characterTexture.ts";
import { BUILDING_LAYOUT, TREE_OBSTACLES, type BuildingDefinition } from "../world/buildings.ts";
import {
  getWulandServerUrl,
  joinWulandRoom,
  type WulandClientRoom,
  type WulandRoomState
} from "../../network/wulandClient.ts";

interface WulandSceneData {
  profile?: PlayerProfile | null;
  progress?: LocalProgress | null;
}

interface WasdKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

interface CombatKeys {
  attack: Phaser.Input.Keyboard.Key;
  use: Phaser.Input.Keyboard.Key;
  pickup: Phaser.Input.Keyboard.Key;
  gift: Phaser.Input.Keyboard.Key;
  hotbar: Phaser.Input.Keyboard.Key[];
}

interface PlayerAvatar {
  playerId: string;
  sprite: Phaser.GameObjects.Sprite;
  aura: Phaser.GameObjects.Arc;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  shieldFill: Phaser.GameObjects.Rectangle;
  nameLabel: Phaser.GameObjects.Text;
  classLabel: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
  sleepLabel: Phaser.GameObjects.Text;
  target: Phaser.Math.Vector2;
  lastState: PlayerNetworkState;
}

interface EnemyAvatar {
  enemyId: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  accent: Phaser.GameObjects.Arc;
  selectionRing: Phaser.GameObjects.Arc;
  markLabel: Phaser.GameObjects.Text;
  nameLabel: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  target: Phaser.Math.Vector2;
  lastState: EnemyNetworkState;
}

interface DroppedItemAvatar {
  droppedItemId: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  iconLabel: Phaser.GameObjects.Text;
  nameLabel: Phaser.GameObjects.Text;
  lastState: DroppedItemNetworkState;
}

interface NpcAvatar {
  npcId: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  accent: Phaser.GameObjects.Rectangle;
  nameLabel: Phaser.GameObjects.Text;
  speechLabel: Phaser.GameObjects.Text;
  target: Phaser.Math.Vector2;
  lastState: AmbientNpcNetworkState;
}

export interface WulandConnectionState {
  status: "connecting" | "connected" | "disconnected" | "error";
  message: string;
  totalPlayers: number;
  onlinePlayers: number;
  sleepingPlayers: number;
  totalEnemies: number;
  aliveEnemies: number;
  localHp: number;
  localMaxHp: number;
  localShield: number;
  defeated: boolean;
  inventory: InventorySlotState[];
  selectedHotbarSlot: number;
  activeItemName: string;
  nearbyPickupName: string;
  nearMerchant: boolean;
  nearbyPortalId: string;
  portalPrompt: string;
  nearbyGiftPlayerName: string;
  currentMapId: WulandMapId;
  currentMapName: string;
  totalDroppedItems: number;
  godModeAvailable: boolean;
  godModeCodeRequired: boolean;
  godModeActive: boolean;
}

const ZERO_INPUT: MovementInput = {
  left: false,
  right: false,
  up: false,
  down: false
};

const INPUT_RESEND_MS = 175;

export class WulandScene extends Phaser.Scene {
  private profile!: PlayerProfile;
  private progress!: LocalProgress;
  private visitedBuildings = new Set<BuildingName>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: WasdKeys;
  private combatKeys?: CombatKeys;
  private debugKey?: Phaser.Input.Keyboard.Key;
  private room?: WulandClientRoom;
  private mobileRoot?: HTMLDivElement;
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private avatars = new Map<string, PlayerAvatar>();
  private enemyAvatars = new Map<string, EnemyAvatar>();
  private droppedItemAvatars = new Map<string, DroppedItemAvatar>();
  private npcAvatars = new Map<string, NpcAvatar>();
  private latestPlayers = new Map<string, PlayerNetworkState>();
  private latestEnemies = new Map<string, EnemyNetworkState>();
  private latestDroppedItems = new Map<string, DroppedItemNetworkState>();
  private latestNpcs = new Map<string, AmbientNpcNetworkState>();
  private currentMapId: WulandMapId = WULAND_MAP_ID;
  private connectionState: WulandConnectionState = {
    status: "connecting",
    message: "Connecting to WULAND server",
    totalPlayers: 0,
    onlinePlayers: 0,
    sleepingPlayers: 0,
    totalEnemies: 0,
    aliveEnemies: 0,
    localHp: 0,
    localMaxHp: 0,
    localShield: 0,
    defeated: false,
    inventory: createEmptyClientInventory(),
    selectedHotbarSlot: 0,
    activeItemName: "No item",
    nearbyPickupName: "",
    nearMerchant: false,
    nearbyPortalId: "",
    portalPrompt: "",
    nearbyGiftPlayerName: "",
    currentMapId: WULAND_MAP_ID,
    currentMapName: getMapDisplayName(WULAND_MAP_ID),
    totalDroppedItems: 0,
    godModeAvailable: false,
    godModeCodeRequired: false,
    godModeActive: false
  };
  private godModeActive = false;
  private godModeCode = "";
  private selectedEnemyId = "";
  private virtualInput: MovementInput = { ...ZERO_INPUT };
  private clickTarget?: Phaser.Math.Vector2;
  private destinationMarker?: Phaser.GameObjects.Arc;
  private merchantBubble?: Phaser.GameObjects.Text;
  private merchantSpeechTimer?: Phaser.Time.TimerEvent;
  private targetStartedAt = 0;
  private lastTargetDistance = Number.POSITIVE_INFINITY;
  private lastTargetProgressAt = 0;
  private lastInput: MovementInput = { ...ZERO_INPUT };
  private lastSentInput: MovementInput = { ...ZERO_INPUT };
  private lastInputSentAt = 0;
  private lastProgressSave = 0;
  private leavingRoom = false;
  private deletedByServer = false;
  private sceneActive = false;
  private readonly handleWindowBlur = (): void => {
    this.lastInput = { ...ZERO_INPUT };
    this.virtualInput = { ...ZERO_INPUT };
    this.sendMovementInput(ZERO_INPUT, true);
  };

  constructor() {
    super("WulandScene");
  }

  create(data: WulandSceneData = {}): void {
    const profile = data.profile ?? loadPlayerProfile();

    if (!profile) {
      this.scene.start("CharacterSelectScene");
      return;
    }

    this.profile = profile;
    this.progress = this.resolveProgress(data.progress);
    this.visitedBuildings = new Set(this.progress.visitedBuildings);
    this.avatars.clear();
    this.enemyAvatars.clear();
    this.droppedItemAvatars.clear();
    this.npcAvatars.clear();
    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();
    this.latestNpcs.clear();
    this.selectedEnemyId = "";
    this.godModeActive = false;
    this.godModeCode = "";
    this.virtualInput = { ...ZERO_INPUT };
    this.clickTarget = undefined;
    this.currentMapId = data.progress?.currentMapId ?? this.progress?.currentMapId ?? WULAND_MAP_ID;
    this.targetStartedAt = 0;
    this.lastTargetDistance = Number.POSITIVE_INFINITY;
    this.lastTargetProgressAt = 0;
    this.leavingRoom = false;
    this.deletedByServer = false;
    this.sceneActive = true;
    this.connectionState = {
      status: "connecting",
      message: `Connecting to ${getWulandServerUrl()}`,
      totalPlayers: 0,
      onlinePlayers: 0,
      sleepingPlayers: 0,
      totalEnemies: 0,
      aliveEnemies: 0,
      localHp: 0,
      localMaxHp: 0,
      localShield: 0,
      defeated: false,
      inventory: createEmptyClientInventory(),
      selectedHotbarSlot: 0,
      activeItemName: "No item",
      nearbyPickupName: "",
      nearMerchant: false,
      nearbyPortalId: "",
      portalPrompt: "",
      nearbyGiftPlayerName: "",
      currentMapId: this.currentMapId,
      currentMapName: getMapDisplayName(this.currentMapId),
      totalDroppedItems: 0,
      godModeAvailable: false,
      godModeCodeRequired: false,
      godModeActive: false
    };

    this.drawCurrentMap(this.currentMapId);
    this.createInput();
    this.mountMobileControls();

    this.scene.launch("UIScene", {
      profile: this.profile,
      progress: this.progress,
      connection: this.connectionState
    });
    this.emitConnectionState();

    this.game.events.on("wuland:editCharacter", this.openCharacterSelect, this);
    this.game.events.on("wuland:selectHotbarSlot", this.selectHotbarSlot, this);
    this.game.events.on("wuland:moveHotbarItem", this.moveHotbarItem, this);
    this.game.events.on("wuland:discardHotbarItem", this.discardHotbarItem, this);
    this.game.events.on("wuland:buyMerchantItem", this.buyMerchantItem, this);
    this.game.events.on("wuland:sendChat", this.sendChatMessage, this);
    this.game.events.on("wuland:setGodMode", this.setGodMode, this);
    window.addEventListener("blur", this.handleWindowBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    void this.connectToRoom();
  }

  update(time: number, delta: number): void {
    this.sendMovementInputForControls(time);
    this.sendCombatForKeyboard();
    this.updateAvatarPositions(delta);
    this.updateEnemyPositions(delta);
    this.updateNpcPositions(delta);

    const localPlayer = this.latestPlayers.get(this.profile.playerId);

    if (localPlayer) {
      this.updateClickTarget(localPlayer, time);
      this.updateInteractionContext(localPlayer);
      this.updateVisitedBuildings(localPlayer);

      if (time - this.lastProgressSave > 650) {
        this.saveCurrentProgress();
        this.lastProgressSave = time;
      }
    }
  }

  private resolveProgress(sceneProgress?: LocalProgress | null): LocalProgress {
    const savedProgress = sceneProgress ?? loadProgress();

    if (savedProgress?.playerId === this.profile.playerId) {
      return savedProgress;
    }

    return createInitialProgress(this.profile.playerId);
  }

  private async connectToRoom(): Promise<void> {
    this.setConnectionState({
      status: "connecting",
      message: `Connecting to ${getWulandServerUrl()}`
    });

    try {
      const room = await joinWulandRoom({
        profile: this.profile,
        localProgress: this.progress
      });

      if (!this.sceneActive) {
        void room.leave(true);
        return;
      }

      this.room = room;
      this.setConnectionState({
        status: "connected",
        message: `Connected to room ${room.roomId}`
      });
      room.onStateChange((state) => this.handleRoomState(state));
      room.onMessage("combatEvent", (event: CombatEvent) => this.handleCombatEvent(event));
      room.onMessage("chatMessage", (message: ChatMessage) => this.handleChatMessage(message));
      room.onMessage("speechBubble", (event: SpeechBubbleEvent) => this.handleSpeechBubble(event));
      room.onMessage("forceDeleted", (event: ForceDeletedEvent) => this.handleForceDeleted(event));
      room.onLeave((code, reason) => this.handleRoomLeave(code, reason));
      room.onError((code, message) => this.handleRoomError(code, message));
      this.handleRoomState(room.state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect to WULAND server";

      if (message.includes("PLAYER_DELETED")) {
        clearAllSaveData();
        this.deletedByServer = true;
        this.setConnectionState({
          status: "error",
          message: "Your character was deleted. Create a new one to re-enter WULAND."
        });
        this.scene.stop("UIScene");
        this.scene.start("CharacterSelectScene", {
          message: "Your character was deleted. Create a new one to re-enter WULAND."
        });
        return;
      }

      this.setConnectionState({
        status: "error",
        message
      });
    }
  }

  private drawCurrentMap(mapId: WulandMapId): void {
    this.clearWorldObjects();
    this.currentMapId = mapId;
    const map = getMapDefinition(mapId);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.setBackgroundColor(mapId === WULAND_MAP_ID ? "#6faa55" : "#243033");

    if (mapId === WULAND_MAP_ID) {
      this.drawVillage();
      return;
    }

    this.drawInterior(mapId);
  }

  private addWorld<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.worldObjects.push(object);
    return object;
  }

  private clearWorldObjects(): void {
    this.merchantSpeechTimer?.remove(false);
    this.merchantSpeechTimer = undefined;
    this.merchantBubble?.destroy();
    this.merchantBubble = undefined;
    this.worldObjects.forEach((object) => {
      this.tweens.killTweensOf(object);
      object.destroy();
    });
    this.worldObjects = [];
  }

  private drawVillage(): void {
    this.drawGround();
    this.drawPaths();
    this.drawBoundaryFence();
    this.drawDecorations();

    this.addWorld(this.add
      .text(WULAND_WORLD.width / 2, 92, "WULAND", {
        fontFamily: "Georgia, serif",
        fontSize: "44px",
        color: "#1f352d",
        stroke: "#f5f1d5",
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(5));

    BUILDING_LAYOUT.forEach((building) => this.drawBuilding(building));
    TREE_OBSTACLES.forEach((tree) => this.drawTree(tree.x, tree.y));
    this.drawPortalMarkers(WULAND_MAP_ID);
    this.drawMerchant();
  }

  private drawGround(): void {
    for (let y = 0; y < WULAND_WORLD.height; y += WULAND_WORLD.tileSize) {
      for (let x = 0; x < WULAND_WORLD.width; x += WULAND_WORLD.tileSize) {
        const key = (x / WULAND_WORLD.tileSize + y / WULAND_WORLD.tileSize) % 5 === 0
          ? "tile-grass-dark"
          : "tile-grass";
        this.addWorld(this.add.image(x, y, key).setOrigin(0).setDepth(0));
      }
    }
  }

  private drawPaths(): void {
    const graphics = this.addWorld(this.add.graphics());
    graphics.fillStyle(0xb9935a, 1);
    graphics.fillRect(744, 150, 112, 930);
    graphics.fillRect(230, 705, 1120, 104);
    graphics.fillRect(320, 460, 965, 82);
    graphics.fillStyle(0xd1ad73, 1);
    graphics.fillRect(760, 150, 80, 930);
    graphics.fillRect(230, 721, 1120, 72);
    graphics.fillRect(320, 474, 965, 54);
    graphics.setDepth(1);
  }

  private drawBoundaryFence(): void {
    const graphics = this.addWorld(this.add.graphics());
    graphics.fillStyle(0x705332, 1);
    graphics.fillRect(0, 0, WULAND_WORLD.width, 20);
    graphics.fillRect(0, WULAND_WORLD.height - 20, WULAND_WORLD.width, 20);
    graphics.fillRect(0, 0, 20, WULAND_WORLD.height);
    graphics.fillRect(WULAND_WORLD.width - 20, 0, 20, WULAND_WORLD.height);
    graphics.fillStyle(0x9a7544, 1);

    for (let x = 24; x < WULAND_WORLD.width - 24; x += 48) {
      graphics.fillRect(x, 4, 12, 28);
      graphics.fillRect(x, WULAND_WORLD.height - 32, 12, 28);
    }

    for (let y = 24; y < WULAND_WORLD.height - 24; y += 48) {
      graphics.fillRect(4, y, 28, 12);
      graphics.fillRect(WULAND_WORLD.width - 32, y, 28, 12);
    }

    graphics.setDepth(4);
  }

  private drawDecorations(): void {
    const graphics = this.addWorld(this.add.graphics());
    graphics.fillStyle(0x4e9c45, 1);

    for (let index = 0; index < 85; index += 1) {
      const x = 60 + ((index * 137) % (WULAND_WORLD.width - 120));
      const y = 80 + ((index * 89) % (WULAND_WORLD.height - 160));

      if (this.isNearMainPath(x, y)) {
        continue;
      }

      graphics.fillRect(x, y, 4, 12);
      graphics.fillRect(x - 4, y + 5, 12, 4);
    }

    graphics.setDepth(2);
  }

  private drawBuilding(building: BuildingDefinition): void {
    this.addWorld(this.add
      .rectangle(building.x + 8, building.y + 10, building.width, building.height, 0x000000, 0.18)
      .setDepth(8));

    this.addWorld(this.add
      .rectangle(building.x, building.y, building.width, building.height, building.bodyColor)
      .setStrokeStyle(3, 0x44372d)
      .setDepth(12));

    this.addWorld(this.add
      .rectangle(building.x, building.y - building.height / 2 + 12, building.width + 26, 32, building.roofColor)
      .setStrokeStyle(3, 0x2b211c)
      .setDepth(14));
    this.addWorld(this.add
      .rectangle(building.x, building.y + building.height / 2 - 23, 34, 45, 0x5c3d2e)
      .setStrokeStyle(2, 0x2d211a)
      .setDepth(16));
    this.addWorld(this.add.rectangle(building.x - 55, building.y - 8, 32, 28, 0xf8f9fa).setDepth(16));
    this.addWorld(this.add.rectangle(building.x + 55, building.y - 8, 32, 28, 0xf8f9fa).setDepth(16));
    this.addWorld(this.add
      .text(building.x, building.y + building.height / 2 + 25, building.name, {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#1b1c1d",
        backgroundColor: "#f7e6b7",
        padding: { x: 8, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(18));
  }

  private drawTree(x: number, y: number): void {
    this.addWorld(this.add.rectangle(x, y + 20, 18, 34, 0x795a37).setDepth(10));
    this.addWorld(this.add.circle(x, y, 32, 0x2f7d32).setDepth(11));
    this.addWorld(this.add.circle(x - 18, y + 10, 22, 0x3f9b42).setDepth(11));
    this.addWorld(this.add.circle(x + 20, y + 12, 24, 0x2f8f3a).setDepth(11));
  }

  private drawMerchant(): void {
    const { x, y } = WULAND_MERCHANT;

    this.addWorld(this.add.ellipse(x + 8, y + 28, 138, 34, 0x000000, 0.18).setDepth(18));
    this.addWorld(this.add
      .rectangle(x + 38, y + 6, 78, 48, 0x5b3b26, 0.98)
      .setStrokeStyle(3, 0x281914)
      .setDepth(24));
    this.addWorld(this.add.rectangle(x + 38, y - 24, 86, 18, 0xc7923e, 1).setDepth(26));
    this.addWorld(this.add.circle(x + 4, y + 33, 13, 0x2a1d19, 1).setDepth(27));
    this.addWorld(this.add.circle(x + 73, y + 33, 13, 0x2a1d19, 1).setDepth(27));
    this.addWorld(this.add.circle(x + 4, y + 33, 6, 0xc7a46b, 1).setDepth(28));
    this.addWorld(this.add.circle(x + 73, y + 33, 6, 0xc7a46b, 1).setDepth(28));
    this.addWorld(this.add.rectangle(x + 89, y - 2, 18, 64, 0x7a5234, 1).setDepth(23));
    this.addWorld(this.add.circle(x - 34, y - 13, 24, 0x2b1c2f, 1).setDepth(30));
    this.addWorld(this.add.circle(x - 34, y - 9, 16, 0xd9b384, 1).setDepth(31));
    this.addWorld(this.add
      .triangle(x - 34, y + 38, -33, -30, 33, -30, 0, 38, 0x39213f, 1)
      .setStrokeStyle(3, 0x1e1224)
      .setDepth(29));
    this.addWorld(this.add.rectangle(x - 62, y + 4, 22, 38, 0x765332, 1).setDepth(28));
    this.addWorld(this.add
      .text(x + 38, y - 51, "Odd Cart", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        color: "#fff8e7",
        backgroundColor: "rgba(34, 21, 16, 0.82)",
        padding: { x: 7, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(35));

    this.merchantSpeechTimer = this.time.addEvent({
      delay: 5200,
      loop: true,
      callback: () => this.showMerchantSpeechIfNearby()
    });
  }

  private drawInterior(mapId: WulandMapId): void {
    const map = WULAND_MAPS[mapId];
    const palette = interiorPaletteForMap(mapId);
    this.drawInteriorBase(map.displayName, palette.floor, palette.wall, palette.accent);

    if (mapId === "rpa_coe") {
      this.drawDesk(170, 170, "BA Desk");
      this.drawDesk(760, 170, "Dev Desk");
      this.drawTerminalBank(480, 132);
      this.drawServerRack(818, 368);
      this.drawTable(480, 364, "Sprint Table", 0x6f8795);
    } else if (mapId === "bathroom") {
      this.drawSinkRow();
      this.drawBathroomStalls();
      this.drawPropBox(200, 412, 74, 72, 0xc9d6dc, "Cart");
      this.drawMirror(254, 88);
    } else if (mapId === "kitchen") {
      this.drawCounter(344, 124, 500, "Prep Counter");
      this.drawPropBox(744, 140, 82, 104, 0xdce7ef, "Fridge");
      this.drawPropBox(845, 136, 74, 86, 0x4b5563, "Stove");
      this.drawTable(471, 350, "Lunch Table", 0xb77948);
      this.drawCounter(209, 522, 210, "Coffee");
    } else if (mapId === "busybeet") {
      this.drawNoticeBoard(218, 106);
      this.drawDesk(238, 244, "Focus");
      this.drawDesk(726, 244, "Flow");
      this.drawTable(481, 410, "Honeycomb", 0xeab308);
      this.drawPropBox(820, 478, 76, 92, 0x7c3aed, "Hive");
    } else if (mapId === "din_break") {
      this.drawCouch(229, 207, 0x3f8f6b);
      this.drawCouch(731, 207, 0x597fb8);
      this.drawTable(480, 350, "Coffee Table", 0x8b6f47);
      this.drawPropBox(796, 469, 72, 134, 0xbe123c, "Vend");
      this.drawCounter(229, 520, 226, "Snacks");
    }

    this.drawPortalMarkers(mapId);
  }

  private drawInteriorBase(
    title: string,
    floorColor: number,
    wallColor: number,
    accentColor: number
  ): void {
    const map = getMapDefinition(this.currentMapId);
    const graphics = this.addWorld(this.add.graphics());
    graphics.fillStyle(floorColor, 1);
    graphics.fillRect(0, 0, map.width, map.height);

    for (let y = 32; y < map.height - 32; y += 32) {
      for (let x = 32; x < map.width - 32; x += 32) {
        if ((x / 32 + y / 32) % 2 === 0) {
          graphics.fillStyle(0xffffff, 0.035);
          graphics.fillRect(x, y, 32, 32);
        }
      }
    }

    graphics.fillStyle(wallColor, 1);
    graphics.fillRect(0, 0, map.width, 32);
    graphics.fillRect(0, map.height - 32, 430, 32);
    graphics.fillRect(530, map.height - 32, 430, 32);
    graphics.fillRect(0, 0, 32, map.height);
    graphics.fillRect(map.width - 32, 0, 32, map.height);
    graphics.fillStyle(accentColor, 1);
    graphics.fillRect(32, 32, map.width - 64, 10);
    graphics.setDepth(2);

    this.addWorld(this.add
      .rectangle(480, 686, 100, 52, 0x5c3d2e, 1)
      .setStrokeStyle(3, 0xf7e6b7, 0.9)
      .setDepth(13));
    this.addWorld(this.add
      .text(480, 74, title, {
        fontFamily: "Georgia, serif",
        fontSize: "32px",
        color: "#fff8e7",
        stroke: "#172224",
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(15));
  }

  private drawPortalMarkers(mapId: WulandMapId): void {
    portalsForMap(mapId).forEach((portal) => {
      const centerX = portal.sourceRect.x + portal.sourceRect.width / 2;
      const centerY = portal.sourceRect.y + portal.sourceRect.height / 2;
      this.addWorld(this.add
        .rectangle(centerX, centerY, portal.sourceRect.width, portal.sourceRect.height, 0xfef08a, 0.14)
        .setStrokeStyle(2, 0xfff3bf, 0.75)
        .setDepth(34));
      const arrowY = portal.fromMapId === WULAND_MAP_ID
        ? portal.sourceRect.y - 18
        : portal.sourceRect.y - 20;
      const arrow = this.addWorld(this.add
        .triangle(centerX, arrowY, -14, -11, 14, -11, 0, 13, 0xfff3bf, 1)
        .setStrokeStyle(2, 0x442d12, 0.9)
        .setDepth(36));
      this.addWorld(this.add
        .text(centerX, arrowY - 22, portal.label, {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          color: "#1b1c1d",
          backgroundColor: "#fff3bf",
          padding: { x: 6, y: 3 }
        })
        .setOrigin(0.5)
        .setDepth(37));
      this.tweens.add({
        targets: arrow,
        y: arrow.y - 8,
        yoyo: true,
        repeat: -1,
        duration: 720,
        ease: "Sine.easeInOut"
      });
    });
  }

  private drawDesk(x: number, y: number, label: string): void {
    this.drawPropBox(x, y, 164, 72, 0x6b4f35, label);
    this.addWorld(this.add.rectangle(x - 42, y - 6, 34, 22, 0x223348, 1).setDepth(17));
    this.addWorld(this.add.rectangle(x - 42, y - 18, 40, 8, 0x74c0fc, 1).setDepth(18));
  }

  private drawTerminalBank(x: number, y: number): void {
    this.drawPropBox(x, y, 184, 74, 0x2f3f52, "Bot Station");
    [-52, 0, 52].forEach((offset) => {
      this.addWorld(this.add.rectangle(x + offset, y - 8, 34, 24, 0x74c0fc, 1).setDepth(18));
    });
  }

  private drawServerRack(x: number, y: number): void {
    this.drawPropBox(x, y, 58, 164, 0x1f2937, "Rack");
    [-48, -20, 8, 36].forEach((offset) => {
      this.addWorld(this.add.circle(x, y + offset, 4, 0x91f2bd, 1).setDepth(19));
    });
  }

  private drawSinkRow(): void {
    this.drawPropBox(254, 155, 272, 58, 0xdce7ef, "Sinks");
    [174, 254, 334].forEach((x) => {
      this.addWorld(this.add.circle(x, 156, 18, 0xf8fbff, 1).setDepth(18));
      this.addWorld(this.add.rectangle(x, 136, 18, 8, 0x94a3b8, 1).setDepth(19));
    });
  }

  private drawBathroomStalls(): void {
    [659, 759].forEach((x, index) => {
      this.drawPropBox(x, 183, 78, 170, 0x86a9b8, `Stall ${index + 1}`);
      this.addWorld(this.add.rectangle(x, 218, 36, 56, 0x5f7f8f, 1).setDepth(18));
    });
  }

  private drawMirror(x: number, y: number): void {
    this.addWorld(this.add
      .rectangle(x, y, 272, 28, 0xbfeaf5, 0.9)
      .setStrokeStyle(2, 0xe9fbff, 0.95)
      .setDepth(18));
  }

  private drawCounter(x: number, y: number, width: number, label: string): void {
    this.drawPropBox(x, y, width, 56, 0x8a613f, label);
  }

  private drawTable(x: number, y: number, label: string, color: number): void {
    this.drawPropBox(x, y, 208, 78, color, label);
    this.addWorld(this.add.circle(x - 56, y + 54, 12, 0x1f2937, 1).setDepth(16));
    this.addWorld(this.add.circle(x + 56, y + 54, 12, 0x1f2937, 1).setDepth(16));
  }

  private drawNoticeBoard(x: number, y: number): void {
    this.drawPropBox(x, y, 228, 46, 0xfacc15, "Notice Board");
    this.addWorld(this.add.rectangle(x - 46, y, 34, 28, 0xfffbeb, 1).setDepth(18));
    this.addWorld(this.add.rectangle(x + 28, y, 56, 28, 0xfffbeb, 1).setDepth(18));
  }

  private drawCouch(x: number, y: number, color: number): void {
    this.drawPropBox(x, y, 210, 74, color, "Couch");
    this.addWorld(this.add.rectangle(x, y - 26, 190, 24, color, 1).setDepth(18));
  }

  private drawPropBox(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    label: string
  ): void {
    this.addWorld(this.add
      .rectangle(x, y, width, height, color, 0.96)
      .setStrokeStyle(3, 0x172224, 0.82)
      .setDepth(16));
    this.addWorld(this.add
      .text(x, y + height / 2 + 14, label, {
        fontFamily: "Arial, sans-serif",
        fontSize: "11px",
        color: "#fff8e7",
        backgroundColor: "rgba(16, 24, 26, 0.74)",
        padding: { x: 5, y: 2 }
      })
      .setOrigin(0.5)
      .setDepth(18));
  }

  private showMerchantSpeechIfNearby(): void {
    const localPlayer = this.latestPlayers.get(this.profile.playerId);

    if (!localPlayer || distanceBetween(localPlayer, WULAND_MERCHANT) > 240) {
      return;
    }

    const line = Phaser.Utils.Array.GetRandom(Array.from(WULAND_MERCHANT.speechLines));

    this.merchantBubble?.destroy();
    this.merchantBubble = this.add
      .text(WULAND_MERCHANT.x + 34, WULAND_MERCHANT.y - 92, line, {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        color: "#fff8e7",
        backgroundColor: "rgba(27, 18, 24, 0.88)",
        align: "center",
        padding: { x: 8, y: 5 },
        wordWrap: { width: 240, useAdvancedWrap: true }
      })
      .setOrigin(0.5)
      .setDepth(88);

    this.tweens.add({
      targets: this.merchantBubble,
      y: this.merchantBubble.y - 10,
      alpha: 0,
      delay: 2300,
      duration: 700,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.merchantBubble?.destroy();
        this.merchantBubble = undefined;
      }
    });
  }

  private createInput(): void {
    if (!this.input.keyboard) {
      throw new Error("Keyboard input is unavailable.");
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as WasdKeys;
    this.combatKeys = {
      attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      use: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      pickup: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      gift: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      hotbar: [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.THREE,
        Phaser.Input.Keyboard.KeyCodes.FOUR,
        Phaser.Input.Keyboard.KeyCodes.FIVE,
        Phaser.Input.Keyboard.KeyCodes.SIX,
        Phaser.Input.Keyboard.KeyCodes.SEVEN,
        Phaser.Input.Keyboard.KeyCodes.EIGHT,
        Phaser.Input.Keyboard.KeyCodes.NINE
      ].map((keyCode) => this.input.keyboard!.addKey(keyCode))
    };
    this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    this.input.on("pointerdown", this.handlePointerDown, this);
  }

  private mountMobileControls(): void {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      return;
    }

    const touchLikely =
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth <= 860;
    document.body.toggleAttribute("data-touch-controls", touchLikely);

    const root = document.createElement("div");
    root.className = "mobile-controls";
    root.innerHTML = `
      <div class="mobile-dpad" aria-label="Movement controls">
        <button type="button" data-mobile-dir="up" aria-label="Move up">Up</button>
        <button type="button" data-mobile-dir="left" aria-label="Move left">Left</button>
        <button type="button" data-mobile-dir="down" aria-label="Move down">Down</button>
        <button type="button" data-mobile-dir="right" aria-label="Move right">Right</button>
      </div>
      <div class="mobile-actions" aria-label="Combat controls">
        <button type="button" data-mobile-action="attack">Attack</button>
        <button type="button" data-mobile-action="use">Use</button>
        <button type="button" data-mobile-action="pickup">Interact</button>
        <button type="button" data-mobile-action="gift">Gift</button>
        <button type="button" data-mobile-action="help">Help</button>
        <button type="button" data-mobile-action="debug">F3</button>
      </div>
    `;
    uiRoot.appendChild(root);
    this.mobileRoot = root;

    root.querySelectorAll<HTMLButtonElement>("[data-mobile-dir]").forEach((button) => {
      const direction = button.dataset.mobileDir as keyof MovementInput;
      const activate = (event: PointerEvent): void => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        this.virtualInput = { ...ZERO_INPUT, [direction]: true };
        this.clearClickTarget(true);
      };
      const deactivate = (event: PointerEvent): void => {
        event.preventDefault();
        this.virtualInput = { ...ZERO_INPUT };
      };

      button.addEventListener("pointerdown", activate);
      button.addEventListener("pointerup", deactivate);
      button.addEventListener("pointercancel", deactivate);
      button.addEventListener("lostpointercapture", () => {
        this.virtualInput = { ...ZERO_INPUT };
      });
    });

    root.querySelector('[data-mobile-action="attack"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.sendWeaponAttack();
    });
    root.querySelector('[data-mobile-action="use"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.useSelectedItem();
    });
    root.querySelector('[data-mobile-action="pickup"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.interactOrPickup();
    });
    root.querySelector('[data-mobile-action="gift"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.giftSelectedItem();
    });
    root.querySelector('[data-mobile-action="help"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.game.events.emit("wuland:toggleHelp");
    });
    root.querySelector('[data-mobile-action="debug"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.game.events.emit("wuland:toggleDebug");
    });
  }

  private sendMovementInputForControls(time: number): void {
    if (!this.cursors || !this.wasd) {
      return;
    }

    if (isGameplayInputBlocked()) {
      this.sendMovementInput(ZERO_INPUT, true);
      return;
    }

    const keyboardInput: MovementInput = {
      left: Boolean(this.cursors.left?.isDown || this.wasd.left.isDown),
      right: Boolean(this.cursors.right?.isDown || this.wasd.right.isDown),
      up: Boolean(this.cursors.up?.isDown || this.wasd.up.isDown),
      down: Boolean(this.cursors.down?.isDown || this.wasd.down.isDown)
    };
    const input = hasMovementInput(keyboardInput)
      ? keyboardInput
      : this.virtualInput;
    const changed = !movementInputsEqual(input, this.lastInput);
    const shouldRefresh = time - this.lastInputSentAt > INPUT_RESEND_MS;

    this.lastInput = input;

    if (hasMovementInput(input)) {
      this.clearClickTarget(true);
    }

    if (changed || shouldRefresh) {
      this.sendMovementInput(input, changed);
      this.lastInputSentAt = time;
    }
  }

  private sendMovementInput(input: MovementInput, force = false): void {
    if (!this.room) {
      return;
    }

    if (!force && movementInputsEqual(input, this.lastSentInput)) {
      return;
    }

    this.lastSentInput = { ...input };
    this.room.send("movement", input);
  }

  private sendCombatForKeyboard(): void {
    if (!this.combatKeys) {
      return;
    }

    if (isGameplayInputBlocked()) {
      return;
    }

    if (this.debugKey && Phaser.Input.Keyboard.JustDown(this.debugKey)) {
      this.game.events.emit("wuland:toggleDebug");
    }

    this.combatKeys.hotbar.forEach((key, index) => {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        this.selectHotbarSlot(index);
      }
    });

    if (Phaser.Input.Keyboard.JustDown(this.combatKeys.attack)) {
      this.sendWeaponAttack();
    }

    if (Phaser.Input.Keyboard.JustDown(this.combatKeys.use)) {
      this.useSelectedItem();
    }

    if (Phaser.Input.Keyboard.JustDown(this.combatKeys.pickup)) {
      this.interactOrPickup();
    }

    if (Phaser.Input.Keyboard.JustDown(this.combatKeys.gift)) {
      this.giftSelectedItem();
    }
  }

  private sendWeaponAttack(targetEnemyId = this.selectedEnemyId): void {
    const request = this.buildCombatRequest(targetEnemyId);
    this.room?.send("attack", request);
  }

  private useSelectedItem(): void {
    this.room?.send("useSelectedItem");
  }

  private interactOrPickup(): void {
    if (this.connectionState.nearbyPortalId) {
      this.room?.send("usePortal", { portalId: this.connectionState.nearbyPortalId });
      this.clearClickTarget(true);
      return;
    }

    if (this.connectionState.nearMerchant) {
      this.game.events.emit("wuland:openMerchantShop");
      return;
    }

    this.room?.send("pickupItem", {});
  }

  private selectHotbarSlot(slotIndex: number): void {
    this.room?.send("selectHotbarSlot", { slotIndex });
  }

  private giftSelectedItem(): void {
    this.room?.send("giftSelectedItem", {});
  }

  private buyMerchantItem(itemDefinitionId: ItemDefinitionId): void {
    this.room?.send("buyItem", { itemDefinitionId });
  }

  private moveHotbarItem(payload: { fromSlotIndex: number; toSlotIndex: number }): void {
    this.room?.send("moveInventoryItem", payload);
  }

  private discardHotbarItem(slotIndex: number): void {
    this.room?.send("discardInventoryItem", { slotIndex });
  }

  private sendChatMessage(payload: { text: string }): void {
    const text = payload.text.trim().slice(0, CHAT_MAX_MESSAGE_LENGTH);

    if (text.length === 0) {
      return;
    }

    this.room?.send("chat", { text });
  }

  private setGodMode(payload: { active: boolean; code?: string }): void {
    this.godModeActive = payload.active && this.connectionState.godModeAvailable;
    this.godModeCode = payload.code ?? this.godModeCode;
    this.setConnectionState({
      godModeActive: this.godModeActive
    });
  }

  private buildCombatRequest(targetEnemyId: string): { targetEnemyId?: string; direction: Direction } {
    const localPlayer = this.latestPlayers.get(this.profile.playerId);
    const enemy = targetEnemyId ? this.latestEnemies.get(targetEnemyId) : undefined;

    return {
      targetEnemyId: enemy?.alive ? targetEnemyId : undefined,
      direction: localPlayer?.direction ?? "down"
    };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.cameras.main) {
      return;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    if (this.godModeActive && this.handleGodModePointer(worldPoint.x, worldPoint.y)) {
      return;
    }

    const enemy = this.enemyAtWorldPoint(worldPoint.x, worldPoint.y);

    if (!enemy) {
      this.setClickTarget(worldPoint.x, worldPoint.y);
      return;
    }

    this.selectedEnemyId = enemy.enemyId;
    this.refreshEnemySelection();
    this.showFloatingText(enemy.x, enemy.y, "target", "#fff3bf");
  }

  private setClickTarget(x: number, y: number): void {
    const target = clampMapPosition({ x, y }, this.currentMapId);

    if (collidesWithMap(target, this.currentMapId)) {
      this.showFloatingText(target.x, target.y, "blocked", "#ffd8a8");
      return;
    }

    this.clickTarget = new Phaser.Math.Vector2(target.x, target.y);
    this.targetStartedAt = this.time.now;
    this.lastTargetDistance = Number.POSITIVE_INFINITY;
    this.lastTargetProgressAt = this.time.now;
    this.room?.send("moveTarget", target);
    this.showDestinationMarker(target.x, target.y);
  }

  private handleGodModePointer(x: number, y: number): boolean {
    const droppedItem = this.droppedItemAtWorldPoint(x, y);

    if (droppedItem) {
      const definition = ITEM_DEFINITIONS[droppedItem.itemDefinitionId];
      if (window.confirm(`Delete dropped item "${definition.displayName}" from the server?`)) {
        this.room?.send("deleteDroppedItem", {
          droppedItemId: droppedItem.droppedItemId,
          code: this.godModeCode
        });
      }
      return true;
    }

    const player = this.playerAtWorldPoint(x, y);

    if (player) {
      if (player.playerId === this.profile.playerId) {
        this.showFloatingText(player.x, player.y, "cannot delete self", "#ffd8a8");
        return true;
      }

      if (window.confirm(`Delete "${player.name}" from WULAND? This clears the server record.`)) {
        this.room?.send("deletePlayer", {
          playerId: player.playerId,
          code: this.godModeCode
        });
      }
      return true;
    }

    this.showFloatingText(x, y, "God Mode target?", "#ffd8a8");
    return true;
  }

  private updateClickTarget(player: PlayerNetworkState, time: number): void {
    if (!this.clickTarget) {
      return;
    }

    const distanceToTarget = Phaser.Math.Distance.Between(
      player.x,
      player.y,
      this.clickTarget.x,
      this.clickTarget.y
    );

    if (distanceToTarget <= 18) {
      this.clearClickTarget(false);
      return;
    }

    if (distanceToTarget < this.lastTargetDistance - 2) {
      this.lastTargetDistance = distanceToTarget;
      this.lastTargetProgressAt = time;
    }

    if (time - this.targetStartedAt > 550 && time - this.lastTargetProgressAt > 1100) {
      this.clearClickTarget(false);
    }
  }

  private showDestinationMarker(x: number, y: number): void {
    if (!this.destinationMarker) {
      this.destinationMarker = this.add
        .circle(x, y, 18, 0x56c4a8, 0.18)
        .setStrokeStyle(3, 0xe8fff9, 0.8)
        .setDepth(43);
    }

    this.destinationMarker
      .setPosition(x, y)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.killTweensOf(this.destinationMarker);
    this.tweens.add({
      targets: this.destinationMarker,
      scaleX: 1.18,
      scaleY: 1.18,
      yoyo: true,
      repeat: -1,
      duration: 520,
      ease: "Sine.easeInOut"
    });
  }

  private clearClickTarget(interrupted: boolean): void {
    if (!this.clickTarget) {
      return;
    }

    this.clickTarget = undefined;
    this.lastTargetDistance = Number.POSITIVE_INFINITY;
    this.lastTargetProgressAt = 0;
    this.room?.send("clearMoveTarget", { interrupted });

    if (this.destinationMarker) {
      this.tweens.killTweensOf(this.destinationMarker);
      this.destinationMarker.setVisible(false).setScale(1);
    }
  }

  private handleRoomState(state?: WulandRoomState): void {
    if (!this.sceneActive || !state) {
      return;
    }

    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();
    this.latestNpcs.clear();
    state.players?.forEach((playerSchema) => {
      const player = snapshotPlayer(playerSchema);
      this.latestPlayers.set(player.playerId, player);
    });
    const localPlayer = this.latestPlayers.get(this.profile.playerId);
    const activeMapId = localPlayer?.mapId ?? this.currentMapId;
    this.markCurrentInteriorVisited(activeMapId);

    if (activeMapId !== this.currentMapId) {
      this.clearClickTarget(true);
      this.selectedEnemyId = "";
      this.drawCurrentMap(activeMapId);
      this.showMapTransition();
    }

    const seenPlayers = new Set<string>();
    const seenEnemies = new Set<string>();
    const seenDroppedItems = new Set<string>();
    const seenNpcs = new Set<string>();

    this.latestPlayers.forEach((player) => {
      if (player.mapId !== activeMapId) {
        return;
      }

      seenPlayers.add(player.playerId);
      this.renderPlayer(player);
    });
    state.enemies?.forEach((enemySchema) => {
      const enemy = snapshotEnemy(enemySchema);
      this.latestEnemies.set(enemy.enemyId, enemy);
      if (enemy.mapId !== activeMapId) {
        return;
      }

      seenEnemies.add(enemy.enemyId);
      this.renderEnemy(enemy);
    });
    state.droppedItems?.forEach((itemSchema) => {
      const item = snapshotDroppedItem(itemSchema);
      this.latestDroppedItems.set(item.droppedItemId, item);
      if (item.mapId !== activeMapId) {
        return;
      }

      seenDroppedItems.add(item.droppedItemId);
      this.renderDroppedItem(item);
    });
    state.npcs?.forEach((npcSchema) => {
      const npc = snapshotNpc(npcSchema);
      this.latestNpcs.set(npc.npcId, npc);
      if (npc.mapId !== activeMapId) {
        return;
      }

      seenNpcs.add(npc.npcId);
      this.renderNpc(npc);
    });

    for (const [playerId, avatar] of this.avatars) {
      if (!seenPlayers.has(playerId)) {
        this.destroyAvatar(avatar);
        this.avatars.delete(playerId);
      }
    }

    for (const [enemyId, avatar] of this.enemyAvatars) {
      if (!seenEnemies.has(enemyId)) {
        this.destroyEnemyAvatar(avatar);
        this.enemyAvatars.delete(enemyId);
      }
    }

    for (const [droppedItemId, avatar] of this.droppedItemAvatars) {
      if (!seenDroppedItems.has(droppedItemId)) {
        this.destroyDroppedItemAvatar(avatar);
        this.droppedItemAvatars.delete(droppedItemId);
      }
    }

    for (const [npcId, avatar] of this.npcAvatars) {
      if (!seenNpcs.has(npcId)) {
        this.destroyNpcAvatar(avatar);
        this.npcAvatars.delete(npcId);
      }
    }

    const inventory = localPlayer?.inventory ?? createEmptyClientInventory();
    const selectedHotbarSlot = localPlayer?.selectedHotbarSlot ?? 0;
    const activeItem = inventory[selectedHotbarSlot];
    const activeItemName = activeItem?.itemDefinitionId
      ? ITEM_DEFINITIONS[activeItem.itemDefinitionId].displayName
      : "No item";

    this.setConnectionState({
      totalPlayers: state.totalPlayers ?? seenPlayers.size,
      onlinePlayers: state.onlinePlayers ?? countPlayers(this.latestPlayers, "online"),
      sleepingPlayers: state.sleepingPlayers ?? countPlayers(this.latestPlayers, "sleeping"),
      totalEnemies: state.totalEnemies ?? seenEnemies.size,
      aliveEnemies: state.aliveEnemies ?? countAliveEnemies(this.latestEnemies),
      localHp: localPlayer?.hp ?? 0,
      localMaxHp: localPlayer?.maxHp ?? 0,
      localShield: localPlayer?.shield ?? 0,
      defeated: Boolean(localPlayer?.defeated),
      inventory,
      selectedHotbarSlot,
      activeItemName,
      currentMapId: activeMapId,
      currentMapName: getMapDisplayName(activeMapId),
      totalDroppedItems: state.totalDroppedItems ?? seenDroppedItems.size,
      godModeAvailable: Boolean(state.godModeEnabled),
      godModeCodeRequired: Boolean(state.godModeCodeRequired),
      godModeActive: this.godModeActive
    });
  }

  private renderPlayer(player: PlayerNetworkState): void {
    const isLocalPlayer = player.playerId === this.profile.playerId;
    const textureKey = createCharacterTexture(
      this,
      characterTextureProfileFromNetwork(player)
    );
    let avatar = this.avatars.get(player.playerId);

    if (!avatar) {
      const sprite = this.add.sprite(player.x, player.y, textureKey);
      sprite.setDepth(50);
      avatar = {
        playerId: player.playerId,
        sprite,
        aura: this.add.circle(player.x, player.y, 35, 0xffffff, 0.13).setDepth(45).setVisible(false),
        hpBg: this.add.rectangle(player.x - 30, player.y - 75, 60, 6, 0x1f272a, 0.88).setOrigin(0, 0.5).setDepth(72),
        hpFill: this.add.rectangle(player.x - 30, player.y - 75, 60, 6, 0x69db7c, 1).setOrigin(0, 0.5).setDepth(73),
        shieldFill: this.add.rectangle(player.x - 30, player.y - 68, 0, 4, 0x74c0fc, 0.95).setOrigin(0, 0.5).setDepth(73),
        nameLabel: this.createPlayerLabel(player.name, 15, "#ffffff", "rgba(16, 22, 20, 0.76)"),
        classLabel: this.createPlayerLabel("", 11, "#ffffff", CLASS_METADATA[player.className].color),
        statusLabel: this.createPlayerLabel("", 11, "#f5f1d5", "rgba(35, 38, 45, 0.82)"),
        sleepLabel: this.createPlayerLabel("Zzz", 16, "#fff7b2", "rgba(44, 46, 62, 0.8)"),
        target: new Phaser.Math.Vector2(player.x, player.y),
        lastState: player
      };
      this.avatars.set(player.playerId, avatar);

      if (isLocalPlayer) {
        this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
        this.cameras.main.setDeadzone(90, 70);
      }
    } else if (avatar.sprite.texture.key !== textureKey) {
      avatar.sprite.setTexture(textureKey);
    }

    const classMeta = CLASS_METADATA[player.className];
    const statusText = player.defeated
      ? "respawning"
      : player.sleeping || !player.online
        ? "sleeping"
        : "";
    const hpPercent = player.maxHp > 0 ? Phaser.Math.Clamp(player.hp / player.maxHp, 0, 1) : 0;
    const shieldPercent = player.maxHp > 0 ? Phaser.Math.Clamp(player.shield / player.maxHp, 0, 1) : 0;

    avatar.target.set(player.x, player.y);
    avatar.lastState = player;
    avatar.nameLabel.setText(player.name);
    avatar.classLabel
      .setText(`${classMeta.iconText} ${classMeta.shortLabel}`)
      .setBackgroundColor(classMeta.color);
    avatar.statusLabel.setText(statusText).setVisible(statusText.length > 0);
    avatar.sleepLabel.setVisible(player.sleeping || !player.online);
    avatar.hpFill
      .setFillStyle(player.defeated ? 0xff6b6b : hpPercent < 0.35 ? 0xffd43b : 0x69db7c)
      .setDisplaySize(60 * hpPercent, 6);
    avatar.shieldFill.setDisplaySize(60 * shieldPercent, 4).setVisible(player.shield > 0);
    avatar.aura
      .setFillStyle(parseCssColor(classMeta.color), player.activeBuffs ? 0.16 : 0)
      .setVisible(player.activeBuffs.length > 0);
    avatar.sprite
      .setFlipX(player.direction === "left")
      .setAlpha(player.sleeping || !player.online || player.defeated ? 0.58 : 1)
      .setTint(player.defeated ? 0xffb3b3 : player.sleeping || !player.online ? 0x9da6af : 0xffffff);

    if (isLocalPlayer) {
      avatar.sprite.setPosition(player.x, player.y);
    }

    this.updatePlayerLabels(avatar);
  }

  private createPlayerLabel(
    text: string,
    fontSize: number,
    color: string,
    backgroundColor: string
  ): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, text, {
        fontFamily: "Arial, sans-serif",
        fontSize: `${fontSize}px`,
        color,
        backgroundColor,
        align: "center",
        padding: { x: 6, y: 2 },
        wordWrap: { width: 190, useAdvancedWrap: true }
      })
      .setOrigin(0.5)
      .setDepth(70);
  }

  private renderEnemy(enemy: EnemyNetworkState): void {
    const definition = ENEMY_DEFINITIONS[enemy.type];
    let avatar = this.enemyAvatars.get(enemy.enemyId);

    if (!avatar) {
      const body = this.add.circle(0, 0, definition.radius, definition.color, 0.95);
      const accent = this.add.circle(
        definition.radius * 0.3,
        -definition.radius * 0.25,
        Math.max(5, definition.radius * 0.32),
        definition.accentColor,
        0.9
      );
      const selectionRing = this.add
        .circle(0, 0, definition.radius + 7, 0xffffff, 0)
        .setStrokeStyle(3, 0xfff3bf, 1)
        .setVisible(false);
      const hpBg = this.add.rectangle(-31, -definition.radius - 18, 62, 6, 0x251f21, 0.88).setOrigin(0, 0.5);
      const hpFill = this.add.rectangle(-31, -definition.radius - 18, 62, 6, 0xff6b6b, 1).setOrigin(0, 0.5);
      const nameLabel = this.add
        .text(0, -definition.radius - 34, enemy.name, {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          color: "#fff8e7",
          backgroundColor: "rgba(31, 24, 24, 0.76)",
          padding: { x: 6, y: 2 }
        })
        .setOrigin(0.5);
      const markLabel = this.add
        .text(0, -definition.radius - 52, "MARKED", {
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          color: "#1b1c1d",
          backgroundColor: "#facc15",
          padding: { x: 5, y: 2 }
        })
        .setOrigin(0.5)
        .setVisible(false);
      const container = this.add.container(enemy.x, enemy.y, [
        selectionRing,
        body,
        accent,
        hpBg,
        hpFill,
        nameLabel,
        markLabel
      ]);
      container.setDepth(42);
      avatar = {
        enemyId: enemy.enemyId,
        container,
        body,
        accent,
        selectionRing,
        markLabel,
        nameLabel,
        hpBg,
        hpFill,
        target: new Phaser.Math.Vector2(enemy.x, enemy.y),
        lastState: enemy
      };
      this.enemyAvatars.set(enemy.enemyId, avatar);
    }

    const hpPercent = enemy.maxHp > 0 ? Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1) : 0;
    avatar.target.set(enemy.x, enemy.y);
    avatar.lastState = enemy;
    avatar.container.setVisible(enemy.alive);
    avatar.nameLabel.setText(enemy.name);
    avatar.body.setFillStyle(definition.color, enemy.alive ? 0.95 : 0.2);
    avatar.accent.setFillStyle(definition.accentColor, enemy.alive ? 0.9 : 0.2);
    avatar.hpFill.setDisplaySize(62 * hpPercent, 6);
    avatar.markLabel.setVisible(enemy.markedUntil > Date.now());
    avatar.selectionRing.setVisible(enemy.enemyId === this.selectedEnemyId && enemy.alive);

    if (!enemy.alive && this.selectedEnemyId === enemy.enemyId) {
      this.selectedEnemyId = "";
    }
  }

  private renderDroppedItem(item: DroppedItemNetworkState): void {
    const definition = ITEM_DEFINITIONS[item.itemDefinitionId];
    let avatar = this.droppedItemAvatars.get(item.droppedItemId);

    if (!avatar) {
      const body = this.add
        .rectangle(0, 0, 38, 30, 0x1f2c2e, 0.92)
        .setStrokeStyle(2, 0xffe8a3, 0.9);
      const iconLabel = this.add
        .text(0, -2, definition.iconText, {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#fff8e7",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      const nameLabel = this.add
        .text(0, -28, definition.displayName, {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#1b1c1d",
          backgroundColor: "#fff3bf",
          padding: { x: 5, y: 2 }
        })
        .setOrigin(0.5);
      const container = this.add.container(item.x, item.y, [body, iconLabel, nameLabel]);
      container.setDepth(38);
      avatar = {
        droppedItemId: item.droppedItemId,
        container,
        body,
        iconLabel,
        nameLabel,
        lastState: item
      };
      this.droppedItemAvatars.set(item.droppedItemId, avatar);
    }

    avatar.lastState = item;
    avatar.container.setPosition(item.x, item.y);
    avatar.iconLabel.setText(item.quantity > 1 ? `${definition.iconText} x${item.quantity}` : definition.iconText);
    avatar.nameLabel.setText(definition.displayName);
  }

  private renderNpc(npc: AmbientNpcNetworkState): void {
    const definition = npcDefinitionFor(npc.npcId);
    const color = definition?.color ?? npcColor(npc.type);
    const accentColor = definition?.accentColor ?? 0xfff3bf;
    let avatar = this.npcAvatars.get(npc.npcId);

    if (!avatar) {
      const body = this.add.circle(0, 0, 20, color, 0.96).setStrokeStyle(3, 0x162325, 0.8);
      const accent = this.add.rectangle(0, -7, 30, 10, accentColor, 0.92);
      const nameLabel = this.add
        .text(0, -47, npc.displayName, {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          color: "#fff8e7",
          backgroundColor: "rgba(16, 22, 20, 0.78)",
          padding: { x: 6, y: 2 }
        })
        .setOrigin(0.5);
      const speechLabel = this.add
        .text(0, -76, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          color: "#172224",
          backgroundColor: "#fff8e7",
          align: "center",
          padding: { x: 7, y: 4 },
          wordWrap: { width: 210, useAdvancedWrap: true }
        })
        .setOrigin(0.5)
        .setVisible(false);
      const container = this.add.container(npc.x, npc.y, [body, accent, nameLabel, speechLabel]);
      container.setDepth(48);
      avatar = {
        npcId: npc.npcId,
        container,
        body,
        accent,
        nameLabel,
        speechLabel,
        target: new Phaser.Math.Vector2(npc.x, npc.y),
        lastState: npc
      };
      this.npcAvatars.set(npc.npcId, avatar);
    }

    avatar.target.set(npc.x, npc.y);
    avatar.lastState = npc;
    avatar.nameLabel.setText(npc.displayName);
    avatar.body.setFillStyle(color, 0.96);
    avatar.accent.setFillStyle(accentColor, 0.92);
    avatar.speechLabel
      .setText(npc.speechText)
      .setVisible(Boolean(npc.speechText) && npc.speechUntil > Date.now());
  }

  private updateAvatarPositions(delta: number): void {
    const interpolation = Phaser.Math.Clamp(delta / 85, 0.12, 1);

    this.avatars.forEach((avatar) => {
      if (avatar.playerId !== this.profile.playerId) {
        avatar.sprite.x = Phaser.Math.Linear(avatar.sprite.x, avatar.target.x, interpolation);
        avatar.sprite.y = Phaser.Math.Linear(avatar.sprite.y, avatar.target.y, interpolation);
      }

      this.updatePlayerLabels(avatar);
    });
  }

  private updateEnemyPositions(delta: number): void {
    const interpolation = Phaser.Math.Clamp(delta / 95, 0.1, 1);

    this.enemyAvatars.forEach((avatar) => {
      avatar.container.x = Phaser.Math.Linear(avatar.container.x, avatar.target.x, interpolation);
      avatar.container.y = Phaser.Math.Linear(avatar.container.y, avatar.target.y, interpolation);
    });
  }

  private updateNpcPositions(delta: number): void {
    const interpolation = Phaser.Math.Clamp(delta / 110, 0.08, 1);

    this.npcAvatars.forEach((avatar) => {
      avatar.container.x = Phaser.Math.Linear(avatar.container.x, avatar.target.x, interpolation);
      avatar.container.y = Phaser.Math.Linear(avatar.container.y, avatar.target.y, interpolation);
      avatar.speechLabel.setVisible(
        Boolean(avatar.lastState.speechText) &&
        avatar.lastState.speechUntil > Date.now()
      );
    });
  }

  private updatePlayerLabels(avatar: PlayerAvatar): void {
    const x = avatar.sprite.x;
    const y = avatar.sprite.y;
    const sleeping = avatar.lastState.sleeping || !avatar.lastState.online;
    const defeated = avatar.lastState.defeated;

    avatar.aura.setPosition(x, y);
    avatar.hpBg.setPosition(x - 30, y - 87);
    avatar.hpFill.setPosition(x - 30, y - 87);
    avatar.shieldFill.setPosition(x - 30, y - 80);
    avatar.sleepLabel.setPosition(x, y - 108);
    avatar.nameLabel.setPosition(x, y - 67);
    avatar.classLabel.setPosition(x, y - 47);
    avatar.statusLabel.setPosition(x, y - 28);
    avatar.statusLabel.setVisible(sleeping || defeated);
  }

  private updateInteractionContext(player: PlayerNetworkState): void {
    const nearby = nearestDroppedItemClient(player, this.latestDroppedItems, 66);
    const nearbyPickupName = nearby
      ? ITEM_DEFINITIONS[nearby.itemDefinitionId].displayName
      : "";
    const nearbyPortal = nearbyPortalClient(player, 72);
    const nearbyPortalId = nearbyPortal?.id ?? "";
    const portalPrompt = nearbyPortal ? `Press F to ${nearbyPortal.label}` : "";
    const nearMerchant =
      player.mapId === WULAND_MAP_ID &&
      distanceBetween(player, WULAND_MERCHANT) <= WULAND_MERCHANT.interactionRange;
    const selectedItem = player.inventory[player.selectedHotbarSlot];
    const canGift =
      Boolean(selectedItem?.itemDefinitionId) &&
      isCakeItemDefinitionId(selectedItem?.itemDefinitionId);
    const giftTarget = canGift
      ? nearestGiftPlayerClient(player, this.latestPlayers, 78)
      : null;
    const nearbyGiftPlayerName = giftTarget?.name ?? "";

    if (
      nearbyPickupName !== this.connectionState.nearbyPickupName ||
      nearbyPortalId !== this.connectionState.nearbyPortalId ||
      portalPrompt !== this.connectionState.portalPrompt ||
      nearMerchant !== this.connectionState.nearMerchant ||
      nearbyGiftPlayerName !== this.connectionState.nearbyGiftPlayerName
    ) {
      this.setConnectionState({
        nearbyPickupName,
        nearbyPortalId,
        portalPrompt,
        nearMerchant,
        nearbyGiftPlayerName
      });
    }
  }

  private updateVisitedBuildings(player: PlayerNetworkState): void {
    if (player.mapId !== WULAND_MAP_ID) {
      return;
    }

    BUILDING_LAYOUT.forEach((building) => {
      if (this.visitedBuildings.has(building.name)) {
        return;
      }

      const withinX =
        Math.abs(player.x - building.x) <= building.width / 2 + building.visitPadding;
      const withinY =
        Math.abs(player.y - building.y) <= building.height / 2 + building.visitPadding;

      if (withinX && withinY) {
        this.markBuildingVisited(building.name);
      }
    });
  }

  private markCurrentInteriorVisited(mapId: WulandMapId): void {
    const buildingName = MAP_ID_TO_BUILDING_NAME[mapId];

    if (buildingName) {
      this.markBuildingVisited(buildingName);
    }
  }

  private markBuildingVisited(name: BuildingName): void {
    if (this.visitedBuildings.has(name)) {
      return;
    }

    this.visitedBuildings.add(name);
    this.saveCurrentProgress();
    this.showVisitToast(name);
  }

  private showVisitToast(name: BuildingName): void {
    const avatar = this.avatars.get(this.profile.playerId);

    if (!avatar) {
      return;
    }

    const toast = this.add
      .text(avatar.sprite.x, avatar.sprite.y - 102, `Visited ${name}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#1c241d",
        backgroundColor: "#f5f1d5",
        padding: { x: 8, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(90);

    this.tweens.add({
      targets: toast,
      y: toast.y - 26,
      alpha: 0,
      duration: 1200,
      ease: "Sine.easeOut",
      onComplete: () => toast.destroy()
    });
  }

  private handleCombatEvent(event: CombatEvent): void {
    if (!this.sceneActive) {
      return;
    }

    if (event.mapId && event.mapId !== this.currentMapId) {
      return;
    }

    this.showFloatingText(event.x, event.y, event.text, event.color);

    if (event.type === "basic" || event.type === "special" || event.type === "weapon") {
      this.showAttackEffect(event);
    }

    if (event.type === "shield" || event.type === "buff" || event.type === "mark") {
      this.showAreaEffect(event);
    }

    const enemy = this.enemyAvatars.get(event.targetId);
    if (enemy) {
      this.flashEnemy(enemy, event.type === "mark" ? 0xfacc15 : 0xffffff);
    }
  }

  private handleChatMessage(message: ChatMessage): void {
    this.game.events.emit("wuland:chatMessage", message);
  }

  private handleSpeechBubble(event: SpeechBubbleEvent): void {
    if (event.mapId !== this.currentMapId) {
      return;
    }

    if (event.sourceType === "player") {
      const avatar = this.avatars.get(event.sourceId);

      if (avatar) {
        this.showSpeechBubbleAt(avatar.sprite.x, avatar.sprite.y - 96, event.text);
      }
      return;
    }

    const npc = this.npcAvatars.get(event.sourceId);

    if (npc) {
      this.showSpeechBubbleAt(npc.container.x, npc.container.y - 70, event.text);
    }
  }

  private handleForceDeleted(event: ForceDeletedEvent): void {
    this.showFloatingText(
      this.cameras.main.midPoint.x,
      this.cameras.main.midPoint.y,
      event.message,
      "#ff8787"
    );
    clearAllSaveData();
    this.leavingRoom = true;
    this.deletedByServer = true;
    this.room = undefined;
    this.scene.stop("UIScene");
    this.scene.start("CharacterSelectScene", {
      message: event.message
    });
  }

  private showFloatingText(x: number, y: number, text: string, color: string): void {
    if (!text) {
      return;
    }

    const label = this.add
      .text(x, y - 46, text, {
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        color,
        backgroundColor: "rgba(16, 20, 22, 0.72)",
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(110);

    this.tweens.add({
      targets: label,
      y: label.y - 32,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy()
    });
  }

  private showSpeechBubbleAt(x: number, y: number, text: string): void {
    const bubble = this.add
      .text(x, y, text.slice(0, CHAT_MAX_MESSAGE_LENGTH), {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        color: "#172224",
        backgroundColor: "#fff8e7",
        align: "center",
        padding: { x: 8, y: 5 },
        wordWrap: { width: 230, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 1)
      .setDepth(120);

    this.tweens.add({
      targets: bubble,
      y: bubble.y - 18,
      alpha: 0,
      delay: 2600,
      duration: 650,
      ease: "Sine.easeIn",
      onComplete: () => bubble.destroy()
    });
  }

  private showAttackEffect(event: CombatEvent): void {
    const source = this.avatars.get(event.sourceId);
    const start = source
      ? { x: source.sprite.x, y: source.sprite.y - 10 }
      : { x: event.x, y: event.y };
    const projectile = this.add.circle(start.x, start.y, event.itemDefinitionId === "sword" ? 11 : 6, parseCssColor(event.color), 0.92)
      .setDepth(105);

    this.tweens.add({
      targets: projectile,
      x: event.x,
      y: event.y,
      alpha: 0.2,
      duration: event.itemDefinitionId === "sword" ? 120 : 220,
      ease: "Quad.easeOut",
      onComplete: () => projectile.destroy()
    });
  }

  private showAreaEffect(event: CombatEvent): void {
    const radius = event.type === "mark" ? 48 : 120;
    const circle = this.add
      .circle(event.x, event.y, radius, parseCssColor(event.color), 0.12)
      .setStrokeStyle(3, parseCssColor(event.color), 0.75)
      .setDepth(44);

    this.tweens.add({
      targets: circle,
      scaleX: 1.45,
      scaleY: 1.45,
      alpha: 0,
      duration: 650,
      ease: "Sine.easeOut",
      onComplete: () => circle.destroy()
    });
  }

  private flashEnemy(avatar: EnemyAvatar, color: number): void {
    avatar.body.setFillStyle(color, 1);

    this.time.delayedCall(110, () => {
      const enemy = avatar.lastState;
      const definition = ENEMY_DEFINITIONS[enemy.type];
      avatar.body.setFillStyle(definition.color, enemy.alive ? 0.95 : 0.2);
    });
  }

  private showMapTransition(): void {
    this.cameras.main.flash(280, 255, 248, 220);
    this.showFloatingText(
      this.cameras.main.midPoint.x,
      this.cameras.main.midPoint.y,
      getMapDisplayName(this.currentMapId),
      "#fff3bf"
    );
  }

  private enemyAtWorldPoint(x: number, y: number): EnemyNetworkState | null {
    let best: EnemyNetworkState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.latestEnemies.forEach((enemy) => {
      if (enemy.mapId !== this.currentMapId) {
        return;
      }

      const definition = ENEMY_DEFINITIONS[enemy.type];
      const distanceToEnemy = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);

      if (enemy.alive && distanceToEnemy <= definition.radius + 18 && distanceToEnemy < bestDistance) {
        best = enemy;
        bestDistance = distanceToEnemy;
      }
    });

    return best;
  }

  private droppedItemAtWorldPoint(x: number, y: number): DroppedItemNetworkState | null {
    let best: DroppedItemNetworkState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.latestDroppedItems.forEach((item) => {
      if (item.mapId !== this.currentMapId) {
        return;
      }

      const distanceToItem = Phaser.Math.Distance.Between(x, y, item.x, item.y);

      if (distanceToItem <= 32 && distanceToItem < bestDistance) {
        best = item;
        bestDistance = distanceToItem;
      }
    });

    return best;
  }

  private playerAtWorldPoint(x: number, y: number): PlayerNetworkState | null {
    let best: PlayerNetworkState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.latestPlayers.forEach((player) => {
      if (player.mapId !== this.currentMapId) {
        return;
      }

      const distanceToPlayer = Phaser.Math.Distance.Between(x, y, player.x, player.y);

      if (distanceToPlayer <= 38 && distanceToPlayer < bestDistance) {
        best = player;
        bestDistance = distanceToPlayer;
      }
    });

    return best;
  }

  private refreshEnemySelection(): void {
    this.enemyAvatars.forEach((avatar) => {
      avatar.selectionRing.setVisible(
        avatar.enemyId === this.selectedEnemyId && avatar.lastState.alive
      );
    });
  }

  private saveCurrentProgress(): void {
    const localPlayer = this.latestPlayers.get(this.profile.playerId);
    const position = localPlayer
      ? {
          x: Math.round(localPlayer.x),
          y: Math.round(localPlayer.y)
        }
      : this.progress.lastPosition;

    this.progress = {
      playerId: this.profile.playerId,
      currentMapId: localPlayer?.mapId ?? this.currentMapId,
      lastPosition: position,
      visitedBuildings: BUILDING_NAMES.filter((building) => this.visitedBuildings.has(building)),
      updatedAt: new Date().toISOString()
    };

    saveProgress(this.progress);
    this.game.events.emit("wuland:progressUpdated", this.progress);
  }

  private setConnectionState(state: Partial<WulandConnectionState>): void {
    this.connectionState = {
      ...this.connectionState,
      ...state
    };
    this.emitConnectionState();
  }

  private emitConnectionState(): void {
    this.game.events.emit("wuland:connectionUpdated", this.connectionState);
  }

  private handleRoomLeave(code: number, reason?: string): void {
    this.room = undefined;

    if (this.leavingRoom || !this.sceneActive) {
      return;
    }

    this.setConnectionState({
      status: "disconnected",
      message: reason || `Disconnected from WULAND server (${code})`
    });
  }

  private handleRoomError(code: number, message?: string): void {
    this.setConnectionState({
      status: "error",
      message: message || `WULAND server error (${code})`
    });
  }

  private openCharacterSelect(): void {
    this.saveCurrentProgress();
    this.leaveRoom();
    this.scene.stop("UIScene");
    this.scene.start("CharacterSelectScene", {
      profile: this.profile,
      progress: this.progress
    });
  }

  private handleShutdown(): void {
    this.sceneActive = false;
    if (!this.deletedByServer) {
      this.saveCurrentProgress();
    }
    this.sendMovementInput(ZERO_INPUT, true);
    this.clearClickTarget(true);
    if (!this.deletedByServer) {
      this.leaveRoom();
    }
    this.game.events.off("wuland:editCharacter", this.openCharacterSelect, this);
    this.game.events.off("wuland:selectHotbarSlot", this.selectHotbarSlot, this);
    this.game.events.off("wuland:moveHotbarItem", this.moveHotbarItem, this);
    this.game.events.off("wuland:discardHotbarItem", this.discardHotbarItem, this);
    this.game.events.off("wuland:buyMerchantItem", this.buyMerchantItem, this);
    this.game.events.off("wuland:sendChat", this.sendChatMessage, this);
    this.game.events.off("wuland:setGodMode", this.setGodMode, this);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.mobileRoot?.remove();
    this.mobileRoot = undefined;
    document.body.removeAttribute("data-touch-controls");
    this.clearWorldObjects();
    this.destinationMarker?.destroy();
    this.destinationMarker = undefined;
    this.avatars.forEach((avatar) => this.destroyAvatar(avatar));
    this.enemyAvatars.forEach((avatar) => this.destroyEnemyAvatar(avatar));
    this.droppedItemAvatars.forEach((avatar) => this.destroyDroppedItemAvatar(avatar));
    this.npcAvatars.forEach((avatar) => this.destroyNpcAvatar(avatar));
    this.avatars.clear();
    this.enemyAvatars.clear();
    this.droppedItemAvatars.clear();
    this.npcAvatars.clear();
    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();
    this.latestNpcs.clear();

    if (this.scene.isActive("UIScene")) {
      this.scene.stop("UIScene");
    }
  }

  private leaveRoom(): void {
    if (!this.room) {
      return;
    }

    this.leavingRoom = true;
    const room = this.room;
    this.room = undefined;
    void room.leave(true);
  }

  private destroyAvatar(avatar: PlayerAvatar): void {
    avatar.sprite.destroy();
    avatar.aura.destroy();
    avatar.hpBg.destroy();
    avatar.hpFill.destroy();
    avatar.shieldFill.destroy();
    avatar.nameLabel.destroy();
    avatar.classLabel.destroy();
    avatar.statusLabel.destroy();
    avatar.sleepLabel.destroy();
  }

  private destroyEnemyAvatar(avatar: EnemyAvatar): void {
    avatar.container.destroy(true);
  }

  private destroyDroppedItemAvatar(avatar: DroppedItemAvatar): void {
    avatar.container.destroy(true);
  }

  private destroyNpcAvatar(avatar: NpcAvatar): void {
    avatar.container.destroy(true);
  }

  private isNearMainPath(x: number, y: number): boolean {
    const verticalPath = x > 700 && x < 900;
    const horizontalPath = y > 660 && y < 850;
    const upperPath = y > 430 && y < 570;

    return verticalPath || horizontalPath || upperPath;
  }
}

const movementInputsEqual = (a: MovementInput, b: MovementInput): boolean =>
  a.left === b.left &&
  a.right === b.right &&
  a.up === b.up &&
  a.down === b.down;

const hasMovementInput = (input: MovementInput): boolean =>
  input.left || input.right || input.up || input.down;

const snapshotPlayer = (player: PlayerNetworkState): PlayerNetworkState => ({
  playerId: player.playerId,
  sessionId: player.sessionId,
  name: player.name,
  className: player.className,
  gender: player.gender,
  skinTone: player.skinTone,
  hairStyle: player.hairStyle,
  hairColor: player.hairColor,
  outfitColor: player.outfitColor,
  accessory: player.accessory,
  spriteVariant: player.spriteVariant,
  mapId: player.mapId ?? WULAND_MAP_ID,
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
  inventory: snapshotInventory(player.inventory),
  selectedHotbarSlot: player.selectedHotbarSlot ?? 0,
  role: player.role,
  joinedAt: player.joinedAt,
  lastSeenAt: player.lastSeenAt,
  lastSavedAt: player.lastSavedAt
});

const snapshotEnemy = (enemy: EnemyNetworkState): EnemyNetworkState => ({
  enemyId: enemy.enemyId,
  type: enemy.type,
  name: enemy.name,
  mapId: enemy.mapId ?? WULAND_MAP_ID,
  x: enemy.x,
  y: enemy.y,
  spawnX: enemy.spawnX,
  spawnY: enemy.spawnY,
  hp: enemy.hp,
  maxHp: enemy.maxHp,
  alive: enemy.alive,
  targetPlayerId: enemy.targetPlayerId,
  markedBy: enemy.markedBy,
  markedUntil: enemy.markedUntil,
  weakenedUntil: enemy.weakenedUntil,
  respawnAt: enemy.respawnAt
});

const snapshotDroppedItem = (item: DroppedItemNetworkState): DroppedItemNetworkState => ({
  droppedItemId: item.droppedItemId,
  itemDefinitionId: item.itemDefinitionId,
  itemInstanceId: item.itemInstanceId,
  quantity: item.quantity,
  mapId: item.mapId ?? WULAND_MAP_ID,
  x: item.x,
  y: item.y,
  droppedByPlayerId: item.droppedByPlayerId,
  droppedAt: item.droppedAt
});

const snapshotNpc = (npc: AmbientNpcNetworkState): AmbientNpcNetworkState => ({
  npcId: npc.npcId,
  type: npc.type,
  displayName: npc.displayName,
  mapId: npc.mapId ?? WULAND_MAP_ID,
  x: npc.x,
  y: npc.y,
  spawnX: npc.spawnX,
  spawnY: npc.spawnY,
  wanderRadius: npc.wanderRadius,
  direction: npc.direction,
  moving: npc.moving,
  speechText: npc.speechText,
  speechUntil: npc.speechUntil
});

const createEmptyClientInventory = (): InventorySlotState[] =>
  Array.from({ length: HOTBAR_SLOT_COUNT }, (_value, slotIndex) => ({
    slotIndex,
    itemDefinitionId: "",
    itemInstanceId: "",
    quantity: 0
  }));

const snapshotInventory = (inventory: PlayerNetworkState["inventory"]): InventorySlotState[] => {
  const slots = createEmptyClientInventory();

  Array.from(inventory ?? []).forEach((slot) => {
    if (slot.slotIndex >= 0 && slot.slotIndex < HOTBAR_SLOT_COUNT) {
      slots[slot.slotIndex] = {
        slotIndex: slot.slotIndex,
        itemDefinitionId: slot.itemDefinitionId,
        itemInstanceId: slot.itemInstanceId,
        quantity: slot.quantity
      };
    }
  });

  return slots;
};

const countPlayers = (
  players: Map<string, PlayerNetworkState>,
  status: "online" | "sleeping"
): number => {
  let count = 0;

  players.forEach((player) => {
    if (status === "online" && player.online) {
      count += 1;
    }

    if (status === "sleeping" && (player.sleeping || !player.online)) {
      count += 1;
    }
  });

  return count;
};

const countAliveEnemies = (enemies: Map<string, EnemyNetworkState>): number => {
  let count = 0;

  enemies.forEach((enemy) => {
    if (enemy.alive) {
      count += 1;
    }
  });

  return count;
};

const nearestDroppedItemClient = (
  position: { x: number; y: number; mapId: WulandMapId },
  droppedItems: Map<string, DroppedItemNetworkState>,
  range: number
): DroppedItemNetworkState | null => {
  let best: DroppedItemNetworkState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  droppedItems.forEach((item) => {
    if (item.mapId !== position.mapId) {
      return;
    }

    const distanceToItem = Phaser.Math.Distance.Between(position.x, position.y, item.x, item.y);

    if (distanceToItem <= range && distanceToItem < bestDistance) {
      best = item;
      bestDistance = distanceToItem;
    }
  });

  return best;
};

const nearestGiftPlayerClient = (
  giver: PlayerNetworkState,
  players: Map<string, PlayerNetworkState>,
  range: number
): PlayerNetworkState | null => {
  let best: PlayerNetworkState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  players.forEach((player) => {
    if (
      player.playerId === giver.playerId ||
      !player.online ||
      player.sleeping ||
      player.defeated ||
      player.mapId !== giver.mapId
    ) {
      return;
    }

    const distanceToPlayer = distanceBetween(giver, player);

    if (distanceToPlayer <= range && distanceToPlayer < bestDistance) {
      best = player;
      bestDistance = distanceToPlayer;
    }
  });

  return best;
};

const nearbyPortalClient = (
  player: PlayerNetworkState,
  range: number
): PortalDefinition | null => {
  const direct = portalAtPosition(player.mapId, player);

  if (direct) {
    return direct;
  }

  let best: PortalDefinition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  portalsForMap(player.mapId).forEach((portal) => {
    const center = {
      x: portal.sourceRect.x + portal.sourceRect.width / 2,
      y: portal.sourceRect.y + portal.sourceRect.height / 2
    };
    const distanceToPortal = distanceBetween(player, center);

    if (distanceToPortal <= range && distanceToPortal < bestDistance) {
      best = portal;
      bestDistance = distanceToPortal;
    }
  });

  return best;
};

const interiorPaletteForMap = (
  mapId: WulandMapId
): { floor: number; wall: number; accent: number } => {
  if (mapId === "rpa_coe") {
    return { floor: 0x425466, wall: 0x1f2f3c, accent: 0x74c0fc };
  }

  if (mapId === "bathroom") {
    return { floor: 0xbfdbe5, wall: 0x4c7f91, accent: 0xe9fbff };
  }

  if (mapId === "kitchen") {
    return { floor: 0xd9a76d, wall: 0x7c3f1d, accent: 0xffec99 };
  }

  if (mapId === "busybeet") {
    return { floor: 0x5f5134, wall: 0x3f321d, accent: 0xfacc15 };
  }

  return { floor: 0x637a55, wall: 0x33432f, accent: 0xd8f5a2 };
};

const npcDefinitionFor = (npcId: string) =>
  WULAND_AMBIENT_NPCS.find((npc) => npc.npcId === npcId);

const npcColor = (type: AmbientNpcNetworkState["type"]): number => {
  if (type === "cleaning-lady") {
    return 0x5f7f8f;
  }

  if (type === "security-guard") {
    return 0x253449;
  }

  if (type === "hr-specialist") {
    return 0x8b5cf6;
  }

  return 0x2f9e44;
};

const distanceBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number =>
  Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

const parseCssColor = (color: string): number =>
  Number.parseInt(color.replace("#", ""), 16);

const isGameplayInputBlocked = (): boolean => {
  const active = document.activeElement;

  if (!(active instanceof HTMLElement)) {
    return false;
  }

  return (
    active.matches("input, textarea, select, [contenteditable='true']") ||
    active.closest("[data-chat-window]") !== null
  );
};
