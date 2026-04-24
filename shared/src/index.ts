export const PLAYER_CLASSES = [
  "developer",
  "senior developer",
  "business analyst",
  "senior business analyst",
  "product owner",
  "senior product owner",
  "architect"
] as const;

export type PlayerClass = (typeof PLAYER_CLASSES)[number];

export interface ClassMetadata {
  displayName: string;
  shortLabel: string;
  color: string;
  iconText: string;
  futureRole: string;
}

export const CLASS_METADATA: Record<PlayerClass, ClassMetadata> = {
  developer: {
    displayName: "Developer",
    shortLabel: "DEV",
    color: "#3f8cff",
    iconText: "</>",
    futureRole: "DPS / worker"
  },
  "senior developer": {
    displayName: "Senior Developer",
    shortLabel: "SDEV",
    color: "#1657d9",
    iconText: "{ }",
    futureRole: "tank / rules guardian"
  },
  "business analyst": {
    displayName: "Business Analyst",
    shortLabel: "BA",
    color: "#f59f00",
    iconText: "BA",
    futureRole: "tactician / marker"
  },
  "senior business analyst": {
    displayName: "Senior Business Analyst",
    shortLabel: "SBA",
    color: "#d97706",
    iconText: "SBA",
    futureRole: "senior tactician / coordinator"
  },
  "product owner": {
    displayName: "Product Owner",
    shortLabel: "PO",
    color: "#16a34a",
    iconText: "PO",
    futureRole: "protector / quest giver"
  },
  "senior product owner": {
    displayName: "Senior Product Owner",
    shortLabel: "SPO",
    color: "#047857",
    iconText: "SPO",
    futureRole: "commander / morale leader"
  },
  architect: {
    displayName: "Architect",
    shortLabel: "ARCH",
    color: "#8b5cf6",
    iconText: "ARC",
    futureRole: "system mage / engineer"
  }
};

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const BUILDING_NAMES = [
  "RPA CoE",
  "Bathroom",
  "Kitchen",
  "BusyBeet",
  "Din Break"
] as const;

export type BuildingName = (typeof BUILDING_NAMES)[number];

export const SKIN_TONES = [
  { id: "warm ivory", label: "Warm Ivory", color: "#f2c7a5" },
  { id: "golden tan", label: "Golden Tan", color: "#c98952" },
  { id: "deep brown", label: "Deep Brown", color: "#7a4a2b" },
  { id: "cool umber", label: "Cool Umber", color: "#5f3a2c" }
] as const;

export type SkinTone = (typeof SKIN_TONES)[number]["id"];

export const HAIR_STYLES = [
  { id: "short", label: "Short" },
  { id: "bob", label: "Bob" },
  { id: "curly", label: "Curly" },
  { id: "spiky", label: "Spiky" }
] as const;

export type HairStyle = (typeof HAIR_STYLES)[number]["id"];

export const HAIR_COLORS = [
  { id: "black", label: "Black", color: "#151515" },
  { id: "brown", label: "Brown", color: "#5a321d" },
  { id: "blonde", label: "Blonde", color: "#d9b95b" },
  { id: "red", label: "Red", color: "#a63828" },
  { id: "silver", label: "Silver", color: "#c8d1d8" }
] as const;

export type HairColor = (typeof HAIR_COLORS)[number]["id"];

export const OUTFIT_COLORS = [
  { id: "teal", label: "Teal", color: "#168f8b" },
  { id: "blue", label: "Blue", color: "#315fdc" },
  { id: "green", label: "Green", color: "#2f9e44" },
  { id: "red", label: "Red", color: "#c92a2a" },
  { id: "white", label: "White", color: "#e9ecef" }
] as const;

export type OutfitColor = (typeof OUTFIT_COLORS)[number]["id"];

export const ACCESSORY_OPTIONS = [
  { id: "none", label: "None" },
  { id: "glasses", label: "Glasses" },
  { id: "hat", label: "Hat" },
  { id: "headset", label: "Headset" },
  { id: "badge", label: "Badge" }
] as const;

export type AccessoryOption = (typeof ACCESSORY_OPTIONS)[number]["id"];

export const SPRITE_VARIANTS = [
  { id: "classic", label: "Classic" },
  { id: "runner", label: "Runner" },
  { id: "scout", label: "Scout" }
] as const;

export type SpriteVariant = (typeof SPRITE_VARIANTS)[number]["id"];

export const CHARACTER_COSMETICS = {
  skinTones: SKIN_TONES,
  hairStyles: HAIR_STYLES,
  hairColors: HAIR_COLORS,
  outfitColors: OUTFIT_COLORS,
  accessories: ACCESSORY_OPTIONS,
  spriteVariants: SPRITE_VARIANTS
} as const;

export interface CharacterCosmetics {
  skinTone: SkinTone;
  hairStyle: HairStyle;
  hairColor: HairColor;
  outfitColor: OutfitColor;
  accessory: AccessoryOption;
  spriteVariant: SpriteVariant;
}

export const DEFAULT_COSMETICS: CharacterCosmetics = {
  skinTone: "warm ivory",
  hairStyle: "short",
  hairColor: "brown",
  outfitColor: "teal",
  accessory: "none",
  spriteVariant: "classic"
};

export interface PlayerProfile {
  playerId: string;
  name: string;
  class: PlayerClass;
  gender: Gender;
  cosmetics: CharacterCosmetics;
  characterCreationCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorldPosition {
  x: number;
  y: number;
}

export interface LocalProgress {
  playerId: string;
  lastPosition: WorldPosition;
  visitedBuildings: BuildingName[];
  updatedAt: string;
}

export const WULAND_WORLD = {
  name: "WULAND",
  tileSize: 32,
  width: 1600,
  height: 1184,
  defaultSpawn: {
    x: 800,
    y: 820
  } satisfies WorldPosition
} as const;

export const LOCAL_SAVE_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOneOf = <T extends readonly string[]>(
  list: T,
  value: unknown
): value is T[number] =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const hasOptionId = <T extends readonly { id: string }[]>(
  options: T,
  value: unknown
): value is T[number]["id"] =>
  typeof value === "string" &&
  options.some((option) => option.id === value);

export const isPlayerClass = (value: unknown): value is PlayerClass =>
  isOneOf(PLAYER_CLASSES, value);

export const isGender = (value: unknown): value is Gender =>
  isOneOf(GENDERS, value);

export const isBuildingName = (value: unknown): value is BuildingName =>
  isOneOf(BUILDING_NAMES, value);

export const isCharacterCosmetics = (
  value: unknown
): value is CharacterCosmetics => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasOptionId(SKIN_TONES, value.skinTone) &&
    hasOptionId(HAIR_STYLES, value.hairStyle) &&
    hasOptionId(HAIR_COLORS, value.hairColor) &&
    hasOptionId(OUTFIT_COLORS, value.outfitColor) &&
    hasOptionId(ACCESSORY_OPTIONS, value.accessory) &&
    hasOptionId(SPRITE_VARIANTS, value.spriteVariant)
  );
};

export const colorForOption = <
  T extends readonly { readonly id: string; readonly color: string }[]
>(
  options: T,
  id: T[number]["id"]
): string => options.find((option) => option.id === id)?.color ?? "#ffffff";
