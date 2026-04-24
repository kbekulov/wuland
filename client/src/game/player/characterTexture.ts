import Phaser from "phaser";
import {
  CLASS_METADATA,
  HAIR_COLORS,
  OUTFIT_COLORS,
  SKIN_TONES,
  colorForOption,
  type PlayerProfile
} from "@wuland/shared";

export const createCharacterTexture = (
  scene: Phaser.Scene,
  profile: PlayerProfile
): string => {
  const textureKey = [
    "player",
    profile.playerId,
    profile.class,
    profile.gender,
    profile.cosmetics.skinTone,
    profile.cosmetics.hairStyle,
    profile.cosmetics.hairColor,
    profile.cosmetics.outfitColor,
    profile.cosmetics.accessory,
    profile.cosmetics.spriteVariant
  ]
    .join("-")
    .replace(/[^a-z0-9-]/gi, "_");

  if (scene.textures.exists(textureKey)) {
    return textureKey;
  }

  const texture = scene.textures.createCanvas(textureKey, 48, 64);

  if (!texture) {
    return "__DEFAULT";
  }

  const context = texture.getContext();
  const skin = colorForOption(SKIN_TONES, profile.cosmetics.skinTone);
  const hair = colorForOption(HAIR_COLORS, profile.cosmetics.hairColor);
  const outfit = colorForOption(OUTFIT_COLORS, profile.cosmetics.outfitColor);
  const classColor = CLASS_METADATA[profile.class].color;

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, 48, 64);

  context.fillStyle = "rgba(0, 0, 0, 0.22)";
  context.beginPath();
  context.ellipse(24, 57, 15, 5, 0, 0, Math.PI * 2);
  context.fill();

  drawLegs(context, outfit, profile.cosmetics.spriteVariant);
  drawBody(context, outfit, classColor, profile.gender);
  drawHead(context, skin);
  drawHair(context, hair, profile.cosmetics.hairStyle);
  drawAccessory(context, profile.cosmetics.accessory, classColor);

  texture.refresh();
  return textureKey;
};

const drawLegs = (
  context: CanvasRenderingContext2D,
  outfit: string,
  variant: string
): void => {
  const offset = variant === "runner" ? 2 : variant === "scout" ? -1 : 0;

  context.fillStyle = "#243447";
  context.fillRect(17 - offset, 43, 6, 13);
  context.fillRect(25 + offset, 43, 6, 13);
  context.fillStyle = outfit;
  context.fillRect(16 - offset, 40, 8, 7);
  context.fillRect(24 + offset, 40, 8, 7);
};

const drawBody = (
  context: CanvasRenderingContext2D,
  outfit: string,
  classColor: string,
  gender: string
): void => {
  context.fillStyle = outfit;
  context.beginPath();

  if (gender === "female") {
    context.roundRect(14, 27, 20, 18, 6);
  } else {
    context.roundRect(13, 27, 22, 18, 4);
  }

  context.fill();
  context.fillStyle = classColor;
  context.fillRect(13, 31, 22, 4);
  context.fillRect(22, 27, 4, 18);
  context.fillStyle = "#f8f9fa";
  context.fillRect(18, 29, 12, 3);
};

const drawHead = (context: CanvasRenderingContext2D, skin: string): void => {
  context.fillStyle = skin;
  context.beginPath();
  context.roundRect(14, 10, 20, 20, 7);
  context.fill();
  context.fillStyle = "#1f2933";
  context.fillRect(19, 20, 3, 3);
  context.fillRect(27, 20, 3, 3);
  context.fillStyle = "#9c6644";
  context.fillRect(22, 25, 5, 2);
};

const drawHair = (
  context: CanvasRenderingContext2D,
  hair: string,
  hairStyle: string
): void => {
  context.fillStyle = hair;

  if (hairStyle === "bob") {
    context.roundRect(12, 8, 24, 18, 8);
    context.fill();
    context.clearRect(18, 20, 12, 8);
    return;
  }

  if (hairStyle === "curly") {
    for (let x = 13; x <= 31; x += 6) {
      context.beginPath();
      context.arc(x, 12, 5, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }

  if (hairStyle === "spiky") {
    context.beginPath();
    context.moveTo(14, 17);
    context.lineTo(17, 6);
    context.lineTo(21, 14);
    context.lineTo(25, 5);
    context.lineTo(29, 14);
    context.lineTo(34, 7);
    context.lineTo(34, 18);
    context.closePath();
    context.fill();
    return;
  }

  context.roundRect(14, 8, 20, 10, 5);
  context.fill();
};

const drawAccessory = (
  context: CanvasRenderingContext2D,
  accessory: string,
  classColor: string
): void => {
  context.strokeStyle = "#111827";
  context.fillStyle = classColor;
  context.lineWidth = 2;

  if (accessory === "glasses") {
    context.strokeRect(17, 19, 6, 5);
    context.strokeRect(26, 19, 6, 5);
    context.beginPath();
    context.moveTo(23, 21);
    context.lineTo(26, 21);
    context.stroke();
    return;
  }

  if (accessory === "hat") {
    context.fillRect(12, 8, 24, 4);
    context.fillRect(17, 2, 14, 8);
    return;
  }

  if (accessory === "headset") {
    context.beginPath();
    context.arc(24, 19, 14, Math.PI, Math.PI * 2);
    context.stroke();
    context.fillRect(32, 20, 4, 7);
    context.fillRect(33, 27, 8, 2);
    return;
  }

  if (accessory === "badge") {
    context.fillStyle = "#f8f9fa";
    context.fillRect(29, 33, 5, 7);
    context.fillStyle = classColor;
    context.fillRect(30, 34, 3, 3);
  }
};
