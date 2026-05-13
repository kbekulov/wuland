import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CHAT_MAX_MESSAGE_LENGTH,
  AMBIENT_NPC_MAX_HP,
  CAVE_TUNNEL_COLLISION_RECTS,
  CLASS_METADATA,
  DEFAULT_COSMETICS,
  ENEMY_DEFINITIONS,
  FLASHLIGHT_ITEM_ID,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  LIGHT_STICK_ITEM_ID,
  LIGHT_STICK_RADIUS,
  WULAND_AMBIENT_NPCS,
  MAP_ID_TO_BUILDING_NAME,
  WULAND_MAP_ID,
  WULAND_MAPS,
  WULAND_WORLD,
  WULAND_MERCHANT,
  WULAND_PROTOCOL_VERSION,
  clampMapPosition,
  collidesWithMap,
  getMapDefinition,
  getMapDisplayName,
  isCakeItemDefinitionId,
  isCaveMapId,
  isPetNpcType,
  portalAtPosition,
  portalsForMap,
  type AmbientNpcNetworkState,
  type ChatMessage,
  type BuildingName,
  type CombatEvent,
  type CombatRequest,
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
  type ShopResultEvent,
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
  type CharacterTextureProfile,
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
  heldItem: Phaser.GameObjects.Image;
  selectionRing: Phaser.GameObjects.Arc;
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
  sprite?: Phaser.GameObjects.Sprite;
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
  icon: Phaser.GameObjects.Image;
  countLabel: Phaser.GameObjects.Text;
  nameLabel: Phaser.GameObjects.Text;
  lastState: DroppedItemNetworkState;
}

interface NpcAvatar {
  npcId: string;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  selectionRing: Phaser.GameObjects.Arc;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  propLabel: Phaser.GameObjects.Text;
  nameLabel: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
  target: Phaser.Math.Vector2;
  lastState: AmbientNpcNetworkState;
}

type SpeechSpeakerType = "player" | "npc" | "merchant";

interface SpeechBubbleAvatar {
  bubbleId: string;
  speakerType: SpeechSpeakerType;
  speakerId: string;
  mapId: WulandMapId;
  label: Phaser.GameObjects.Text;
  expiresAt: number;
  offsetX: number;
  offsetY: number;
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
  money: number;
  activeItemName: string;
  nearbyPickupName: string;
  nearMerchant: boolean;
  nearbyPortalId: string;
  portalPrompt: string;
  nearbyGiftPlayerName: string;
  nearbyPetNpcId: string;
  nearbyPetName: string;
  currentMapId: WulandMapId;
  currentMapName: string;
  totalDroppedItems: number;
  godModeAvailable: boolean;
  godModeCodeRequired: boolean;
  godModeActive: boolean;
  serverProtocolVersion: number;
  serverProtocolOk: boolean;
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
  private speechBubbles = new Map<string, SpeechBubbleAvatar>();
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
    money: 0,
    activeItemName: "No item",
    nearbyPickupName: "",
    nearMerchant: false,
    nearbyPortalId: "",
    portalPrompt: "",
    nearbyGiftPlayerName: "",
    nearbyPetNpcId: "",
    nearbyPetName: "",
    currentMapId: WULAND_MAP_ID,
    currentMapName: getMapDisplayName(WULAND_MAP_ID),
    totalDroppedItems: 0,
    godModeAvailable: false,
    godModeCodeRequired: false,
    godModeActive: false,
    serverProtocolVersion: 0,
    serverProtocolOk: false
  };
  private godModeActive = false;
  private godModeCode = "";
  private selectedEnemyId = "";
  private selectedNpcId = "";
  private selectedPlayerId = "";
  private virtualInput: MovementInput = { ...ZERO_INPUT };
  private joystickPointerId: number | null = null;
  private clickTarget?: Phaser.Math.Vector2;
  private destinationMarker?: Phaser.GameObjects.Arc;
  private merchantSpeechTimer?: Phaser.Time.TimerEvent;
  private caveDarkness?: Phaser.GameObjects.Graphics;
  private caveNotice?: Phaser.GameObjects.Text;
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
    this.resetMobileJoystick();
    this.sendMovementInput(ZERO_INPUT, true);
  };
  private readonly handleViewportControlsChange = (): void => {
    document.body.toggleAttribute("data-touch-controls", shouldUseTouchControls());
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
    this.speechBubbles.clear();
    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();
    this.latestNpcs.clear();
    this.selectedEnemyId = "";
    this.selectedNpcId = "";
    this.selectedPlayerId = "";
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
      money: 0,
      activeItemName: "No item",
      nearbyPickupName: "",
      nearMerchant: false,
      nearbyPortalId: "",
      portalPrompt: "",
      nearbyGiftPlayerName: "",
      nearbyPetNpcId: "",
      nearbyPetName: "",
      currentMapId: this.currentMapId,
      currentMapName: getMapDisplayName(this.currentMapId),
      totalDroppedItems: 0,
      godModeAvailable: false,
      godModeCodeRequired: false,
      godModeActive: false,
      serverProtocolVersion: 0,
      serverProtocolOk: false
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
    this.game.events.on("wuland:clearChat", this.clearChatMessages, this);
    this.game.events.on("wuland:setGodMode", this.setGodMode, this);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("resize", this.handleViewportControlsChange);
    window.addEventListener("orientationchange", this.handleViewportControlsChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    void this.connectToRoom();
  }

  update(time: number, delta: number): void {
    this.sendMovementInputForControls(time);
    this.sendCombatForKeyboard();
    this.updateAvatarPositions(delta);
    this.updateEnemyPositions(delta);
    this.updateNpcPositions(delta);
    this.updateSpeechBubbles();

    const localPlayer = this.latestPlayers.get(this.profile.playerId);

    if (localPlayer) {
      this.updateCaveVisibility(localPlayer);
      this.updateClickTarget(localPlayer, time);
      this.updateInteractionContext(localPlayer);
      this.updateMobileControlHints(localPlayer);
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
      room.onMessage("chatHistory", (messages: ChatMessage[]) => this.handleChatHistory(messages));
      room.onMessage("chatMessage", (message: ChatMessage) => this.handleChatMessage(message));
      room.onMessage("chatCleared", () => this.handleChatCleared());
      room.onMessage("speechBubble", (event: SpeechBubbleEvent) => this.handleSpeechBubble(event));
      room.onMessage("forceDeleted", (event: ForceDeletedEvent) => this.handleForceDeleted(event));
      room.onMessage("shopResult", (event: ShopResultEvent) => this.handleShopResult(event));
      room.onLeave((code, reason) => this.handleRoomLeave(code, reason));
      room.onError((code, message) => this.handleRoomError(code, message));
      this.handleRoomState(room.state);
      if (this.connectionState.serverProtocolOk) {
        room.send("requestChatHistory");
      }
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

    if (isCaveMapId(mapId)) {
      this.drawCave(mapId);
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
    this.caveDarkness = undefined;
    this.caveNotice = undefined;
    this.destroyAllSpeechBubbles();
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
    this.drawCaveEntrance();
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

  private drawCaveEntrance(): void {
    const x = WULAND_WORLD.width / 2;
    const y = 56;
    this.addWorld(this.add.ellipse(x, y + 18, 190, 92, 0x111820, 0.92).setDepth(15));
    this.addWorld(this.add.ellipse(x, y + 24, 132, 62, 0x020509, 1).setDepth(16));
    this.addWorld(this.add.arc(x - 62, y + 23, 26, 265, 92, false, 0x33423a, 0.8).setDepth(17));
    this.addWorld(this.add.arc(x + 62, y + 23, 26, 88, 275, false, 0x33423a, 0.8).setDepth(17));
    this.addWorld(this.add
      .text(x, y + 72, "The Cave", {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#f5f1d5",
        backgroundColor: "rgba(10, 15, 18, 0.78)",
        padding: { x: 7, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(18));
  }

  private drawMerchant(): void {
    const { x, y } = WULAND_MERCHANT;
    const merchantTexture = createCharacterTexture(this, {
      playerId: "wuland-traveling-merchant",
      class: "controller",
      gender: "male",
      cosmetics: {
        ...DEFAULT_COSMETICS,
        skinTone: "cool umber",
        hairStyle: "spiky",
        hairColor: "silver",
        outfitColor: "green",
        accessory: "hat",
        spriteVariant: "scout"
      }
    });

    this.addWorld(this.add.ellipse(x, y + 34, 86, 22, 0x000000, 0.22).setDepth(18));
    this.addWorld(this.add.circle(x - 27, y + 2, 18, 0x2b1c2f, 1).setDepth(29));
    this.addWorld(this.add
      .rectangle(x - 30, y + 7, 24, 42, 0x4b2c54, 1)
      .setStrokeStyle(2, 0x1e1224)
      .setDepth(30));
    this.addWorld(this.add
      .sprite(x, y, merchantTexture)
      .setDepth(34)
      .setScale(1.16));
    this.addWorld(this.add
      .ellipse(x + 22, y + 16, 28, 20, 0x8a5a2d, 1)
      .setStrokeStyle(2, 0x2d1b12)
      .setDepth(33));
    this.addWorld(this.add
      .rectangle(x + 48, y + 28, 72, 24, 0x2f3f52, 0.96)
      .setStrokeStyle(2, 0xfff3bf, 0.8)
      .setDepth(31));
    this.addWorld(this.add.text(x + 48, y + 28, "Wands\nCakes", {
      fontFamily: "Arial, sans-serif",
      fontSize: "10px",
      color: "#fff8e7",
      align: "center"
    }).setOrigin(0.5).setDepth(32));
    this.addWorld(this.add
      .text(x, y - 59, "Odd Merchant", {
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

  private drawCave(mapId: WulandMapId): void {
    const map = WULAND_MAPS[mapId];
    const palette = cavePaletteForMap(mapId);
    const graphics = this.addWorld(this.add.graphics());
    graphics.setDepth(2);
    graphics.fillStyle(palette.floorBase, 1);
    graphics.fillRect(0, 0, map.width, map.height);

    for (let y = 32; y < map.height - 32; y += 32) {
      for (let x = 32; x < map.width - 32; x += 32) {
        const wobble = ((x / 32) * 7 + (y / 32) * 11) % 5;
        graphics.fillStyle(wobble === 0 ? palette.floorLight : wobble === 3 ? palette.floorDark : palette.floor, 1);
        graphics.fillRect(x, y, 32, 32);
      }
    }

    graphics.fillStyle(palette.wallDark, 1);
    graphics.fillRect(0, 0, map.width, 32);
    graphics.fillRect(0, map.height - 32, 1180, 32);
    graphics.fillRect(1380, map.height - 32, map.width - 1380, 32);
    graphics.fillRect(0, 0, 32, map.height);
    graphics.fillRect(map.width - 32, 0, 32, map.height);

    CAVE_TUNNEL_COLLISION_RECTS.forEach((rect, index) => {
      const shade = index % 3 === 0 ? palette.wallLight : index % 3 === 1 ? palette.wall : palette.wallMid;
      graphics.fillStyle(shade, 1);
      graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
      graphics.lineStyle(2, 0x080b10, 0.62);
      graphics.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);

      if (rect.width > 130 && rect.height > 70) {
        graphics.fillStyle(palette.wallDark, 0.34);
        graphics.fillEllipse(
          rect.x + rect.width * 0.35,
          rect.y + rect.height * 0.45,
          rect.width * 0.44,
          rect.height * 0.42
        );
      }
    });

    [
      { x: 330, y: 290, r: 20 },
      { x: 920, y: 720, r: 15 },
      { x: 1370, y: 1370, r: 23 },
      { x: 2185, y: 560, r: 18 },
      { x: 440, y: 1460, r: 17 },
      { x: 2260, y: 1810, r: 22 }
    ].forEach((crystal) => {
      graphics.fillStyle(palette.crystal, 0.2);
      graphics.fillCircle(crystal.x, crystal.y, crystal.r * 2.4);
      graphics.fillStyle(palette.crystalLight, 0.46);
      graphics.fillTriangle(
        crystal.x,
        crystal.y - crystal.r,
        crystal.x - crystal.r * 0.56,
        crystal.y + crystal.r,
        crystal.x + crystal.r * 0.56,
        crystal.y + crystal.r
      );
    });

    [
      { x: 182, y: 1360, w: 180, h: 92 },
      { x: 820, y: 1510, w: 250, h: 120 },
      { x: 1830, y: 338, w: 260, h: 128 },
      { x: 2140, y: 1260, w: 210, h: 106 }
    ].forEach((pool) => {
      graphics.fillStyle(palette.pool, 0.78);
      graphics.fillEllipse(pool.x, pool.y, pool.w, pool.h);
      graphics.lineStyle(2, palette.crystal, 0.24);
      graphics.strokeEllipse(pool.x, pool.y, pool.w, pool.h);
    });

    this.addWorld(this.add
      .text(1280, 2034, map.displayName, {
        fontFamily: "Georgia, serif",
        fontSize: mapId === "the_cave" ? "32px" : "28px",
        color: "#d8f5e5",
        stroke: "#05080b",
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(15));
    this.addWorld(this.add
      .rectangle(1280, 2156, 120, 48, 0x140b08, 1)
      .setStrokeStyle(3, 0x8f6b3f, 0.95)
      .setDepth(13));
    this.drawCaveStairMarkers(mapId);
    this.drawPortalMarkers(mapId);
    this.caveDarkness = this.addWorld(this.add.graphics().setScrollFactor(0).setDepth(146));
    this.caveNotice = this.addWorld(this.add
      .text(0, 0, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#fff8e7",
        backgroundColor: "rgba(7, 10, 13, 0.82)",
        align: "center",
        padding: { x: 10, y: 7 },
        wordWrap: { width: 320, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(147));
  }

  private drawCaveStairMarkers(mapId: WulandMapId): void {
    portalsForMap(mapId)
      .filter((portal) => isCaveMapId(portal.toMapId))
      .forEach((portal) => {
        const x = portal.sourceRect.x + portal.sourceRect.width / 2;
        const y = portal.sourceRect.y + portal.sourceRect.height / 2;
        this.addWorld(this.add
          .ellipse(x, y, portal.sourceRect.width * 0.7, portal.sourceRect.height * 0.48, 0x030506, 0.9)
          .setStrokeStyle(3, 0x6cf2df, 0.45)
          .setDepth(12));
        const label = portal.label.toLowerCase().includes("climb") ? "up" : "deeper";
        this.addWorld(this.add
          .text(x, y - portal.sourceRect.height * 0.58, label, {
            fontFamily: "Arial, sans-serif",
            fontSize: "13px",
            color: "#d8f5e5",
            backgroundColor: "rgba(7, 10, 13, 0.72)",
            padding: { x: 6, y: 2 }
          })
          .setOrigin(0.5)
          .setDepth(16));
      });
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

    this.showAnchoredSpeechBubble({
      bubbleId: `merchant:${WULAND_MERCHANT.id}`,
      speakerType: "merchant",
      speakerId: WULAND_MERCHANT.id,
      mapId: WULAND_MAP_ID,
      text: line,
      expiresAt: Date.now() + 3600,
      offsetX: 34,
      offsetY: -84
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

    this.handleViewportControlsChange();

    const root = document.createElement("div");
    root.className = "mobile-controls";
    root.innerHTML = `
      <div class="mobile-menu-stack" aria-label="Menu controls">
        <button type="button" data-mobile-action="menu" aria-label="Open menu">☰<span>Menu</span></button>
      </div>
      <div class="mobile-joystick" data-mobile-joystick aria-label="Movement joystick">
        <span class="mobile-joystick-ring"></span>
        <span class="mobile-joystick-knob" data-mobile-joystick-knob></span>
      </div>
      <div class="mobile-action-zone" aria-label="Action controls">
        <div class="mobile-radial-menu" data-mobile-radial-menu aria-label="More actions">
          <button type="button" data-mobile-action="use" aria-label="Use">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">Use</span>
          </button>
          <button type="button" data-mobile-action="pickup" aria-label="Open">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">Open</span>
          </button>
          <button type="button" data-mobile-action="gift" aria-label="Gift">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">Gift</span>
          </button>
          <button type="button" data-mobile-action="pet" aria-label="Pet">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">Pet</span>
          </button>
          <button type="button" data-mobile-action="chat" aria-label="Chat">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">Chat</span>
          </button>
          <button type="button" data-mobile-action="help" aria-label="Help">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">Help</span>
          </button>
          <button type="button" data-mobile-action="god" aria-label="God Mode">
            <span class="mobile-control-icon" aria-hidden="true"></span>
            <span class="mobile-control-label">God</span>
          </button>
        </div>
        <button type="button" class="mobile-primary-action" data-mobile-action="primary" aria-label="Attack">
          <span class="mobile-control-icon" aria-hidden="true"></span>
          <span class="mobile-control-label">Attack</span>
        </button>
        <button type="button" class="mobile-act-toggle" data-mobile-action="act-toggle" aria-label="Actions">
          <span class="mobile-control-icon" aria-hidden="true"></span>
          <span class="mobile-control-label">Act</span>
        </button>
        <button type="button" class="mobile-settings-action" data-mobile-action="settings" aria-label="Open settings">
          <span class="mobile-control-icon" aria-hidden="true"></span>
          <span class="mobile-control-label">Settings</span>
        </button>
      </div>
    `;
    uiRoot.appendChild(root);
    this.mobileRoot = root;

    const joystick = root.querySelector<HTMLElement>("[data-mobile-joystick]");
    const joystickKnob = root.querySelector<HTMLElement>("[data-mobile-joystick-knob]");

    if (joystick && joystickKnob) {
      joystick.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.joystickPointerId = event.pointerId;
        joystick.setPointerCapture?.(event.pointerId);
        joystick.classList.add("active");
        this.updateMobileJoystick(event, joystick, joystickKnob);
      });
      joystick.addEventListener("pointermove", (event) => {
        if (this.joystickPointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        this.updateMobileJoystick(event, joystick, joystickKnob);
      });
      const releaseJoystick = (event: PointerEvent): void => {
        if (this.joystickPointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        this.resetMobileJoystick(joystick, joystickKnob);
      };
      joystick.addEventListener("pointerup", releaseJoystick);
      joystick.addEventListener("pointercancel", releaseJoystick);
      joystick.addEventListener("lostpointercapture", () => {
        this.resetMobileJoystick(joystick, joystickKnob);
      });
    }

    root.querySelector('[data-mobile-action="primary"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.handleMobilePrimaryAction();
    });
    root.querySelector('[data-mobile-action="use"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.useSelectedItem();
    });
    root.querySelector('[data-mobile-action="pickup"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.interactOrPickup();
    });
    root.querySelector('[data-mobile-action="gift"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.giftSelectedItem();
    });
    root.querySelector('[data-mobile-action="pet"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.petNearbyAnimal();
    });
    root.querySelector('[data-mobile-action="chat"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.game.events.emit("wuland:focusChat");
    });
    root.querySelector('[data-mobile-action="help"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.game.events.emit("wuland:toggleHelp");
    });
    root.querySelector('[data-mobile-action="god"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.game.events.emit("wuland:toggleGodModeUi");
    });
    root.querySelector('[data-mobile-action="menu"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.game.events.emit("wuland:toggleHelp");
    });
    root.querySelector('[data-mobile-action="act-toggle"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.toggleMobileActionMenu();
    });
    root.querySelector('[data-mobile-action="settings"]')?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.closeMobileActionMenu();
      this.game.events.emit("wuland:toggleHelp", true);
    });
  }

  private updateMobileJoystick(
    event: PointerEvent,
    joystick: HTMLElement,
    knob: HTMLElement
  ): void {
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const maxDistance = Math.max(34, Math.min(rect.width, rect.height) * 0.34);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const normalizedX = x / maxDistance;
    const normalizedY = y / maxDistance;
    const threshold = 0.2;

    knob.style.transform = `translate(calc(-50% + ${Math.round(x)}px), calc(-50% + ${Math.round(y)}px))`;
    this.virtualInput = {
      left: normalizedX < -threshold,
      right: normalizedX > threshold,
      up: normalizedY < -threshold,
      down: normalizedY > threshold
    };

    if (hasMovementInput(this.virtualInput)) {
      this.clearClickTarget(true);
    }
  }

  private resetMobileJoystick(
    joystick = this.mobileRoot?.querySelector<HTMLElement>("[data-mobile-joystick]") ?? undefined,
    knob = this.mobileRoot?.querySelector<HTMLElement>("[data-mobile-joystick-knob]") ?? undefined
  ): void {
    this.joystickPointerId = null;
    this.virtualInput = { ...ZERO_INPUT };
    joystick?.classList.remove("active");
    if (knob) {
      knob.style.transform = "";
    }
  }

  private updateMobileControlHints(player: PlayerNetworkState): void {
    if (!this.mobileRoot) {
      return;
    }

    const selectedItem = player.inventory[player.selectedHotbarSlot];
    const selectedDefinition = selectedItem?.itemDefinitionId
      ? ITEM_DEFINITIONS[selectedItem.itemDefinitionId]
      : null;
    const useButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="use"]');
    const interactButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="pickup"]');
    const giftButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="gift"]');
    const petButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="pet"]');
    const godButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="god"]');
    const primaryButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="primary"]');
    const actButton = this.mobileRoot.querySelector<HTMLButtonElement>('[data-mobile-action="act-toggle"]');
    const primary = this.mobilePrimaryAction(selectedDefinition);

    if (primaryButton) {
      setMobileButtonLabel(primaryButton, primary.label);
      primaryButton.title = primary.title;
      primaryButton.dataset.primaryAction = primary.kind;
    }

    if (actButton) {
      setMobileButtonLabel(actButton, this.mobileRoot.classList.contains("actions-open") ? "Close" : "Act");
    }

    if (useButton) {
      const canUse = selectedDefinition?.itemType === "consumable";
      useButton.disabled = !canUse;
      setMobileButtonLabel(
        useButton,
        selectedDefinition && isCakeItemDefinitionId(selectedDefinition.itemDefinitionId)
          ? "Eat"
          : "Use"
      );
      useButton.title = canUse && selectedDefinition
        ? `Use ${selectedDefinition.displayName}`
        : "Select a cake or consumable first";
    }

    if (interactButton) {
      const hasInteraction =
        Boolean(this.connectionState.nearbyPortalId) ||
        this.connectionState.nearMerchant ||
        Boolean(this.connectionState.nearbyPickupName);

      interactButton.disabled = !hasInteraction;
      interactButton.dataset.interactKind = this.connectionState.nearMerchant
        ? "shop"
        : this.connectionState.nearbyPortalId
          ? "door"
          : this.connectionState.nearbyPickupName
            ? "pick"
            : "interact";
      setMobileButtonLabel(interactButton, this.connectionState.nearMerchant
        ? "Shop"
        : this.connectionState.nearbyPortalId
          ? "Door"
          : this.connectionState.nearbyPickupName
            ? "Pick"
            : "Act");
      interactButton.title = hasInteraction
        ? this.connectionState.portalPrompt || this.connectionState.nearbyPickupName || "Interact"
        : "Stand near a door, item, or merchant";
    }

    if (giftButton) {
      giftButton.disabled = !this.connectionState.nearbyGiftPlayerName;
      giftButton.title = this.connectionState.nearbyGiftPlayerName
        ? `Gift selected cake to ${this.connectionState.nearbyGiftPlayerName}`
        : "Stand near a player with a cake selected";
    }

    if (petButton) {
      petButton.disabled = !this.connectionState.nearbyPetNpcId;
      petButton.title = this.connectionState.nearbyPetName
        ? `Pet ${this.connectionState.nearbyPetName}`
        : "Stand near a cat or dog";
    }

    if (godButton) {
      godButton.disabled = !this.connectionState.godModeAvailable;
      godButton.classList.toggle("active", this.connectionState.godModeActive);
      setMobileButtonLabel(godButton, this.connectionState.godModeActive ? "God On" : "God");
      godButton.title = this.connectionState.godModeActive
        ? "God Mode is active. Tap players or dropped items to delete them."
        : "Toggle prototype God Mode.";
    }
  }

  private handleMobilePrimaryAction(): void {
    const localPlayer = this.latestPlayers.get(this.profile.playerId);
    const selectedItem = localPlayer?.inventory[localPlayer.selectedHotbarSlot];
    const selectedDefinition = selectedItem?.itemDefinitionId
      ? ITEM_DEFINITIONS[selectedItem.itemDefinitionId]
      : null;
    const primary = this.mobilePrimaryAction(selectedDefinition);

    this.closeMobileActionMenu();

    if (primary.kind === "interact") {
      this.interactOrPickup();
      return;
    }

    if (primary.kind === "use") {
      this.useSelectedItem();
      return;
    }

    this.sendWeaponAttack();
  }

  private mobilePrimaryAction(
    selectedDefinition: (typeof ITEM_DEFINITIONS)[ItemDefinitionId] | null
  ): { kind: "attack" | "interact" | "use"; label: string; title: string } {
    if (this.connectionState.nearMerchant) {
      return { kind: "interact", label: "Shop", title: "Open the merchant shop" };
    }

    if (this.connectionState.nearbyPortalId) {
      return { kind: "interact", label: "Door", title: this.connectionState.portalPrompt || "Use nearby door" };
    }

    if (this.connectionState.nearbyPickupName) {
      return { kind: "interact", label: "Pick", title: `Pick up ${this.connectionState.nearbyPickupName}` };
    }

    if (selectedDefinition?.itemType === "consumable") {
      return {
        kind: "use",
        label: isCakeItemDefinitionId(selectedDefinition.itemDefinitionId) ? "Eat" : "Use",
        title: `Use ${selectedDefinition.displayName}`
      };
    }

    return { kind: "attack", label: "Attack", title: "Attack with selected weapon" };
  }

  private toggleMobileActionMenu(): void {
    this.mobileRoot?.classList.toggle("actions-open");
    const actButton = this.mobileRoot?.querySelector<HTMLButtonElement>('[data-mobile-action="act-toggle"]');
    if (actButton) {
      setMobileButtonLabel(actButton, this.mobileRoot?.classList.contains("actions-open") ? "Close" : "Act");
    }
  }

  private closeMobileActionMenu(): void {
    this.mobileRoot?.classList.remove("actions-open");
    const actButton = this.mobileRoot?.querySelector<HTMLButtonElement>('[data-mobile-action="act-toggle"]');
    if (actButton) {
      setMobileButtonLabel(actButton, "Act");
    }
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

  private sendWeaponAttack(): void {
    if (!this.canSendGameplayAction("attack")) {
      return;
    }

    const request = this.buildCombatRequest();
    this.room?.send("attack", request);
  }

  private useSelectedItem(): void {
    if (!this.canSendGameplayAction("use item")) {
      return;
    }

    this.room?.send("useSelectedItem");
  }

  private interactOrPickup(): void {
    if (!this.canSendGameplayAction("interact")) {
      return;
    }

    if (this.connectionState.nearbyPortalId) {
      this.room?.send("usePortal", { portalId: this.connectionState.nearbyPortalId });
      this.clearClickTarget(true);
      return;
    }

    if (this.connectionState.nearMerchant) {
      this.game.events.emit("wuland:openMerchantShop");
      return;
    }

    if (this.connectionState.nearbyPickupName) {
      this.room?.send("pickupItem", {});
      return;
    }

    if (this.connectionState.nearbyPetNpcId) {
      this.petNearbyAnimal();
      return;
    }

    this.room?.send("pickupItem", {});
  }

  private selectHotbarSlot(slotIndex: number): void {
    if (!this.canSendGameplayAction("select item")) {
      return;
    }

    this.room?.send("selectHotbarSlot", { slotIndex });
  }

  private giftSelectedItem(): void {
    if (!this.canSendGameplayAction("gift item")) {
      return;
    }

    this.room?.send("giftSelectedItem", {});
  }

  private petNearbyAnimal(): void {
    if (!this.canSendGameplayAction("pet animal")) {
      return;
    }

    this.room?.send("petNpc", {
      npcId: this.connectionState.nearbyPetNpcId || undefined
    });
  }

  private buyMerchantItem(itemDefinitionId: ItemDefinitionId): void {
    if (!this.canSendGameplayAction("buy item")) {
      this.game.events.emit("wuland:shopFeedback", "Cannot buy: server is not ready");
      return;
    }

    this.room?.send("buyItem", { itemDefinitionId });
  }

  private moveHotbarItem(payload: { fromSlotIndex: number; toSlotIndex: number }): void {
    if (!this.canSendGameplayAction("move item")) {
      return;
    }

    this.room?.send("moveInventoryItem", payload);
  }

  private discardHotbarItem(slotIndex: number): void {
    if (!this.canSendGameplayAction("drop item")) {
      return;
    }

    this.room?.send("discardInventoryItem", { slotIndex });
  }

  private sendChatMessage(payload: { text: string }): void {
    if (!this.canSendGameplayAction("chat")) {
      return;
    }

    const text = payload.text.trim().slice(0, CHAT_MAX_MESSAGE_LENGTH);

    if (text.length === 0) {
      return;
    }

    this.room?.send("chat", { text });
  }

  private clearChatMessages(payload: { code?: string } = {}): void {
    if (!this.canSendGameplayAction("clear chat")) {
      return;
    }

    this.room?.send("clearChat", {
      code: payload.code ?? this.godModeCode
    });
  }

  private canSendGameplayAction(actionLabel: string): boolean {
    if (!this.room) {
      this.setConnectionState({
        status: "disconnected",
        message: `Cannot ${actionLabel}: not connected to WULAND server.`
      });
      return false;
    }

    if (!this.connectionState.serverProtocolOk) {
      const message = `Cannot ${actionLabel}: NAS server image is outdated. Recreate the server container.`;
      const localPlayer = this.latestPlayers.get(this.profile.playerId);
      this.setConnectionState({
        status: "error",
        message
      });

      if (localPlayer) {
        this.showFloatingText(localPlayer.x, localPlayer.y - 44, "server update needed", "#ffd8a8");
      }

      return false;
    }

    return true;
  }

  private setGodMode(payload: { active: boolean; code?: string }): void {
    this.godModeActive = payload.active && this.connectionState.godModeAvailable;
    this.godModeCode = payload.code ?? this.godModeCode;
    this.setConnectionState({
      godModeActive: this.godModeActive
    });
  }

  private buildCombatRequest(): CombatRequest {
    const localPlayer = this.latestPlayers.get(this.profile.playerId);
    const enemy = this.selectedEnemyId ? this.latestEnemies.get(this.selectedEnemyId) : undefined;
    const npc = this.selectedNpcId ? this.latestNpcs.get(this.selectedNpcId) : undefined;
    const targetPlayer = this.selectedPlayerId ? this.latestPlayers.get(this.selectedPlayerId) : undefined;

    return {
      targetEnemyId: enemy?.alive ? this.selectedEnemyId : undefined,
      targetNpcId: npc && !npc.defeated && npc.hp > 0 ? this.selectedNpcId : undefined,
      targetPlayerId:
        targetPlayer &&
        targetPlayer.playerId !== this.profile.playerId &&
        !targetPlayer.defeated &&
        targetPlayer.hp > 0
          ? this.selectedPlayerId
          : undefined,
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

    if (enemy) {
      this.selectCombatTarget("enemy", enemy.enemyId);
      this.showFloatingText(enemy.x, enemy.y, "target", "#fff3bf");
      return;
    }

    const npc = this.npcAtWorldPoint(worldPoint.x, worldPoint.y);

    if (npc) {
      this.selectCombatTarget("npc", npc.npcId);
      this.showFloatingText(npc.x, npc.y, "target", "#fff3bf");
      return;
    }

    const player = this.playerAtWorldPoint(worldPoint.x, worldPoint.y);

    if (player && player.playerId !== this.profile.playerId) {
      this.selectCombatTarget("player", player.playerId);
      this.showFloatingText(player.x, player.y, "target", "#fff3bf");
      return;
    }

    this.selectCombatTarget();
    this.setClickTarget(worldPoint.x, worldPoint.y);
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
      this.selectedNpcId = "";
      this.selectedPlayerId = "";
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
    const serverProtocolVersion = typeof state.serverProtocolVersion === "number"
      ? state.serverProtocolVersion
      : 0;
    const serverProtocolOk = serverProtocolVersion >= WULAND_PROTOCOL_VERSION;
    const protocolState = serverProtocolOk
      ? {
          status: "connected" as const,
          message: this.room
            ? `Connected to room ${this.room.roomId}`
            : "Connected to WULAND"
        }
      : {
          status: "error" as const,
          message: `Server image is outdated. Recreate the NAS container so it runs protocol ${WULAND_PROTOCOL_VERSION}.`
        };

    this.setConnectionState({
      ...protocolState,
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
      money: localPlayer?.money ?? 0,
      activeItemName,
      currentMapId: activeMapId,
      currentMapName: getMapDisplayName(activeMapId),
      totalDroppedItems: state.totalDroppedItems ?? seenDroppedItems.size,
      godModeAvailable: Boolean(state.godModeEnabled),
      godModeCodeRequired: Boolean(state.godModeCodeRequired),
      godModeActive: this.godModeActive,
      serverProtocolVersion,
      serverProtocolOk
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
        heldItem: this.add.image(player.x, player.y, itemIconTextureKey("rock")).setDepth(61).setScale(0.56).setVisible(false),
        selectionRing: this.add.circle(player.x, player.y + 4, 31, 0xffffff, 0).setStrokeStyle(3, 0xfff3bf, 1).setDepth(46).setVisible(false),
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
    const selectedItem = player.inventory[player.selectedHotbarSlot];
    const selectedDefinition = selectedItem?.itemDefinitionId
      ? ITEM_DEFINITIONS[selectedItem.itemDefinitionId]
      : null;
    const heldTexture = selectedDefinition?.iconAsset
      ? itemIconTextureKey(selectedDefinition.itemDefinitionId)
      : "";

    avatar.target.set(player.x, player.y);
    avatar.lastState = player;
    avatar.nameLabel.setText(player.name);
    avatar.classLabel
      .setText(playerClassTitleLabel(player.className))
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
    avatar.selectionRing.setVisible(
      player.playerId === this.selectedPlayerId &&
      player.playerId !== this.profile.playerId &&
      !player.defeated &&
      player.hp > 0
    );
    avatar.heldItem.setVisible(
      Boolean(heldTexture) &&
      this.textures.exists(heldTexture) &&
      player.online &&
      !player.sleeping &&
      !player.defeated
    );

    if (avatar.heldItem.visible && heldTexture) {
      avatar.heldItem.setTexture(heldTexture);
    }

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
      const isZombie = enemy.type === "zombie";
      const body = this.add
        .circle(0, 0, definition.radius, definition.color, 0.95)
        .setVisible(!isZombie);
      const accent = this.add.circle(
        definition.radius * 0.3,
        -definition.radius * 0.25,
        Math.max(5, definition.radius * 0.32),
        definition.accentColor,
        0.9
      ).setVisible(!isZombie);
      const sprite = isZombie
        ? this.add
            .sprite(0, 2, zombieTextureKey(this))
            .setOrigin(0.5, 0.74)
            .setScale(1.08)
        : undefined;
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
        ...(sprite ? [sprite] : []),
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
        sprite,
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
    avatar.body.setVisible(enemy.type !== "zombie");
    avatar.accent.setVisible(enemy.type !== "zombie");
    if (avatar.sprite) {
      const movingLeft = enemy.x < avatar.container.x - 0.3;
      const movingRight = enemy.x > avatar.container.x + 0.3;
      avatar.sprite
        .setVisible(enemy.type === "zombie")
        .setAlpha(enemy.alive ? 1 : 0.22)
        .setFlipX(movingLeft ? true : movingRight ? false : avatar.sprite.flipX)
        .clearTint();
    }
    avatar.hpFill.setDisplaySize(62 * hpPercent, 6);
    avatar.markLabel.setVisible(enemy.markedUntil > Date.now());
    avatar.selectionRing.setVisible(enemy.enemyId === this.selectedEnemyId && enemy.alive);

    if (!enemy.alive && this.selectedEnemyId === enemy.enemyId) {
      this.selectCombatTarget();
    }
  }

  private renderDroppedItem(item: DroppedItemNetworkState): void {
    const definition = ITEM_DEFINITIONS[item.itemDefinitionId];
    let avatar = this.droppedItemAvatars.get(item.droppedItemId);

    if (!avatar) {
      const body = this.add
        .rectangle(0, 0, 42, 36, 0x1f2c2e, 0.9)
        .setStrokeStyle(2, 0xffe8a3, 0.9);
      const icon = this.add
        .image(0, -1, itemIconTextureKey(item.itemDefinitionId))
        .setScale(0.54)
        .setVisible(this.textures.exists(itemIconTextureKey(item.itemDefinitionId)));
      const countLabel = this.add
        .text(13, 11, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          color: "#172224",
          backgroundColor: "#fff3bf",
          fontStyle: "bold",
          padding: { x: 3, y: 1 }
        })
        .setOrigin(0.5);
      const nameLabel = this.add
        .text(0, -31, definition.displayName, {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#1b1c1d",
          backgroundColor: "#fff3bf",
          padding: { x: 5, y: 2 }
        })
        .setOrigin(0.5);
      const container = this.add.container(item.x, item.y, [body, icon, countLabel, nameLabel]);
      container.setDepth(38);
      avatar = {
        droppedItemId: item.droppedItemId,
        container,
        body,
        icon,
        countLabel,
        nameLabel,
        lastState: item
      };
      this.droppedItemAvatars.set(item.droppedItemId, avatar);
    }

    avatar.lastState = item;
    avatar.container.setPosition(item.x, item.y);
    const isLightStick = item.itemDefinitionId === LIGHT_STICK_ITEM_ID;
    const iconKey = itemIconTextureKey(item.itemDefinitionId);
    if (this.textures.exists(iconKey)) {
      avatar.icon.setTexture(iconKey).setVisible(true);
    } else {
      avatar.icon.setVisible(false);
    }
    avatar.body
      .setFillStyle(isLightStick ? 0x1f3d27 : 0x1f2c2e, isLightStick ? 0.94 : 0.9)
      .setStrokeStyle(2, isLightStick ? 0xd9ff99 : 0xffe8a3, isLightStick ? 1 : 0.9);
    avatar.countLabel
      .setText(item.quantity > 1 ? String(item.quantity) : "")
      .setVisible(item.quantity > 1);
    const remainingSeconds = isLightStick && item.expiresAt
      ? Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000))
      : 0;
    avatar.nameLabel.setText(
      isLightStick && remainingSeconds > 0
        ? `${definition.displayName} ${remainingSeconds}s`
        : definition.displayName
    );
  }

  private renderNpc(npc: AmbientNpcNetworkState): void {
    const definition = npcDefinitionFor(npc.npcId);
    const isPet = isPetNpcType(npc.type);
    const textureKey = isPet
      ? animalTextureKey(this, npc)
      : createCharacterTexture(this, npcCharacterProfile(npc));
    let avatar = this.npcAvatars.get(npc.npcId);

    if (!avatar) {
      const selectionRing = this.add
        .circle(0, 4, 30, 0xffffff, 0)
        .setStrokeStyle(3, 0xfff3bf, 1)
        .setVisible(false);
      const sprite = this.add.sprite(0, 0, textureKey).setScale(isPet ? 2.65 : 1.02);
      const hpY = isPet ? -42 : -67;
      const hpBg = this.add.rectangle(-30, hpY, 60, 6, 0x1f272a, 0.88).setOrigin(0, 0.5);
      const hpFill = this.add.rectangle(-30, hpY, 60, 6, 0x69db7c, 1).setOrigin(0, 0.5);
      const propLabel = this.add
        .text(isPet ? 18 : 24, isPet ? 5 : -7, npcPropLabel(npc.type), {
          fontFamily: "Arial, sans-serif",
          fontSize: "9px",
          color: "#172224",
          backgroundColor: "#fff3bf",
          fontStyle: "bold",
          padding: { x: 4, y: 2 }
        })
        .setOrigin(0.5)
        .setVisible(!isPet);
      const nameLabel = this.add
        .text(0, isPet ? -56 : -80, npc.displayName, {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          color: "#fff8e7",
          backgroundColor: "rgba(16, 22, 20, 0.78)",
          padding: { x: 6, y: 2 }
        })
        .setOrigin(0.5);
      const statusLabel = this.add
        .text(0, isPet ? -28 : -48, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#fff3bf",
          backgroundColor: "rgba(35, 38, 45, 0.82)",
          padding: { x: 5, y: 2 }
        })
        .setOrigin(0.5)
        .setVisible(false);
      const container = this.add.container(npc.x, npc.y, [
        selectionRing,
        sprite,
        hpBg,
        hpFill,
        propLabel,
        nameLabel,
        statusLabel
      ]);
      container.setDepth(48);
      avatar = {
        npcId: npc.npcId,
        container,
        sprite,
        selectionRing,
        hpBg,
        hpFill,
        propLabel,
        nameLabel,
        statusLabel,
        target: new Phaser.Math.Vector2(npc.x, npc.y),
        lastState: npc
      };
      this.npcAvatars.set(npc.npcId, avatar);
    } else if (avatar.sprite.texture.key !== textureKey) {
      avatar.sprite.setTexture(textureKey);
    }

    avatar.target.set(npc.x, npc.y);
    avatar.lastState = npc;
    const hpPercent = npc.maxHp > 0 ? Phaser.Math.Clamp(npc.hp / npc.maxHp, 0, 1) : 0;
    const petSleeping = isPet && npc.speechText === "Zzz" && npc.speechUntil > Date.now();
    avatar.nameLabel.setText(npc.displayName);
    avatar.propLabel.setText(npcPropLabel(npc.type)).setVisible(!isPet);
    avatar.hpFill
      .setFillStyle(npc.defeated ? 0xff6b6b : hpPercent < 0.35 ? 0xffd43b : 0x69db7c)
      .setDisplaySize(60 * hpPercent, 6);
    avatar.statusLabel
      .setText(npc.defeated ? "respawning" : petSleeping ? "sleeping" : "")
      .setVisible(npc.defeated || petSleeping);
    avatar.hpBg.setVisible(!npc.defeated);
    avatar.hpFill.setVisible(!npc.defeated);
    avatar.selectionRing.setVisible(npc.npcId === this.selectedNpcId && !npc.defeated && npc.hp > 0);
    avatar.sprite
      .setFlipX(npc.direction === "left")
      .setAngle(petSleeping ? -18 : 0)
      .setScale(isPet ? 2.65 : 1.02)
      .setAlpha(npc.defeated ? 0.46 : definition ? 1 : 0.95)
      .setTint(npc.defeated ? 0xffb3b3 : 0xffffff);

    if (npc.defeated && this.selectedNpcId === npc.npcId) {
      this.selectCombatTarget();
    }

    if (npc.speechText && npc.speechUntil > Date.now()) {
      this.showAnchoredSpeechBubble({
        bubbleId: `npc:${npc.npcId}`,
        speakerType: "npc",
        speakerId: npc.npcId,
        mapId: npc.mapId,
        text: npc.speechText,
        expiresAt: npc.speechUntil,
        offsetX: 0,
        offsetY: isPet ? -62 : -80
      });
    } else {
      this.destroySpeechBubble(`npc:${npc.npcId}`);
    }
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

      if (avatar.sprite && avatar.lastState.alive) {
        const moving = Phaser.Math.Distance.Between(
          avatar.container.x,
          avatar.container.y,
          avatar.target.x,
          avatar.target.y
        ) > 1.4;
        avatar.sprite.y = moving
          ? 2 + Math.sin(this.time.now / 125 + petAnimationSeed(avatar.enemyId)) * 1.6
          : 2;
        avatar.sprite.setAngle(moving ? Math.sin(this.time.now / 210 + petAnimationSeed(avatar.enemyId)) * 2 : 0);
      }
    });
  }

  private updateNpcPositions(delta: number): void {
    const interpolation = Phaser.Math.Clamp(delta / 110, 0.08, 1);

    this.npcAvatars.forEach((avatar) => {
      avatar.container.x = Phaser.Math.Linear(avatar.container.x, avatar.target.x, interpolation);
      avatar.container.y = Phaser.Math.Linear(avatar.container.y, avatar.target.y, interpolation);

      if (isPetNpcType(avatar.lastState.type)) {
        const resting = avatar.lastState.speechText === "Zzz" && avatar.lastState.speechUntil > Date.now();
        const bobPhase = this.time.now / 95 + petAnimationSeed(avatar.npcId);
        avatar.sprite.y = resting ? 5 : avatar.lastState.moving ? Math.sin(bobPhase) * 1.7 : 0;
      }
    });
  }

  private updatePlayerLabels(avatar: PlayerAvatar): void {
    const x = avatar.sprite.x;
    const y = avatar.sprite.y;
    const sleeping = avatar.lastState.sleeping || !avatar.lastState.online;
    const defeated = avatar.lastState.defeated;

    avatar.aura.setPosition(x, y);
    avatar.selectionRing.setPosition(x, y + 4);
    avatar.hpBg.setPosition(x - 30, y - 87);
    avatar.hpFill.setPosition(x - 30, y - 87);
    avatar.shieldFill.setPosition(x - 30, y - 80);
    avatar.sleepLabel.setPosition(x, y - 108);
    avatar.nameLabel.setPosition(x, y - 67);
    avatar.classLabel.setPosition(x, y - 47);
    avatar.statusLabel.setPosition(x, y - 28);
    avatar.statusLabel.setVisible(sleeping || defeated);

    const heldOffset = heldItemOffset(avatar.lastState.direction);
    avatar.heldItem
      .setPosition(x + heldOffset.x, y + heldOffset.y)
      .setDepth(avatar.lastState.direction === "up" ? 49 : 63)
      .setAngle(heldOffset.angle)
      .setFlipX(avatar.lastState.direction === "left");
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
    const petTarget = nearestPetNpcClient(player, this.latestNpcs, 76);
    const nearbyPetNpcId = petTarget?.npcId ?? "";
    const nearbyPetName = petTarget?.displayName ?? "";

    if (
      nearbyPickupName !== this.connectionState.nearbyPickupName ||
      nearbyPortalId !== this.connectionState.nearbyPortalId ||
      portalPrompt !== this.connectionState.portalPrompt ||
      nearMerchant !== this.connectionState.nearMerchant ||
      nearbyGiftPlayerName !== this.connectionState.nearbyGiftPlayerName ||
      nearbyPetNpcId !== this.connectionState.nearbyPetNpcId ||
      nearbyPetName !== this.connectionState.nearbyPetName
    ) {
      this.setConnectionState({
        nearbyPickupName,
        nearbyPortalId,
        portalPrompt,
        nearMerchant,
        nearbyGiftPlayerName,
        nearbyPetNpcId,
        nearbyPetName
      });
    }
  }

  private updateCaveVisibility(player: PlayerNetworkState): void {
    if (!isCaveMapId(this.currentMapId) || !this.caveDarkness || !this.caveNotice) {
      return;
    }

    const selectedItem = player.inventory[player.selectedHotbarSlot];
    const flashlightSelected =
      selectedItem?.itemDefinitionId === FLASHLIGHT_ITEM_ID &&
      (selectedItem.chargeRemainingMs ?? 0) > 0;

    const camera = this.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const playerScreenX = (player.x - camera.worldView.x) * camera.zoom;
    const playerScreenY = (player.y - camera.worldView.y) * camera.zoom;
    const lightSticks = this.activeLightStickScreenSources(camera);

    if (flashlightSelected) {
      this.caveDarkness.clear();
      this.drawFlashlightOverlay(
        this.caveDarkness,
        width,
        height,
        playerScreenX,
        playerScreenY,
        player.direction,
        lightSticks
      );
      this.drawLightStickGlows(this.caveDarkness, lightSticks);
      this.caveNotice.setVisible(false);
      return;
    }

    this.caveDarkness.clear();
    this.drawCaveLowLightOverlay(this.caveDarkness, width, height, playerScreenX, playerScreenY, lightSticks);

    const hasFlashlight = player.inventory.some((slot) =>
      slot.itemDefinitionId === FLASHLIGHT_ITEM_ID && (slot.chargeRemainingMs ?? 0) > 0
    );
    const noticeY = height > width ? Math.min(height * 0.32, 260) : 72;
    this.caveNotice
      .setWordWrapWidth(Math.min(width - 48, 360), true)
      .setText(
        hasFlashlight
          ? "Select your Flashlight in the hotbar to light the cave."
          : "The cave swallows the light. Buy a Flashlight from the merchant, then select it in your hotbar to explore safely."
      )
      .setPosition(width / 2, noticeY)
      .setVisible(true);
  }

  private activeLightStickScreenSources(
    camera: Phaser.Cameras.Scene2D.Camera
  ): Array<{ x: number; y: number; radius: number }> {
    const now = Date.now();
    const sources: Array<{ x: number; y: number; radius: number }> = [];

    this.latestDroppedItems.forEach((item) => {
      if (
        item.itemDefinitionId !== LIGHT_STICK_ITEM_ID ||
        item.mapId !== this.currentMapId ||
        !item.expiresAt ||
        item.expiresAt <= now
      ) {
        return;
      }

      sources.push({
        x: (item.x - camera.worldView.x) * camera.zoom,
        y: (item.y - camera.worldView.y) * camera.zoom,
        radius: LIGHT_STICK_RADIUS * camera.zoom
      });
    });

    return sources;
  }

  private drawLightStickGlows(
    graphics: Phaser.GameObjects.Graphics,
    sources: Array<{ x: number; y: number; radius: number }>
  ): void {
    sources.forEach((source) => {
      graphics.fillStyle(0x9dff8f, 0.055);
      graphics.fillCircle(source.x, source.y, source.radius * 1.06);
      graphics.fillStyle(0xd9ff99, 0.075);
      graphics.fillCircle(source.x, source.y, source.radius * 0.64);
    });
  }

  private drawCaveLowLightOverlay(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    playerScreenX: number,
    playerScreenY: number,
    extraLights: Array<{ x: number; y: number; radius: number }> = []
  ): void {
    const radius = Math.max(70, Math.min(width, height) * 0.12);
    const bandHeight = 8;
    const lights = [
      { x: playerScreenX, y: playerScreenY, radius },
      ...extraLights
    ];

    graphics.fillStyle(0x020407, 0.9);

    for (let y = 0; y < height; y += bandHeight) {
      const bandCenterY = y + bandHeight / 2;
      const intervals: Array<{ left: number; right: number }> = [];

      lights.forEach((light) => {
        const dy = bandCenterY - light.y;

        if (Math.abs(dy) >= light.radius) {
          return;
        }

        const halfWidth = Math.sqrt(light.radius * light.radius - dy * dy);
        intervals.push({
          left: Phaser.Math.Clamp(light.x - halfWidth, 0, width),
          right: Phaser.Math.Clamp(light.x + halfWidth, 0, width)
        });
      });

      if (intervals.length === 0) {
        graphics.fillRect(0, y, width, bandHeight + 1);
        continue;
      }

      intervals.sort((a, b) => a.left - b.left);
      let cursor = 0;
      let mergedRight = intervals[0].right;

      intervals.forEach((interval, index) => {
        if (index === 0) {
          if (interval.left > cursor) {
            graphics.fillRect(cursor, y, interval.left - cursor, bandHeight + 1);
          }
          return;
        }

        if (interval.left > mergedRight) {
          graphics.fillRect(mergedRight, y, interval.left - mergedRight, bandHeight + 1);
          mergedRight = interval.right;
          return;
        }

        mergedRight = Math.max(mergedRight, interval.right);
      });

      if (mergedRight < width) {
        graphics.fillRect(mergedRight, y, width - mergedRight, bandHeight + 1);
      }
    }

    this.drawLightStickGlows(graphics, extraLights);
    this.drawScreenVignette(graphics, width, height, 0.74);
  }

  private drawFlashlightOverlay(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    playerScreenX: number,
    playerScreenY: number,
    direction: Direction,
    extraLights: Array<{ x: number; y: number; radius: number }> = []
  ): void {
    this.drawFlashlightBackShadow(graphics, width, height, playerScreenX, playerScreenY, direction, extraLights);
    this.drawScreenVignette(graphics, width, height, 0.42);

    const directionVector = vectorForDirection(direction);
    const perpendicular = { x: -directionVector.y, y: directionVector.x };
    const length = Math.min(Math.max(width, height) * 0.64, 620);
    const farHalfWidth = Math.min(length * 0.42, 260);
    const origin = {
      x: playerScreenX + directionVector.x * 18,
      y: playerScreenY + directionVector.y * 18
    };
    const end = {
      x: origin.x + directionVector.x * length,
      y: origin.y + directionVector.y * length
    };

    for (let layer = 7; layer >= 1; layer -= 1) {
      const t = layer / 7;
      const layerEnd = {
        x: origin.x + directionVector.x * length * t,
        y: origin.y + directionVector.y * length * t
      };
      const layerHalfWidth = farHalfWidth * (0.18 + t * 0.82);
      const alpha = (0.018 + (1 - t) * 0.034) * 0.5;

      graphics.fillStyle(0xfff3bf, alpha);
      graphics.fillTriangle(
        origin.x,
        origin.y,
        layerEnd.x + perpendicular.x * layerHalfWidth,
        layerEnd.y + perpendicular.y * layerHalfWidth,
        layerEnd.x - perpendicular.x * layerHalfWidth,
        layerEnd.y - perpendicular.y * layerHalfWidth
      );
    }

    graphics.fillStyle(0xfff8dc, 0.042);
    graphics.fillTriangle(
      origin.x,
      origin.y,
      end.x + perpendicular.x * farHalfWidth * 0.46,
      end.y + perpendicular.y * farHalfWidth * 0.46,
      end.x - perpendicular.x * farHalfWidth * 0.46,
      end.y - perpendicular.y * farHalfWidth * 0.46
    );
    graphics.lineStyle(2, 0xfff3bf, 0.06);
    graphics.lineBetween(origin.x, origin.y, end.x + perpendicular.x * farHalfWidth, end.y + perpendicular.y * farHalfWidth);
    graphics.lineBetween(origin.x, origin.y, end.x - perpendicular.x * farHalfWidth, end.y - perpendicular.y * farHalfWidth);
    graphics.fillStyle(0xfff3bf, 0.06);
    graphics.fillCircle(origin.x, origin.y, 54);
  }

  private drawFlashlightBackShadow(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    playerScreenX: number,
    playerScreenY: number,
    direction: Direction,
    extraLights: Array<{ x: number; y: number; radius: number }> = []
  ): void {
    const bandHeight = 8;
    graphics.fillStyle(0x020407, 0.88);

    for (let y = 0; y < height; y += bandHeight) {
      const bandCenterY = y + bandHeight / 2;
      const shadowIntervals = flashlightShadowIntervalsForBand(
        width,
        playerScreenX,
        playerScreenY,
        bandCenterY,
        direction
      );

      if (shadowIntervals.length === 0) {
        continue;
      }

      const lightIntervals = lightIntervalsForBand(extraLights, bandCenterY, width);
      const darkIntervals = subtractIntervals(shadowIntervals, lightIntervals);

      darkIntervals.forEach((interval) => {
        if (interval.right > interval.left) {
          graphics.fillRect(interval.left, y, interval.right - interval.left, bandHeight + 1);
        }
      });
    }
  }

  private drawScreenVignette(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    strength: number
  ): void {
    const layers = 18;
    const maxInset = Math.min(width, height) * 0.38;

    for (let index = 0; index < layers; index += 1) {
      const inset = (index / layers) * maxInset;
      const alpha = strength * Math.pow(1 - index / layers, 2) * 0.18;

      graphics.lineStyle(Math.max(width, height) * 0.07, 0x020407, alpha);
      graphics.strokeRect(
        inset,
        inset,
        Math.max(0, width - inset * 2),
        Math.max(0, height - inset * 2)
      );
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

    if (
      event.type === "shop" ||
      event.text === "Inventory full" ||
      event.text === "Not enough money" ||
      event.text === "Item is not for sale" ||
      event.text === "Shop is too far away"
    ) {
      this.game.events.emit("wuland:shopFeedback", event.text);
    }

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

  private handleShopResult(event: ShopResultEvent): void {
    if (!this.sceneActive) {
      return;
    }

    this.game.events.emit("wuland:shopFeedback", event.message);
  }

  private handleChatMessage(message: ChatMessage): void {
    this.game.events.emit("wuland:chatMessage", message);
  }

  private handleChatHistory(messages: ChatMessage[]): void {
    this.game.events.emit("wuland:chatHistory", messages);
  }

  private handleChatCleared(): void {
    this.game.events.emit("wuland:chatCleared");
  }

  private handleSpeechBubble(event: SpeechBubbleEvent): void {
    if (event.mapId !== this.currentMapId) {
      return;
    }

    this.showAnchoredSpeechBubble({
      bubbleId: `${event.sourceType}:${event.sourceId}`,
      speakerType: event.sourceType,
      speakerId: event.sourceId,
      mapId: event.mapId,
      text: event.text,
      expiresAt: Date.now() + 3600,
      offsetX: 0,
      offsetY: event.sourceType === "player" ? -95 : -80
    });
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

  private showAnchoredSpeechBubble(options: {
    bubbleId: string;
    speakerType: SpeechSpeakerType;
    speakerId: string;
    mapId: WulandMapId;
    text: string;
    expiresAt: number;
    offsetX: number;
    offsetY: number;
  }): void {
    const text = options.text.slice(0, CHAT_MAX_MESSAGE_LENGTH);

    if (!text) {
      this.destroySpeechBubble(options.bubbleId);
      return;
    }

    const existing = this.speechBubbles.get(options.bubbleId);

    if (existing) {
      existing.label.setText(text).setAlpha(1);
      existing.expiresAt = options.expiresAt;
      existing.mapId = options.mapId;
      existing.offsetX = options.offsetX;
      existing.offsetY = options.offsetY;
      this.updateSpeechBubblePosition(existing);
      return;
    }

    const label = this.add
      .text(0, 0, text, {
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

    const bubble: SpeechBubbleAvatar = {
      ...options,
      label
    };
    this.speechBubbles.set(options.bubbleId, bubble);
    this.updateSpeechBubblePosition(bubble);
  }

  private updateSpeechBubbles(): void {
    const now = Date.now();

    for (const [bubbleId, bubble] of this.speechBubbles) {
      if (bubble.mapId !== this.currentMapId || bubble.expiresAt <= now) {
        this.destroySpeechBubble(bubbleId);
        continue;
      }

      if (!this.updateSpeechBubblePosition(bubble)) {
        this.destroySpeechBubble(bubbleId);
        continue;
      }

      const remaining = bubble.expiresAt - now;
      bubble.label.setAlpha(remaining < 650 ? Phaser.Math.Clamp(remaining / 650, 0, 1) : 1);
    }
  }

  private updateSpeechBubblePosition(bubble: SpeechBubbleAvatar): boolean {
    const position = this.speechSpeakerPosition(bubble);

    if (!position) {
      return false;
    }

    bubble.label.setPosition(position.x + bubble.offsetX, position.y + bubble.offsetY);
    return true;
  }

  private speechSpeakerPosition(bubble: SpeechBubbleAvatar): { x: number; y: number } | null {
    if (bubble.speakerType === "player") {
      const avatar = this.avatars.get(bubble.speakerId);
      return avatar ? { x: avatar.sprite.x, y: avatar.sprite.y } : null;
    }

    if (bubble.speakerType === "npc") {
      const avatar = this.npcAvatars.get(bubble.speakerId);
      return avatar ? { x: avatar.container.x, y: avatar.container.y } : null;
    }

    if (bubble.speakerId === WULAND_MERCHANT.id && this.currentMapId === WULAND_MAP_ID) {
      return { x: WULAND_MERCHANT.x, y: WULAND_MERCHANT.y };
    }

    return null;
  }

  private destroySpeechBubble(bubbleId: string): void {
    const bubble = this.speechBubbles.get(bubbleId);

    if (!bubble) {
      return;
    }

    bubble.label.destroy();
    this.speechBubbles.delete(bubbleId);
  }

  private destroyAllSpeechBubbles(): void {
    this.speechBubbles.forEach((bubble) => bubble.label.destroy());
    this.speechBubbles.clear();
  }

  private showAttackEffect(event: CombatEvent): void {
    const source = this.avatars.get(event.sourceId);
    const itemDefinitionId = event.itemDefinitionId ?? "rock";
    const itemDefinition = ITEM_DEFINITIONS[itemDefinitionId];

    if (source) {
      this.showHeldWeaponSwing(source, itemDefinitionId, event);
    }

    if (itemDefinition?.attackShape === "arc") {
      this.showSwordSlash(source, event);
      return;
    }

    this.showWeaponProjectile(source, itemDefinitionId, event);
  }

  private showHeldWeaponSwing(
    source: PlayerAvatar,
    itemDefinitionId: ItemDefinitionId,
    event: CombatEvent
  ): void {
    const iconKey = itemIconTextureKey(itemDefinitionId);

    if (!this.textures.exists(iconKey)) {
      return;
    }

    const direction = source.lastState.direction;
    const heldOffset = heldItemOffset(direction);
    const directionVector = vectorForDirection(direction);
    const swingDirection = direction === "left" || direction === "up" ? -1 : 1;
    const startX = source.sprite.x + heldOffset.x;
    const startY = source.sprite.y + heldOffset.y;
    const scale = itemDefinitionId === "sword" ? 0.72 : 0.62;
    const swing = this.add
      .image(startX, startY, iconKey)
      .setDepth(direction === "up" ? 55 : 112)
      .setScale(scale)
      .setAngle(heldOffset.angle - 42 * swingDirection)
      .setFlipX(direction === "left")
      .setAlpha(0.96);

    this.tweens.add({
      targets: swing,
      x: startX + directionVector.x * (itemDefinitionId === "sword" ? 30 : 18),
      y: startY + directionVector.y * (itemDefinitionId === "sword" ? 30 : 18) - 4,
      angle: heldOffset.angle + 104 * swingDirection,
      scale: scale * 1.08,
      alpha: 0.12,
      duration: itemDefinitionId === "sword" ? 155 : 130,
      ease: "Sine.easeOut",
      onComplete: () => swing.destroy()
    });

    if (itemDefinitionId === "magic-wand") {
      const spark = this.add
        .circle(startX + directionVector.x * 18, startY + directionVector.y * 18, 9, parseCssColor(event.color), 0.34)
        .setStrokeStyle(2, 0xffffff, 0.7)
        .setDepth(111);

      this.tweens.add({
        targets: spark,
        scaleX: 1.7,
        scaleY: 1.7,
        alpha: 0,
        duration: 210,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy()
      });
    }
  }

  private showSwordSlash(source: PlayerAvatar | undefined, event: CombatEvent): void {
    const color = parseCssColor(event.color);
    const direction = source?.lastState.direction ?? "down";
    const origin = source
      ? {
          x: source.sprite.x + vectorForDirection(direction).x * 34,
          y: source.sprite.y + vectorForDirection(direction).y * 34 - 10
        }
      : { x: event.x, y: event.y };
    const arc = slashArcForDirection(direction);
    const slash = this.add.graphics().setDepth(109);

    slash.lineStyle(9, 0xfff8c7, 0.82);
    slash.beginPath();
    slash.arc(origin.x, origin.y, 38, arc.start, arc.end, false);
    slash.strokePath();
    slash.lineStyle(4, color, 0.72);
    slash.beginPath();
    slash.arc(origin.x, origin.y, 49, arc.start + 0.1, arc.end - 0.1, false);
    slash.strokePath();

    const hit = this.add
      .circle(event.x, event.y, 12, color, 0.18)
      .setStrokeStyle(2, 0xfff8c7, 0.55)
      .setDepth(108);

    this.tweens.add({
      targets: [slash, hit],
      alpha: 0,
      duration: 190,
      ease: "Sine.easeOut",
      onComplete: () => {
        slash.destroy();
        hit.destroy();
      }
    });
  }

  private showWeaponProjectile(
    source: PlayerAvatar | undefined,
    itemDefinitionId: ItemDefinitionId,
    event: CombatEvent
  ): void {
    const iconKey = itemIconTextureKey(itemDefinitionId);
    const heldOffset = source ? heldItemOffset(source.lastState.direction) : { x: 0, y: -10, angle: 0 };
    const start = source
      ? { x: source.sprite.x + heldOffset.x, y: source.sprite.y + heldOffset.y }
      : { x: event.x, y: event.y };
    const color = parseCssColor(event.color);
    const projectile = this.textures.exists(iconKey)
      ? this.add
          .image(start.x, start.y, iconKey)
          .setScale(itemDefinitionId === "rock" ? 0.44 : 0.52)
          .setAngle(heldOffset.angle)
          .setDepth(106)
      : this.add.circle(start.x, start.y, 7, color, 0.92).setDepth(106);

    const glow = this.add
      .circle(start.x, start.y, itemDefinitionId === "magic-wand" ? 12 : 9, color, itemDefinitionId === "magic-wand" ? 0.22 : 0.12)
      .setDepth(105);

    this.tweens.add({
      targets: projectile,
      x: event.x,
      y: event.y,
      angle: projectile.angle + (itemDefinitionId === "rock" ? 720 : 120),
      alpha: 0.24,
      duration: itemDefinitionId === "rock" ? 230 : 260,
      ease: "Quad.easeOut",
      onComplete: () => projectile.destroy()
    });

    this.tweens.add({
      targets: glow,
      x: event.x,
      y: event.y,
      scaleX: 1.45,
      scaleY: 1.45,
      alpha: 0,
      duration: itemDefinitionId === "rock" ? 230 : 260,
      ease: "Quad.easeOut",
      onComplete: () => glow.destroy()
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
    if (avatar.sprite) {
      avatar.sprite.setTint(color);

      this.time.delayedCall(110, () => {
        avatar.sprite?.clearTint();
      });
    }

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

  private npcAtWorldPoint(x: number, y: number): AmbientNpcNetworkState | null {
    let best: AmbientNpcNetworkState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.latestNpcs.forEach((npc) => {
      if (npc.mapId !== this.currentMapId || npc.defeated || npc.hp <= 0) {
        return;
      }

      const distanceToNpc = Phaser.Math.Distance.Between(x, y, npc.x, npc.y);

      if (distanceToNpc <= 36 && distanceToNpc < bestDistance) {
        best = npc;
        bestDistance = distanceToNpc;
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

  private selectCombatTarget(type?: "enemy" | "npc" | "player", id = ""): void {
    this.selectedEnemyId = type === "enemy" ? id : "";
    this.selectedNpcId = type === "npc" ? id : "";
    this.selectedPlayerId = type === "player" ? id : "";
    this.refreshCombatSelection();
  }

  private refreshCombatSelection(): void {
    this.enemyAvatars.forEach((avatar) => {
      avatar.selectionRing.setVisible(
        avatar.enemyId === this.selectedEnemyId && avatar.lastState.alive
      );
    });

    this.npcAvatars.forEach((avatar) => {
      avatar.selectionRing.setVisible(
        avatar.npcId === this.selectedNpcId &&
        !avatar.lastState.defeated &&
        avatar.lastState.hp > 0
      );
    });

    this.avatars.forEach((avatar) => {
      avatar.selectionRing.setVisible(
        avatar.playerId === this.selectedPlayerId &&
        avatar.playerId !== this.profile.playerId &&
        !avatar.lastState.defeated &&
        avatar.lastState.hp > 0
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
    const isUnregisteredAction = message?.toLowerCase().includes("not registered") ?? false;

    this.setConnectionState({
      status: "error",
      message: isUnregisteredAction
        ? "Server image is outdated. Recreate the NAS container, then hard-refresh the browser."
        : message || `WULAND server error (${code})`
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
    this.game.events.off("wuland:clearChat", this.clearChatMessages, this);
    this.game.events.off("wuland:setGodMode", this.setGodMode, this);
    window.removeEventListener("blur", this.handleWindowBlur);
    window.removeEventListener("resize", this.handleViewportControlsChange);
    window.removeEventListener("orientationchange", this.handleViewportControlsChange);
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
    this.destroySpeechBubble(`player:${avatar.playerId}`);
    avatar.sprite.destroy();
    avatar.heldItem.destroy();
    avatar.selectionRing.destroy();
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
    this.destroySpeechBubble(`npc:${avatar.npcId}`);
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
  money: typeof player.money === "number" ? player.money : 0,
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
  chargeRemainingMs: item.chargeRemainingMs ?? 0,
  mapId: item.mapId ?? WULAND_MAP_ID,
  x: item.x,
  y: item.y,
  droppedByPlayerId: item.droppedByPlayerId,
  droppedAt: item.droppedAt,
  expiresAt: item.expiresAt ?? 0
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
  hp: typeof npc.hp === "number" ? npc.hp : AMBIENT_NPC_MAX_HP,
  maxHp: typeof npc.maxHp === "number" ? npc.maxHp : AMBIENT_NPC_MAX_HP,
  defeated: Boolean(npc.defeated),
  respawnAt: typeof npc.respawnAt === "number" ? npc.respawnAt : 0,
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
    quantity: 0,
    chargeRemainingMs: 0
  }));

const snapshotInventory = (inventory: PlayerNetworkState["inventory"]): InventorySlotState[] => {
  const slots = createEmptyClientInventory();

  Array.from(inventory ?? []).forEach((slot) => {
    if (slot.slotIndex >= 0 && slot.slotIndex < HOTBAR_SLOT_COUNT) {
      slots[slot.slotIndex] = {
        slotIndex: slot.slotIndex,
        itemDefinitionId: slot.itemDefinitionId,
        itemInstanceId: slot.itemInstanceId,
        quantity: slot.quantity,
        chargeRemainingMs: slot.chargeRemainingMs ?? 0
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

const nearestPetNpcClient = (
  player: PlayerNetworkState,
  npcs: Map<string, AmbientNpcNetworkState>,
  range: number
): AmbientNpcNetworkState | null => {
  let best: AmbientNpcNetworkState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  npcs.forEach((npc) => {
    if (
      !isPetNpcType(npc.type) ||
      npc.defeated ||
      npc.mapId !== player.mapId
    ) {
      return;
    }

    const distanceToNpc = distanceBetween(player, npc);

    if (distanceToNpc <= range && distanceToNpc < bestDistance) {
      best = npc;
      bestDistance = distanceToNpc;
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

const cavePaletteForMap = (
  mapId: WulandMapId
): {
  floorBase: number;
  floor: number;
  floorLight: number;
  floorDark: number;
  wall: number;
  wallMid: number;
  wallLight: number;
  wallDark: number;
  crystal: number;
  crystalLight: number;
  pool: number;
} => {
  if (mapId === "the_cave_abyss") {
    return {
      floorBase: 0x09080f,
      floor: 0x11101a,
      floorLight: 0x191522,
      floorDark: 0x07060b,
      wall: 0x21192b,
      wallMid: 0x18131f,
      wallLight: 0x2d2138,
      wallDark: 0x050409,
      crystal: 0xbc5cff,
      crystalLight: 0xf3c7ff,
      pool: 0x170927
    };
  }

  if (mapId === "the_cave_depths") {
    return {
      floorBase: 0x0c1214,
      floor: 0x111a1c,
      floorLight: 0x1b2728,
      floorDark: 0x070c0e,
      wall: 0x1f3134,
      wallMid: 0x172629,
      wallLight: 0x2c4245,
      wallDark: 0x04090a,
      crystal: 0x5eead4,
      crystalLight: 0xccfbf1,
      pool: 0x061d22
    };
  }

  return {
    floorBase: 0x10151c,
    floor: 0x121922,
    floorLight: 0x18222b,
    floorDark: 0x0c1118,
    wall: 0x202a34,
    wallMid: 0x171f28,
    wallLight: 0x27323d,
    wallDark: 0x05080c,
    crystal: 0x35d0ba,
    crystalLight: 0x6cf2df,
    pool: 0x071d26
  };
};

const npcDefinitionFor = (npcId: string) =>
  WULAND_AMBIENT_NPCS.find((npc) => npc.npcId === npcId);

const playerClassTitleLabel = (className: PlayerNetworkState["className"]): string =>
  CLASS_METADATA[className].displayName
    .replace(/^Senior /, "Sr ")
    .replace(/^Application /, "App ");

const itemIconTextureKey = (itemDefinitionId: ItemDefinitionId): string =>
  `item-icon-${itemDefinitionId}`;

const heldItemOffset = (
  direction: Direction
): { x: number; y: number; angle: number } => {
  if (direction === "left") {
    return { x: -23, y: -18, angle: -28 };
  }

  if (direction === "right") {
    return { x: 23, y: -18, angle: 28 };
  }

  if (direction === "up") {
    return { x: 14, y: -29, angle: -8 };
  }

  return { x: 21, y: -16, angle: 18 };
};

const vectorForDirection = (direction: Direction): { x: number; y: number } => {
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

const slashArcForDirection = (direction: Direction): { start: number; end: number } => {
  if (direction === "left") {
    return { start: Phaser.Math.DegToRad(125), end: Phaser.Math.DegToRad(235) };
  }

  if (direction === "right") {
    return { start: Phaser.Math.DegToRad(-55), end: Phaser.Math.DegToRad(55) };
  }

  if (direction === "up") {
    return { start: Phaser.Math.DegToRad(215), end: Phaser.Math.DegToRad(325) };
  }

  return { start: Phaser.Math.DegToRad(35), end: Phaser.Math.DegToRad(145) };
};

const npcCharacterProfile = (npc: AmbientNpcNetworkState): CharacterTextureProfile => {
  const visual = isPetNpcType(npc.type)
    ? NPC_CHARACTER_VISUALS.intern
    : NPC_CHARACTER_VISUALS[npc.type] ?? NPC_CHARACTER_VISUALS.intern;

  return {
    playerId: `npc-${npc.npcId}`,
    class: visual.class,
    gender: visual.gender,
    cosmetics: visual.cosmetics
  };
};

const animalTextureKey = (scene: Phaser.Scene, npc: AmbientNpcNetworkState): string => {
  const petKey = petSpriteTextureKey(npc.type === "dog" ? "dog" : "cat");

  if (scene.textures.exists(petKey)) {
    return petKey;
  }

  const definition = npcDefinitionFor(npc.npcId);
  const color = definition?.color ?? (npc.type === "cat" ? 0x5a3a2e : 0x8b5e34);
  const accent = definition?.accentColor ?? 0xfff3bf;
  const textureKey = `fallback-animal-${npc.type}-${color.toString(16)}-${accent.toString(16)}`;

  if (scene.textures.exists(textureKey)) {
    return textureKey;
  }

  const graphics = scene.add.graphics({ x: -1000, y: -1000 });
  graphics.fillStyle(0x000000, 0.22);
  graphics.fillEllipse(32, 52, 38, 10);
  graphics.fillStyle(color, 1);
  graphics.fillEllipse(30, 35, 38, 22);
  graphics.fillCircle(50, 29, npc.type === "dog" ? 14 : 12);
  graphics.fillStyle(accent, 1);
  graphics.fillEllipse(25, 38, 16, 9);
  graphics.fillCircle(55, 30, 5);
  graphics.fillStyle(0x11181a, 1);
  graphics.fillCircle(54, 25, 2.2);
  graphics.fillCircle(54, 33, 2.2);

  if (npc.type === "cat") {
    graphics.fillStyle(color, 1);
    graphics.fillTriangle(43, 20, 48, 7, 53, 20);
    graphics.fillTriangle(54, 20, 61, 9, 62, 24);
    graphics.lineStyle(4, color, 1);
    graphics.beginPath();
    graphics.moveTo(13, 34);
    graphics.lineTo(7, 27);
    graphics.strokePath();
  } else {
    graphics.fillStyle(color, 1);
    graphics.fillEllipse(42, 30, 8, 20);
    graphics.fillEllipse(61, 30, 8, 20);
    graphics.lineStyle(5, accent, 1);
    graphics.beginPath();
    graphics.moveTo(12, 34);
    graphics.lineTo(5, 26);
    graphics.strokePath();
  }

  graphics.generateTexture(textureKey, 64, 64);
  graphics.destroy();
  return textureKey;
};

const petSpriteTextureKey = (type: "cat" | "dog"): string => `pet-sprite-${type}`;

const zombieTextureKey = (scene: Phaser.Scene): string => {
  const textureKey = "enemy-zombie-human-v2";

  if (scene.textures.exists(textureKey)) {
    return textureKey;
  }

  const graphics = scene.add.graphics({ x: -1000, y: -1000 });
  graphics.fillStyle(0x000000, 0.28);
  graphics.fillEllipse(32, 69, 42, 12);

  graphics.lineStyle(4, 0x24202a, 1);
  graphics.fillStyle(0x263447, 1);
  graphics.fillRect(23, 46, 8, 18);
  graphics.fillRect(35, 46, 8, 18);
  graphics.fillStyle(0x141923, 1);
  graphics.fillRect(19, 62, 14, 6);
  graphics.fillRect(34, 62, 14, 6);

  graphics.lineStyle(5, 0x6f9273, 1);
  graphics.beginPath();
  graphics.moveTo(20, 30);
  graphics.lineTo(8, 42);
  graphics.moveTo(45, 30);
  graphics.lineTo(57, 41);
  graphics.strokePath();

  graphics.lineStyle(3, 0x1a2022, 1);
  graphics.fillStyle(0x314e49, 1);
  graphics.fillRect(20, 25, 26, 27);
  graphics.fillStyle(0x596f64, 1);
  graphics.fillTriangle(20, 25, 31, 47, 20, 52);
  graphics.fillStyle(0x4b2b30, 1);
  graphics.fillTriangle(46, 25, 36, 48, 46, 52);
  graphics.strokeRect(20, 25, 26, 27);

  graphics.fillStyle(0x82a77c, 1);
  graphics.fillCircle(32, 16, 14);
  graphics.fillRect(24, 20, 16, 9);
  graphics.fillStyle(0x34423f, 1);
  graphics.fillTriangle(21, 6, 30, 1, 27, 14);
  graphics.fillTriangle(31, 3, 45, 7, 35, 12);
  graphics.fillStyle(0xe8f6d8, 1);
  graphics.fillCircle(27, 15, 2.2);
  graphics.fillCircle(37, 14, 2.2);
  graphics.fillStyle(0x1b1f21, 1);
  graphics.fillCircle(27, 15, 1);
  graphics.fillCircle(37, 14, 1);
  graphics.lineStyle(2, 0x3d3137, 1);
  graphics.lineBetween(27, 25, 38, 24);

  graphics.fillStyle(0x9bbd8d, 1);
  graphics.fillCircle(7, 42, 4);
  graphics.fillCircle(58, 42, 4);
  graphics.fillStyle(0xb44545, 0.75);
  graphics.fillRect(34, 39, 4, 7);

  graphics.generateTexture(textureKey, 64, 78);
  graphics.destroy();
  return textureKey;
};

const petAnimationSeed = (npcId: string): number => {
  let seed = 0;

  for (let index = 0; index < npcId.length; index += 1) {
    seed += npcId.charCodeAt(index) * (index + 1);
  }

  return seed % 19;
};

const npcPropLabel = (type: AmbientNpcNetworkState["type"]): string =>
  NPC_PROP_LABELS[type] ?? "NPC";

const setMobileButtonLabel = (button: HTMLButtonElement, label: string): void => {
  const labelElement = button.querySelector<HTMLElement>(".mobile-control-label");

  if (labelElement) {
    labelElement.textContent = label;
  } else {
    button.textContent = label;
  }

  button.setAttribute("aria-label", label);
};

const lightIntervalsForBand = (
  lights: Array<{ x: number; y: number; radius: number }>,
  bandCenterY: number,
  width: number
): Array<{ left: number; right: number }> =>
  lights
    .flatMap((light) => {
      const dy = bandCenterY - light.y;

      if (Math.abs(dy) >= light.radius) {
        return [];
      }

      const halfWidth = Math.sqrt(light.radius * light.radius - dy * dy);
      return [{
        left: Phaser.Math.Clamp(light.x - halfWidth, 0, width),
        right: Phaser.Math.Clamp(light.x + halfWidth, 0, width)
      }];
    })
    .filter((interval) => interval.right > interval.left)
    .sort((a, b) => a.left - b.left);

const subtractIntervals = (
  sourceIntervals: Array<{ left: number; right: number }>,
  holes: Array<{ left: number; right: number }>
): Array<{ left: number; right: number }> => {
  const result: Array<{ left: number; right: number }> = [];

  sourceIntervals.forEach((source) => {
    let cursor = source.left;

    holes.forEach((hole) => {
      if (hole.right <= cursor || hole.left >= source.right) {
        return;
      }

      if (hole.left > cursor) {
        result.push({ left: cursor, right: Math.min(hole.left, source.right) });
      }

      cursor = Math.max(cursor, hole.right);
    });

    if (cursor < source.right) {
      result.push({ left: cursor, right: source.right });
    }
  });

  return result;
};

const flashlightShadowIntervalsForBand = (
  width: number,
  playerScreenX: number,
  playerScreenY: number,
  bandCenterY: number,
  direction: Direction
): Array<{ left: number; right: number }> => {
  const boundary = 26;

  if (direction === "up") {
    return bandCenterY >= playerScreenY + boundary
      ? [{ left: 0, right: width }]
      : [];
  }

  if (direction === "down") {
    return bandCenterY <= playerScreenY - boundary
      ? [{ left: 0, right: width }]
      : [];
  }

  if (direction === "left") {
    const left = Phaser.Math.Clamp(playerScreenX + boundary, 0, width);
    return left < width ? [{ left, right: width }] : [];
  }

  const right = Phaser.Math.Clamp(playerScreenX - boundary, 0, width);
  return right > 0 ? [{ left: 0, right }] : [];
};

const NPC_CHARACTER_VISUALS = {
  "cleaning-lady": {
    class: "data analyst",
    gender: "female",
    cosmetics: {
      ...DEFAULT_COSMETICS,
      skinTone: "golden tan",
      hairStyle: "bob",
      hairColor: "brown",
      outfitColor: "white",
      accessory: "hat",
      spriteVariant: "classic"
    }
  },
  "security-guard": {
    class: "senior developer",
    gender: "male",
    cosmetics: {
      ...DEFAULT_COSMETICS,
      skinTone: "deep brown",
      hairStyle: "short",
      hairColor: "black",
      outfitColor: "blue",
      accessory: "badge",
      spriteVariant: "scout"
    }
  },
  "hr-specialist": {
    class: "business analyst",
    gender: "female",
    cosmetics: {
      ...DEFAULT_COSMETICS,
      skinTone: "warm ivory",
      hairStyle: "bob",
      hairColor: "blonde",
      outfitColor: "green",
      accessory: "glasses",
      spriteVariant: "classic"
    }
  },
  intern: {
    class: "developer",
    gender: "male",
    cosmetics: {
      ...DEFAULT_COSMETICS,
      skinTone: "warm ivory",
      hairStyle: "spiky",
      hairColor: "red",
      outfitColor: "teal",
      accessory: "headset",
      spriteVariant: "runner"
    }
  },
  "office-manager": {
    class: "product owner",
    gender: "female",
    cosmetics: {
      ...DEFAULT_COSMETICS,
      skinTone: "cool umber",
      hairStyle: "curly",
      hairColor: "silver",
      outfitColor: "red",
      accessory: "glasses",
      spriteVariant: "classic"
    }
  },
  "lost-client": {
    class: "product owner",
    gender: "male",
    cosmetics: {
      ...DEFAULT_COSMETICS,
      skinTone: "golden tan",
      hairStyle: "short",
      hairColor: "brown",
      outfitColor: "green",
      accessory: "none",
      spriteVariant: "scout"
    }
  }
} as const satisfies Record<
  Exclude<AmbientNpcNetworkState["type"], "cat" | "dog">,
  Omit<CharacterTextureProfile, "playerId">
>;

const NPC_PROP_LABELS: Record<AmbientNpcNetworkState["type"], string> = {
  "cleaning-lady": "MOP",
  "security-guard": "ID",
  "hr-specialist": "HR",
  intern: "INT",
  "office-manager": "OPS",
  "lost-client": "?",
  cat: "CAT",
  dog: "DOG"
};

const distanceBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number =>
  Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

const parseCssColor = (color: string): number =>
  Number.parseInt(color.replace("#", ""), 16);

const shouldUseTouchControls = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches ||
  window.innerWidth <= 860;

const isGameplayInputBlocked = (): boolean => {
  const active = document.activeElement;

  if (!(active instanceof HTMLElement)) {
    return false;
  }

  return active.matches("input, textarea, select, [contenteditable='true']");
};
