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
    color: "#0f6f8f",
    iconText: "SHD",
    futureRole: "tank / rules guardian"
  },
  "business analyst": {
    displayName: "Business Analyst",
    shortLabel: "BA",
    color: "#facc15",
    iconText: "CHK",
    futureRole: "tactician / marker"
  },
  "senior business analyst": {
    displayName: "Senior Business Analyst",
    shortLabel: "SBA",
    color: "#d6a83d",
    iconText: "DOC",
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
    color: "#7c3aed",
    iconText: "CRN",
    futureRole: "commander / morale leader"
  },
  architect: {
    displayName: "Architect",
    shortLabel: "ARCH",
    color: "#2f3338",
    iconText: "BLU",
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

export type Direction = "down" | "up" | "left" | "right";

export interface MovementInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface MoveTargetRequest {
  x: number;
  y: number;
}

export interface CollisionRectangle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

export const PLAYER_COLLISION_SIZE = {
  width: 20,
  height: 28
} as const;

export const PLAYER_MOVE_SPEED = 175;
export const NETWORK_TICK_RATE = 30;
export const DEFAULT_OFFLINE_PLAYER_TTL_HOURS = 168;

export const WULAND_BUILDINGS = [
  {
    name: "RPA CoE",
    x: 800,
    y: 340,
    width: 250,
    height: 150,
    bodyColor: 0xd9e2ef,
    roofColor: 0x3467a8,
    visitPadding: 72
  },
  {
    name: "Bathroom",
    x: 390,
    y: 375,
    width: 160,
    height: 120,
    bodyColor: 0xd4f0ff,
    roofColor: 0x287f9f,
    visitPadding: 56
  },
  {
    name: "Kitchen",
    x: 1195,
    y: 405,
    width: 185,
    height: 130,
    bodyColor: 0xffe3c2,
    roofColor: 0xb45309,
    visitPadding: 60
  },
  {
    name: "BusyBeet",
    x: 530,
    y: 760,
    width: 210,
    height: 135,
    bodyColor: 0xe9d5ff,
    roofColor: 0x7e22ce,
    visitPadding: 64
  },
  {
    name: "Din Break",
    x: 1095,
    y: 790,
    width: 220,
    height: 140,
    bodyColor: 0xd8f5a2,
    roofColor: 0x4d7c0f,
    visitPadding: 64
  }
] as const;

export type WulandBuildingDefinition = (typeof WULAND_BUILDINGS)[number];

export const WULAND_TREE_OBSTACLES = [
  { x: 245, y: 590 },
  { x: 315, y: 650 },
  { x: 1310, y: 610 },
  { x: 1390, y: 690 },
  { x: 720, y: 990 },
  { x: 890, y: 1015 }
] as const;

export const BUILDING_COLLISION_RECTS: CollisionRectangle[] =
  WULAND_BUILDINGS.map((building) => ({
    id: building.name,
    x: building.x - building.width / 2 - 6,
    y: building.y - building.height / 2 - 6,
    width: building.width + 12,
    height: building.height + 12
  }));

export const TREE_COLLISION_RECTS: CollisionRectangle[] =
  WULAND_TREE_OBSTACLES.map((tree, index) => ({
    id: `tree-${index + 1}`,
    x: tree.x - 24,
    y: tree.y - 9,
    width: 48,
    height: 54
  }));

export const WULAND_COLLISION_RECTS: CollisionRectangle[] = [
  ...BUILDING_COLLISION_RECTS,
  ...TREE_COLLISION_RECTS
];

export type BuffType =
  | "rule-shield"
  | "take-the-hit"
  | "department-rally"
  | "platform-zone"
  | "clarity";

export type EnemyType =
  | "bug"
  | "broken-bot"
  | "task-slime"
  | "edge-case"
  | "vague-requirement"
  | "scope-blob"
  | "angry-client"
  | "escalation-demon"
  | "legacy-system-golem"
  | "standards-violation";

export type CombatEventType =
  | "basic"
  | "special"
  | "damage"
  | "shield"
  | "buff"
  | "mark"
  | "enemy-defeated"
  | "player-defeated"
  | "respawn";

export interface ClassCombatMetadata {
  role: string;
  teamMeaning: string;
  basicName: string;
  specialName: string;
  passiveName: string;
  passiveDescription: string;
  basicDamage: number;
  specialDamage: number;
  basicRange: number;
  specialRange: number;
  basicCooldownMs: number;
  specialCooldownMs: number;
  effectColor: string;
}

export const PLAYER_MAX_HP = 120;
export const PLAYER_RESPAWN_MS = 4200;
export const BASIC_ATTACK_ARC_DEGREES = 85;
export const MARK_DAMAGE_MULTIPLIER = 1.35;

export const CLASS_COMBAT_METADATA: Record<PlayerClass, ClassCombatMetadata> = {
  developer: {
    role: "DPS / worker",
    teamMeaning:
      "Builds projects, codes, maintains automations, and fulfills expectations from BAs and POs.",
    basicName: "Code Strike",
    specialName: "Implement Feature",
    passiveName: "Bug Crusher",
    passiveDescription: "Deals extra damage to Bug, Task Slime, and Broken Bot enemies.",
    basicDamage: 16,
    specialDamage: 42,
    basicRange: 280,
    specialRange: 320,
    basicCooldownMs: 480,
    specialCooldownMs: 5200,
    effectColor: "#3f8cff"
  },
  "senior developer": {
    role: "tank / rules guardian",
    teamMeaning:
      "Decides edge cases, creates rules, verifies standards, handles difficult code, creates tools, and coaches developers.",
    basicName: "Standards Strike",
    specialName: "Rule Shield",
    passiveName: "Stability Review",
    passiveDescription: "Takes slightly less damage and shields nearby allies.",
    basicDamage: 13,
    specialDamage: 0,
    basicRange: 225,
    specialRange: 230,
    basicCooldownMs: 560,
    specialCooldownMs: 7800,
    effectColor: "#0f6f8f"
  },
  "business analyst": {
    role: "tactician / marker",
    teamMeaning:
      "Writes user stories, breaks big projects into smaller steps, manages developer progress, and talks to clients.",
    basicName: "User Story Shot",
    specialName: "Break Down Scope",
    passiveName: "Developer Handoff",
    passiveDescription: "Marked enemies take extra damage from Developers.",
    basicDamage: 10,
    specialDamage: 24,
    basicRange: 300,
    specialRange: 340,
    basicCooldownMs: 520,
    specialCooldownMs: 6500,
    effectColor: "#facc15"
  },
  "senior business analyst": {
    role: "senior tactician / coordinator",
    teamMeaning:
      "Coordinates complex requirements with more experience and keeps priorities legible.",
    basicName: "Clarify Shot",
    specialName: "Process Alignment",
    passiveName: "Clear Objective",
    passiveDescription: "Nearby allies gain a small range bonus.",
    basicDamage: 12,
    specialDamage: 14,
    basicRange: 310,
    specialRange: 285,
    basicCooldownMs: 520,
    specialCooldownMs: 7600,
    effectColor: "#d6a83d"
  },
  "product owner": {
    role: "protector / quest giver",
    teamMeaning:
      "Finds clients, agrees high-level projects, passes work to BAs, and takes the main hit when things go wrong.",
    basicName: "Priority Command",
    specialName: "Take the Hit",
    passiveName: "Client Buffer",
    passiveDescription: "Gains defense when near BAs, Senior BAs, or Developers.",
    basicDamage: 12,
    specialDamage: 0,
    basicRange: 250,
    specialRange: 235,
    basicCooldownMs: 580,
    specialCooldownMs: 8200,
    effectColor: "#16a34a"
  },
  "senior product owner": {
    role: "commander / morale leader",
    teamMeaning:
      "Coordinates Product Owners and rallies the department around the roadmap.",
    basicName: "Roadmap Command",
    specialName: "Department Rally",
    passiveName: "Longer Rally",
    passiveDescription: "Buffs last slightly longer.",
    basicDamage: 13,
    specialDamage: 0,
    basicRange: 260,
    specialRange: 275,
    basicCooldownMs: 560,
    specialCooldownMs: 9800,
    effectColor: "#7c3aed"
  },
  architect: {
    role: "system mage / engineer",
    teamMeaning:
      "Creates complex systems and platforms, integrates everyone's work, and pushes tooling innovation.",
    basicName: "Blueprint Bolt",
    specialName: "Platform Shift",
    passiveName: "System Weakness",
    passiveDescription: "Deals extra damage to Legacy System enemies.",
    basicDamage: 15,
    specialDamage: 28,
    basicRange: 295,
    specialRange: 260,
    basicCooldownMs: 540,
    specialCooldownMs: 7800,
    effectColor: "#8d99ae"
  }
} as const;

export interface EnemyDefinition {
  type: EnemyType;
  displayName: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  aggroRange: number;
  contactCooldownMs: number;
  respawnMs: number;
  radius: number;
  color: number;
  accentColor: number;
}

export const ENEMY_DEFINITIONS: Record<EnemyType, EnemyDefinition> = {
  bug: {
    type: "bug",
    displayName: "Bug",
    maxHp: 42,
    speed: 88,
    damage: 7,
    attackRange: 30,
    aggroRange: 250,
    contactCooldownMs: 1050,
    respawnMs: 9000,
    radius: 16,
    color: 0xd9480f,
    accentColor: 0xffd8a8
  },
  "broken-bot": {
    type: "broken-bot",
    displayName: "Broken Bot",
    maxHp: 58,
    speed: 72,
    damage: 9,
    attackRange: 34,
    aggroRange: 250,
    contactCooldownMs: 1200,
    respawnMs: 11000,
    radius: 18,
    color: 0x748ffc,
    accentColor: 0xdbe4ff
  },
  "task-slime": {
    type: "task-slime",
    displayName: "Task Slime",
    maxHp: 46,
    speed: 82,
    damage: 7,
    attackRange: 32,
    aggroRange: 230,
    contactCooldownMs: 1100,
    respawnMs: 9500,
    radius: 17,
    color: 0x51cf66,
    accentColor: 0xd3f9d8
  },
  "edge-case": {
    type: "edge-case",
    displayName: "Edge Case",
    maxHp: 62,
    speed: 68,
    damage: 10,
    attackRange: 34,
    aggroRange: 245,
    contactCooldownMs: 1250,
    respawnMs: 12000,
    radius: 18,
    color: 0x15aabf,
    accentColor: 0xc5f6fa
  },
  "vague-requirement": {
    type: "vague-requirement",
    displayName: "Vague Requirement",
    maxHp: 64,
    speed: 62,
    damage: 9,
    attackRange: 35,
    aggroRange: 260,
    contactCooldownMs: 1300,
    respawnMs: 12000,
    radius: 19,
    color: 0xf59f00,
    accentColor: 0xffec99
  },
  "scope-blob": {
    type: "scope-blob",
    displayName: "Scope Blob",
    maxHp: 118,
    speed: 46,
    damage: 13,
    attackRange: 42,
    aggroRange: 270,
    contactCooldownMs: 1450,
    respawnMs: 16000,
    radius: 28,
    color: 0xcc5de8,
    accentColor: 0xf3d9fa
  },
  "angry-client": {
    type: "angry-client",
    displayName: "Angry Client",
    maxHp: 82,
    speed: 70,
    damage: 12,
    attackRange: 36,
    aggroRange: 300,
    contactCooldownMs: 1250,
    respawnMs: 15000,
    radius: 21,
    color: 0xf03e3e,
    accentColor: 0xffc9c9
  },
  "escalation-demon": {
    type: "escalation-demon",
    displayName: "Escalation Demon",
    maxHp: 150,
    speed: 55,
    damage: 16,
    attackRange: 44,
    aggroRange: 315,
    contactCooldownMs: 1500,
    respawnMs: 20000,
    radius: 30,
    color: 0x862e9c,
    accentColor: 0xeebefa
  },
  "legacy-system-golem": {
    type: "legacy-system-golem",
    displayName: "Legacy System Golem",
    maxHp: 175,
    speed: 38,
    damage: 18,
    attackRange: 48,
    aggroRange: 290,
    contactCooldownMs: 1650,
    respawnMs: 22000,
    radius: 34,
    color: 0x495057,
    accentColor: 0xced4da
  },
  "standards-violation": {
    type: "standards-violation",
    displayName: "Standards Violation",
    maxHp: 72,
    speed: 76,
    damage: 11,
    attackRange: 34,
    aggroRange: 255,
    contactCooldownMs: 1200,
    respawnMs: 13000,
    radius: 20,
    color: 0xe67700,
    accentColor: 0xffd8a8
  }
} as const;

export interface EnemySpawnDefinition {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  leashRadius: number;
}

export const WULAND_ENEMY_SPAWNS: EnemySpawnDefinition[] = [
  { id: "bug-1", type: "bug", x: 610, y: 610, leashRadius: 190 },
  { id: "bug-2", type: "bug", x: 960, y: 610, leashRadius: 180 },
  { id: "broken-bot-1", type: "broken-bot", x: 920, y: 250, leashRadius: 175 },
  { id: "task-slime-1", type: "task-slime", x: 450, y: 610, leashRadius: 170 },
  { id: "edge-case-1", type: "edge-case", x: 300, y: 890, leashRadius: 185 },
  { id: "vague-requirement-1", type: "vague-requirement", x: 1280, y: 875, leashRadius: 185 },
  { id: "scope-blob-1", type: "scope-blob", x: 235, y: 255, leashRadius: 190 },
  { id: "angry-client-1", type: "angry-client", x: 1345, y: 290, leashRadius: 205 },
  { id: "escalation-demon-1", type: "escalation-demon", x: 1410, y: 1010, leashRadius: 220 },
  { id: "legacy-system-golem-1", type: "legacy-system-golem", x: 145, y: 1030, leashRadius: 210 },
  { id: "standards-violation-1", type: "standards-violation", x: 1030, y: 990, leashRadius: 190 },
  { id: "task-slime-2", type: "task-slime", x: 640, y: 1035, leashRadius: 170 }
];

export interface PlayerNetworkState {
  playerId: string;
  sessionId: string;
  name: string;
  className: PlayerClass;
  gender: Gender;
  skinTone: SkinTone;
  hairStyle: HairStyle;
  hairColor: HairColor;
  outfitColor: OutfitColor;
  accessory: AccessoryOption;
  spriteVariant: SpriteVariant;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  online: boolean;
  sleeping: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  defeated: boolean;
  respawnAt: number;
  specialCooldownUntil: number;
  activeBuffs: string;
  markedTargets: string;
  role: string;
  joinedAt: string;
  lastSeenAt: string;
  lastSavedAt: string;
}

export interface EnemyNetworkState {
  enemyId: string;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  targetPlayerId: string;
  markedBy: string;
  markedUntil: number;
  weakenedUntil: number;
  respawnAt: number;
}

export interface CombatRequest {
  targetEnemyId?: string;
  direction?: Direction;
}

export interface CombatEvent {
  id: string;
  type: CombatEventType;
  sourceId: string;
  targetId: string;
  x: number;
  y: number;
  value: number;
  text: string;
  color: string;
}

export interface WulandJoinOptions {
  profile: PlayerProfile;
  localProgress?: LocalProgress | null;
}

export const LOCAL_SAVE_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

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

export const isEnemyType = (value: unknown): value is EnemyType =>
  isOneOf(
    [
      "bug",
      "broken-bot",
      "task-slime",
      "edge-case",
      "vague-requirement",
      "scope-blob",
      "angry-client",
      "escalation-demon",
      "legacy-system-golem",
      "standards-violation"
    ] as const,
    value
  );

export const isDirection = (value: unknown): value is Direction =>
  isOneOf(["down", "up", "left", "right"] as const, value);

export const isMovementInput = (value: unknown): value is MovementInput => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.left === "boolean" &&
    typeof value.right === "boolean" &&
    typeof value.up === "boolean" &&
    typeof value.down === "boolean"
  );
};

export const isMoveTargetRequest = (value: unknown): value is MoveTargetRequest =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  value.x >= 0 &&
  value.x <= WULAND_WORLD.width &&
  value.y >= 0 &&
  value.y <= WULAND_WORLD.height;

export const isCombatRequest = (value: unknown): value is CombatRequest => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.targetEnemyId === undefined || typeof value.targetEnemyId === "string") &&
    (value.direction === undefined || isDirection(value.direction))
  );
};

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

export const isValidPlayerProfile = (value: unknown): value is PlayerProfile => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.playerId) &&
    isNonEmptyString(value.name) &&
    isPlayerClass(value.class) &&
    isGender(value.gender) &&
    isCharacterCosmetics(value.cosmetics) &&
    value.characterCreationCompleted === true &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
};

export const isValidLocalProgress = (value: unknown): value is LocalProgress => {
  if (!isRecord(value) || !isRecord(value.lastPosition)) {
    return false;
  }

  return (
    isNonEmptyString(value.playerId) &&
    isFiniteNumber(value.lastPosition.x) &&
    isFiniteNumber(value.lastPosition.y) &&
    Array.isArray(value.visitedBuildings) &&
    value.visitedBuildings.every(isBuildingName) &&
    isNonEmptyString(value.updatedAt)
  );
};

export const isValidWorldPosition = (value: unknown): value is WorldPosition =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  value.x >= 0 &&
  value.x <= WULAND_WORLD.width &&
  value.y >= 0 &&
  value.y <= WULAND_WORLD.height;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const clampWorldPosition = (position: WorldPosition): WorldPosition => ({
  x: clamp(
    position.x,
    PLAYER_COLLISION_SIZE.width / 2,
    WULAND_WORLD.width - PLAYER_COLLISION_SIZE.width / 2
  ),
  y: clamp(
    position.y,
    PLAYER_COLLISION_SIZE.height / 2,
    WULAND_WORLD.height - PLAYER_COLLISION_SIZE.height / 2
  )
});

export const playerRectAt = (position: WorldPosition): CollisionRectangle => ({
  id: "player",
  x: position.x - PLAYER_COLLISION_SIZE.width / 2,
  y: position.y - PLAYER_COLLISION_SIZE.height / 2,
  width: PLAYER_COLLISION_SIZE.width,
  height: PLAYER_COLLISION_SIZE.height
});

export const rectsOverlap = (
  a: CollisionRectangle,
  b: CollisionRectangle
): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

export const collidesWithWorld = (
  position: WorldPosition,
  rectangles: readonly CollisionRectangle[] = WULAND_COLLISION_RECTS
): boolean => {
  const playerRect = playerRectAt(position);
  return rectangles.some((rectangle) => rectsOverlap(playerRect, rectangle));
};

export const directionFromInput = (
  input: MovementInput,
  fallback: Direction = "down"
): Direction => {
  if (input.left && !input.right) {
    return "left";
  }

  if (input.right && !input.left) {
    return "right";
  }

  if (input.up && !input.down) {
    return "up";
  }

  if (input.down && !input.up) {
    return "down";
  }

  return fallback;
};

export const movementVectorFromInput = (input: MovementInput): WorldPosition => {
  const x = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const y = (input.up ? -1 : 0) + (input.down ? 1 : 0);
  const length = Math.hypot(x, y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: x / length,
    y: y / length
  };
};

export const directionFromVector = (
  vector: WorldPosition,
  fallback: Direction = "down"
): Direction => {
  if (Math.abs(vector.x) > Math.abs(vector.y)) {
    return vector.x < 0 ? "left" : "right";
  }

  if (Math.abs(vector.y) > 0) {
    return vector.y < 0 ? "up" : "down";
  }

  return fallback;
};

export const applyServerVectorMovement = (
  position: WorldPosition,
  vector: WorldPosition,
  deltaMs: number,
  fallbackDirection: Direction = "down",
  rectangles: readonly CollisionRectangle[] = WULAND_COLLISION_RECTS
): { position: WorldPosition; moving: boolean; direction: Direction; blocked: boolean } => {
  const moving = vector.x !== 0 || vector.y !== 0;
  const distance = PLAYER_MOVE_SPEED * (deltaMs / 1000);
  const direction = directionFromVector(vector, fallbackDirection);

  if (!moving) {
    return {
      position: clampWorldPosition(position),
      moving: false,
      direction,
      blocked: false
    };
  }

  let blocked = false;
  let next = clampWorldPosition({
    x: position.x + vector.x * distance,
    y: position.y
  });

  if (collidesWithWorld(next, rectangles)) {
    next = { ...position };
    blocked = true;
  }

  next = clampWorldPosition({
    x: next.x,
    y: next.y + vector.y * distance
  });

  if (collidesWithWorld(next, rectangles)) {
    next = { x: next.x, y: position.y };
    blocked = true;
  }

  return {
    position: clampWorldPosition(next),
    moving: true,
    direction,
    blocked
  };
};

export const applyServerMovement = (
  position: WorldPosition,
  input: MovementInput,
  deltaMs: number,
  rectangles: readonly CollisionRectangle[] = WULAND_COLLISION_RECTS
): { position: WorldPosition; moving: boolean; direction: Direction } => {
  const vector = movementVectorFromInput(input);
  const result = applyServerVectorMovement(
    position,
    vector,
    deltaMs,
    directionFromInput(input),
    rectangles
  );

  return {
    position: result.position,
    moving: result.moving,
    direction: result.direction
  };
};
