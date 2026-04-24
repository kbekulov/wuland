import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CLASS_METADATA,
  WULAND_WORLD,
  type BuildingName,
  type LocalProgress,
  type PlayerProfile
} from "@wuland/shared";
import {
  createInitialProgress,
  loadPlayerProfile,
  loadProgress,
  saveProgress
} from "../../persistence/localSave.ts";
import { createCharacterTexture } from "../player/characterTexture.ts";
import { BUILDING_LAYOUT, TREE_OBSTACLES, type BuildingDefinition } from "../world/buildings.ts";

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

type StaticArcadeObject = Phaser.GameObjects.GameObject & {
  body: Phaser.Physics.Arcade.StaticBody;
};

export class WulandScene extends Phaser.Scene {
  private profile!: PlayerProfile;
  private progress!: LocalProgress;
  private visitedBuildings = new Set<BuildingName>();
  private player?: Phaser.Physics.Arcade.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: WasdKeys;
  private nameLabel?: Phaser.GameObjects.Text;
  private classLabel?: Phaser.GameObjects.Text;
  private colliders: StaticArcadeObject[] = [];
  private visitZones: Array<{ name: BuildingName; zone: StaticArcadeObject }> = [];
  private lastProgressSave = 0;

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
    this.colliders = [];
    this.visitZones = [];

    this.physics.world.setBounds(0, 0, WULAND_WORLD.width, WULAND_WORLD.height);
    this.cameras.main.setBounds(0, 0, WULAND_WORLD.width, WULAND_WORLD.height);
    this.cameras.main.setBackgroundColor("#6faa55");

    this.drawVillage();
    this.createPlayer();
    this.createInput();
    this.createPhysicsInteractions();
    this.saveCurrentProgress();

    this.scene.launch("UIScene", {
      profile: this.profile,
      progress: this.progress
    });

    this.game.events.on("wuland:editCharacter", this.openCharacterSelect, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  update(time: number): void {
    if (!this.player || !this.cursors || !this.wasd) {
      return;
    }

    const left = Boolean(this.cursors.left?.isDown || this.wasd.left.isDown);
    const right = Boolean(this.cursors.right?.isDown || this.wasd.right.isDown);
    const up = Boolean(this.cursors.up?.isDown || this.wasd.up.isDown);
    const down = Boolean(this.cursors.down?.isDown || this.wasd.down.isDown);
    const velocity = new Phaser.Math.Vector2(
      (left ? -1 : 0) + (right ? 1 : 0),
      (up ? -1 : 0) + (down ? 1 : 0)
    );

    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(175);
    }

    this.player.setVelocity(velocity.x, velocity.y);
    this.player.setFlipX(velocity.x < 0);
    this.updatePlayerLabels();

    if (time - this.lastProgressSave > 650) {
      this.saveCurrentProgress();
      this.lastProgressSave = time;
    }
  }

  private resolveProgress(sceneProgress?: LocalProgress | null): LocalProgress {
    const savedProgress = sceneProgress ?? loadProgress();

    if (savedProgress?.playerId === this.profile.playerId) {
      return savedProgress;
    }

    return createInitialProgress(this.profile.playerId);
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

    const body = this.add
      .rectangle(building.x, building.y, building.width, building.height, building.bodyColor)
      .setStrokeStyle(3, 0x44372d)
      .setDepth(12) as Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.StaticBody };

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

    this.physics.add.existing(body, true);
    body.body.setSize(building.width + 12, building.height + 12);
    body.body.updateFromGameObject();
    this.colliders.push(body);

    const visitZone = this.add.zone(
      building.x,
      building.y,
      building.width + building.visitPadding * 2,
      building.height + building.visitPadding * 2
    ) as Phaser.GameObjects.Zone & { body: Phaser.Physics.Arcade.StaticBody };

    this.physics.add.existing(visitZone, true);
    visitZone.body.updateFromGameObject();
    this.visitZones.push({ name: building.name, zone: visitZone });
  }

  private drawTree(x: number, y: number): void {
    this.add.rectangle(x, y + 20, 18, 34, 0x795a37).setDepth(10);
    this.add.circle(x, y, 32, 0x2f7d32).setDepth(11);
    this.add.circle(x - 18, y + 10, 22, 0x3f9b42).setDepth(11);
    this.add.circle(x + 20, y + 12, 24, 0x2f8f3a).setDepth(11);

    const collider = this.add.zone(x, y + 18, 48, 54) as Phaser.GameObjects.Zone & {
      body: Phaser.Physics.Arcade.StaticBody;
    };
    this.physics.add.existing(collider, true);
    collider.body.updateFromGameObject();
    this.colliders.push(collider);
  }

  private createPlayer(): void {
    const textureKey = createCharacterTexture(this, this.profile);
    this.player = this.physics.add.sprite(
      this.progress.lastPosition.x,
      this.progress.lastPosition.y,
      textureKey
    );
    this.player.setDepth(50);
    this.player.setCollideWorldBounds(true);
    this.player.setDrag(900, 900);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 28);
    body.setOffset(14, 31);

    const classMeta = CLASS_METADATA[this.profile.class];
    this.nameLabel = this.add
      .text(this.player.x, this.player.y - 58, this.profile.name, {
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "rgba(16, 22, 20, 0.72)",
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.classLabel = this.add
      .text(this.player.x, this.player.y - 36, classMeta.shortLabel, {
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: classMeta.color,
        padding: { x: 6, y: 2 }
      })
      .setOrigin(0.5)
      .setDepth(70);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(90, 70);
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
  }

  private createPhysicsInteractions(): void {
    if (!this.player) {
      return;
    }

    this.colliders.forEach((collider) => {
      this.physics.add.collider(this.player!, collider);
    });

    this.visitZones.forEach(({ name, zone }) => {
      this.physics.add.overlap(this.player!, zone, () => this.markBuildingVisited(name));
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
    if (!this.player) {
      return;
    }

    const toast = this.add
      .text(this.player.x, this.player.y - 82, `Visited ${name}`, {
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

  private updatePlayerLabels(): void {
    if (!this.player || !this.nameLabel || !this.classLabel) {
      return;
    }

    this.nameLabel.setPosition(this.player.x, this.player.y - 58);
    this.classLabel.setPosition(this.player.x, this.player.y - 36);
  }

  private saveCurrentProgress(): void {
    if (!this.player) {
      return;
    }

    this.progress = {
      playerId: this.profile.playerId,
      lastPosition: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y)
      },
      visitedBuildings: BUILDING_NAMES.filter((building) => this.visitedBuildings.has(building)),
      updatedAt: new Date().toISOString()
    };

    saveProgress(this.progress);
    this.game.events.emit("wuland:progressUpdated", this.progress);
  }

  private openCharacterSelect(): void {
    this.saveCurrentProgress();
    this.scene.stop("UIScene");
    this.scene.start("CharacterSelectScene", {
      profile: this.profile,
      progress: this.progress
    });
  }

  private handleShutdown(): void {
    this.saveCurrentProgress();
    this.game.events.off("wuland:editCharacter", this.openCharacterSelect, this);

    if (this.scene.isActive("UIScene")) {
      this.scene.stop("UIScene");
    }
  }

  private isNearMainPath(x: number, y: number): boolean {
    const verticalPath = x > 700 && x < 900;
    const horizontalPath = y > 660 && y < 850;
    const upperPath = y > 430 && y < 570;

    return verticalPath || horizontalPath || upperPath;
  }
}
