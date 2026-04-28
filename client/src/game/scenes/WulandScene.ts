import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CLASS_METADATA,
  ENEMY_DEFINITIONS,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  WULAND_WORLD,
  WULAND_MERCHANT,
  clampWorldPosition,
  collidesWithWorld,
  isCakeItemDefinitionId,
  type BuildingName,
  type CombatEvent,
  type Direction,
  type DroppedItemNetworkState,
  type EnemyNetworkState,
  type InventorySlotState,
  type ItemDefinitionId,
  type LocalProgress,
  type MovementInput,
  type PlayerNetworkState,
  type PlayerProfile
} from "@wuland/shared";
import {
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
  nearbyGiftPlayerName: string;
  totalDroppedItems: number;
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
  private avatars = new Map<string, PlayerAvatar>();
  private enemyAvatars = new Map<string, EnemyAvatar>();
  private droppedItemAvatars = new Map<string, DroppedItemAvatar>();
  private latestPlayers = new Map<string, PlayerNetworkState>();
  private latestEnemies = new Map<string, EnemyNetworkState>();
  private latestDroppedItems = new Map<string, DroppedItemNetworkState>();
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
    nearbyGiftPlayerName: "",
    totalDroppedItems: 0
  };
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
    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();
    this.selectedEnemyId = "";
    this.virtualInput = { ...ZERO_INPUT };
    this.clickTarget = undefined;
    this.targetStartedAt = 0;
    this.lastTargetDistance = Number.POSITIVE_INFINITY;
    this.lastTargetProgressAt = 0;
    this.leavingRoom = false;
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
      nearbyGiftPlayerName: "",
      totalDroppedItems: 0
    };

    this.physics.world.setBounds(0, 0, WULAND_WORLD.width, WULAND_WORLD.height);
    this.cameras.main.setBounds(0, 0, WULAND_WORLD.width, WULAND_WORLD.height);
    this.cameras.main.setBackgroundColor("#6faa55");

    this.drawVillage();
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
    window.addEventListener("blur", this.handleWindowBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    void this.connectToRoom();
  }

  update(time: number, delta: number): void {
    this.sendMovementInputForControls(time);
    this.sendCombatForKeyboard();
    this.updateAvatarPositions(delta);
    this.updateEnemyPositions(delta);

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
      room.onLeave((code, reason) => this.handleRoomLeave(code, reason));
      room.onError((code, message) => this.handleRoomError(code, message));
      this.handleRoomState(room.state);
    } catch (error) {
      this.setConnectionState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not connect to WULAND server"
      });
    }
  }

  private drawVillage(): void {
    this.drawGround();
    this.drawPaths();
    this.drawBoundaryFence();
    this.drawDecorations();

    this.add
      .text(WULAND_WORLD.width / 2, 92, "WULAND", {
        fontFamily: "Georgia, serif",
        fontSize: "44px",
        color: "#1f352d",
        stroke: "#f5f1d5",
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(5);

    BUILDING_LAYOUT.forEach((building) => this.drawBuilding(building));
    TREE_OBSTACLES.forEach((tree) => this.drawTree(tree.x, tree.y));
    this.drawMerchant();
  }

  private drawGround(): void {
    for (let y = 0; y < WULAND_WORLD.height; y += WULAND_WORLD.tileSize) {
      for (let x = 0; x < WULAND_WORLD.width; x += WULAND_WORLD.tileSize) {
        const key = (x / WULAND_WORLD.tileSize + y / WULAND_WORLD.tileSize) % 5 === 0
          ? "tile-grass-dark"
          : "tile-grass";
        this.add.image(x, y, key).setOrigin(0).setDepth(0);
      }
    }
  }

  private drawPaths(): void {
    const graphics = this.add.graphics();
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
    const graphics = this.add.graphics();
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
    const graphics = this.add.graphics();
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
    this.add
      .rectangle(building.x + 8, building.y + 10, building.width, building.height, 0x000000, 0.18)
      .setDepth(8);

    this.add
      .rectangle(building.x, building.y, building.width, building.height, building.bodyColor)
      .setStrokeStyle(3, 0x44372d)
      .setDepth(12);

    this.add
      .rectangle(building.x, building.y - building.height / 2 + 12, building.width + 26, 32, building.roofColor)
      .setStrokeStyle(3, 0x2b211c)
      .setDepth(14);
    this.add
      .rectangle(building.x, building.y + building.height / 2 - 23, 34, 45, 0x5c3d2e)
      .setStrokeStyle(2, 0x2d211a)
      .setDepth(16);
    this.add.rectangle(building.x - 55, building.y - 8, 32, 28, 0xf8f9fa).setDepth(16);
    this.add.rectangle(building.x + 55, building.y - 8, 32, 28, 0xf8f9fa).setDepth(16);
    this.add
      .text(building.x, building.y + building.height / 2 + 25, building.name, {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#1b1c1d",
        backgroundColor: "#f7e6b7",
        padding: { x: 8, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(18);
  }

  private drawTree(x: number, y: number): void {
    this.add.rectangle(x, y + 20, 18, 34, 0x795a37).setDepth(10);
    this.add.circle(x, y, 32, 0x2f7d32).setDepth(11);
    this.add.circle(x - 18, y + 10, 22, 0x3f9b42).setDepth(11);
    this.add.circle(x + 20, y + 12, 24, 0x2f8f3a).setDepth(11);
  }

  private drawMerchant(): void {
    const { x, y } = WULAND_MERCHANT;

    this.add.ellipse(x + 8, y + 28, 138, 34, 0x000000, 0.18).setDepth(18);
    this.add
      .rectangle(x + 38, y + 6, 78, 48, 0x5b3b26, 0.98)
      .setStrokeStyle(3, 0x281914)
      .setDepth(24);
    this.add.rectangle(x + 38, y - 24, 86, 18, 0xc7923e, 1).setDepth(26);
    this.add.circle(x + 4, y + 33, 13, 0x2a1d19, 1).setDepth(27);
    this.add.circle(x + 73, y + 33, 13, 0x2a1d19, 1).setDepth(27);
    this.add.circle(x + 4, y + 33, 6, 0xc7a46b, 1).setDepth(28);
    this.add.circle(x + 73, y + 33, 6, 0xc7a46b, 1).setDepth(28);
    this.add.rectangle(x + 89, y - 2, 18, 64, 0x7a5234, 1).setDepth(23);
    this.add.circle(x - 34, y - 13, 24, 0x2b1c2f, 1).setDepth(30);
    this.add.circle(x - 34, y - 9, 16, 0xd9b384, 1).setDepth(31);
    this.add
      .triangle(x - 34, y + 38, -33, -30, 33, -30, 0, 38, 0x39213f, 1)
      .setStrokeStyle(3, 0x1e1224)
      .setDepth(29);
    this.add.rectangle(x - 62, y + 4, 22, 38, 0x765332, 1).setDepth(28);
    this.add
      .text(x + 38, y - 51, "Odd Cart", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        color: "#fff8e7",
        backgroundColor: "rgba(34, 21, 16, 0.82)",
        padding: { x: 7, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(35);

    this.merchantSpeechTimer = this.time.addEvent({
      delay: 5200,
      loop: true,
      callback: () => this.showMerchantSpeechIfNearby()
    });
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
    const target = clampWorldPosition({ x, y });

    if (collidesWithWorld(target)) {
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

  private handleRoomState(state: WulandRoomState): void {
    if (!this.sceneActive) {
      return;
    }

    const seenPlayers = new Set<string>();
    const seenEnemies = new Set<string>();
    const seenDroppedItems = new Set<string>();
    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();
    state.players?.forEach((playerSchema) => {
      const player = snapshotPlayer(playerSchema);
      seenPlayers.add(player.playerId);
      this.latestPlayers.set(player.playerId, player);
      this.renderPlayer(player);
    });
    state.enemies?.forEach((enemySchema) => {
      const enemy = snapshotEnemy(enemySchema);
      seenEnemies.add(enemy.enemyId);
      this.latestEnemies.set(enemy.enemyId, enemy);
      this.renderEnemy(enemy);
    });
    state.droppedItems?.forEach((itemSchema) => {
      const item = snapshotDroppedItem(itemSchema);
      seenDroppedItems.add(item.droppedItemId);
      this.latestDroppedItems.set(item.droppedItemId, item);
      this.renderDroppedItem(item);
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

    const localPlayer = this.latestPlayers.get(this.profile.playerId);
    for (const [droppedItemId, avatar] of this.droppedItemAvatars) {
      if (!seenDroppedItems.has(droppedItemId)) {
        this.destroyDroppedItemAvatar(avatar);
        this.droppedItemAvatars.delete(droppedItemId);
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
      totalDroppedItems: state.totalDroppedItems ?? seenDroppedItems.size
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
    const nearMerchant = distanceBetween(player, WULAND_MERCHANT) <= WULAND_MERCHANT.interactionRange;
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
      nearMerchant !== this.connectionState.nearMerchant ||
      nearbyGiftPlayerName !== this.connectionState.nearbyGiftPlayerName
    ) {
      this.setConnectionState({
        nearbyPickupName,
        nearMerchant,
        nearbyGiftPlayerName
      });
    }
  }

  private updateVisitedBuildings(player: PlayerNetworkState): void {
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

  private enemyAtWorldPoint(x: number, y: number): EnemyNetworkState | null {
    let best: EnemyNetworkState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.latestEnemies.forEach((enemy) => {
      const definition = ENEMY_DEFINITIONS[enemy.type];
      const distanceToEnemy = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);

      if (enemy.alive && distanceToEnemy <= definition.radius + 18 && distanceToEnemy < bestDistance) {
        best = enemy;
        bestDistance = distanceToEnemy;
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
    this.saveCurrentProgress();
    this.sendMovementInput(ZERO_INPUT, true);
    this.clearClickTarget(true);
    this.leaveRoom();
    this.game.events.off("wuland:editCharacter", this.openCharacterSelect, this);
    this.game.events.off("wuland:selectHotbarSlot", this.selectHotbarSlot, this);
    this.game.events.off("wuland:moveHotbarItem", this.moveHotbarItem, this);
    this.game.events.off("wuland:discardHotbarItem", this.discardHotbarItem, this);
    this.game.events.off("wuland:buyMerchantItem", this.buyMerchantItem, this);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.mobileRoot?.remove();
    this.mobileRoot = undefined;
    document.body.removeAttribute("data-touch-controls");
    this.merchantSpeechTimer?.remove(false);
    this.merchantSpeechTimer = undefined;
    this.merchantBubble?.destroy();
    this.merchantBubble = undefined;
    this.destinationMarker?.destroy();
    this.destinationMarker = undefined;
    this.avatars.forEach((avatar) => this.destroyAvatar(avatar));
    this.enemyAvatars.forEach((avatar) => this.destroyEnemyAvatar(avatar));
    this.droppedItemAvatars.forEach((avatar) => this.destroyDroppedItemAvatar(avatar));
    this.avatars.clear();
    this.enemyAvatars.clear();
    this.droppedItemAvatars.clear();
    this.latestPlayers.clear();
    this.latestEnemies.clear();
    this.latestDroppedItems.clear();

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
  mapId: item.mapId,
  x: item.x,
  y: item.y,
  droppedByPlayerId: item.droppedByPlayerId,
  droppedAt: item.droppedAt
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
  position: { x: number; y: number },
  droppedItems: Map<string, DroppedItemNetworkState>,
  range: number
): DroppedItemNetworkState | null => {
  let best: DroppedItemNetworkState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  droppedItems.forEach((item) => {
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
      player.defeated
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

const distanceBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number =>
  Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

const parseCssColor = (color: string): number =>
  Number.parseInt(color.replace("#", ""), 16);
