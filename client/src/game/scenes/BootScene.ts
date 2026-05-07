import Phaser from "phaser";
import { ITEM_DEFINITIONS } from "@wuland/shared";
import { loadPlayerProfile, loadProgress } from "../../persistence/localSave.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.createPlaceholderTexture("tile-grass", 0x77b65d, 0x6fae54);
    this.createPlaceholderTexture("tile-grass-dark", 0x5f9f4b, 0x548d43);
    this.createPlaceholderTexture("tile-dirt", 0xb89058, 0xa47b47);
    this.loadItemIcons();
    this.loadPetSprites();
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

  private loadItemIcons(): void {
    Object.values(ITEM_DEFINITIONS).forEach((definition) => {
      if (!definition.iconAsset || this.textures.exists(itemIconTextureKey(definition.itemDefinitionId))) {
        return;
      }

      this.load.image(itemIconTextureKey(definition.itemDefinitionId), definition.iconAsset);
    });
  }

  private loadPetSprites(): void {
    [
      { key: petSpriteTextureKey("cat"), path: `/assets/pets/cat.png?v=${PET_SPRITE_ASSET_VERSION}` },
      { key: petSpriteTextureKey("dog"), path: `/assets/pets/dog.png?v=${PET_SPRITE_ASSET_VERSION}` }
    ].forEach((asset) => {
      if (this.textures.exists(asset.key)) {
        return;
      }

      this.load.image(asset.key, asset.path);
    });
  }
}

const itemIconTextureKey = (itemDefinitionId: string): string => `item-icon-${itemDefinitionId}`;

const petSpriteTextureKey = (type: "cat" | "dog"): string => `pet-sprite-${type}`;

const PET_SPRITE_ASSET_VERSION = "2";
