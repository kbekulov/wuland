import Phaser from "phaser";
import { loadPlayerProfile, loadProgress } from "../../persistence/localSave.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.createPlaceholderTexture("tile-grass", 0x77b65d, 0x6fae54);
    this.createPlaceholderTexture("tile-grass-dark", 0x5f9f4b, 0x548d43);
    this.createPlaceholderTexture("tile-dirt", 0xb89058, 0xa47b47);
  }

  create(): void {
    const profile = loadPlayerProfile();
    const progress = loadProgress();

    this.registry.set("playerProfile", profile);
    this.registry.set("localProgress", progress);
    this.scene.start("CharacterSelectScene", { profile, progress });
  }

  private createPlaceholderTexture(
    key: string,
    baseColor: number,
    accentColor: number
  ): void {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(baseColor, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.fillStyle(accentColor, 1);
    graphics.fillRect(0, 0, 32, 2);
    graphics.fillRect(0, 0, 2, 32);
    graphics.generateTexture(key, 32, 32);
    graphics.destroy();
  }
}
