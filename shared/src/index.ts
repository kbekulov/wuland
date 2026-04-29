export const PLAYER_CLASSES = [
  "developer",
  "senior developer",
  "business analyst",
  "senior business analyst",
  "product owner",
  "senior product owner",
  "architect",
  "controller"
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
  },
  controller: {
    displayName: "Controller",
    shortLabel: "CTRL",
    color: "#e8590c",
    iconText: "CTL",
    futureRole: "workflow controller"
  }
};

export const WULAND_PROTOCOL_VERSION = 9;

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

export const WULAND_MAP_IDS = [
  "overworld",
  "rpa_coe",
  "bathroom",
  "kitchen",
  "busybeet",
  "din_break"
] as const;

export type WulandMapId = (typeof WULAND_MAP_IDS)[number];

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
  currentMapId?: WulandMapId;
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

export interface WulandMapDefinition {
  id: WulandMapId;
  displayName: string;
  width: number;
  height: number;
  tileSize: number;
  defaultSpawn: WorldPosition;
  buildingName?: BuildingName;
}

export interface PortalDefinition {
  id: string;
  fromMapId: WulandMapId;
  toMapId: WulandMapId;
  sourceRect: CollisionRectangle;
  destination: WorldPosition;
  label: string;
  buildingName?: BuildingName;
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

export const WULAND_MAP_ID: WulandMapId = "overworld";
export const LEGACY_WULAND_MAP_ID = "wuland-village";
export const INTERIOR_WORLD = {
  tileSize: 32,
  width: 960,
  height: 720,
  defaultSpawn: {
    x: 480,
    y: 560
  } satisfies WorldPosition
} as const;

export const BUILDING_TO_MAP_ID: Record<BuildingName, Exclude<WulandMapId, "overworld">> = {
  "RPA CoE": "rpa_coe",
  Bathroom: "bathroom",
  Kitchen: "kitchen",
  BusyBeet: "busybeet",
  "Din Break": "din_break"
};

export const MAP_ID_TO_BUILDING_NAME: Partial<Record<WulandMapId, BuildingName>> = {
  rpa_coe: "RPA CoE",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  busybeet: "BusyBeet",
  din_break: "Din Break"
};

export const WULAND_MAPS: Record<WulandMapId, WulandMapDefinition> = {
  overworld: {
    id: "overworld",
    displayName: "WULAND",
    width: WULAND_WORLD.width,
    height: WULAND_WORLD.height,
    tileSize: WULAND_WORLD.tileSize,
    defaultSpawn: WULAND_WORLD.defaultSpawn
  },
  rpa_coe: {
    id: "rpa_coe",
    displayName: "RPA CoE",
    width: INTERIOR_WORLD.width,
    height: INTERIOR_WORLD.height,
    tileSize: INTERIOR_WORLD.tileSize,
    defaultSpawn: INTERIOR_WORLD.defaultSpawn,
    buildingName: "RPA CoE"
  },
  bathroom: {
    id: "bathroom",
    displayName: "Bathroom",
    width: INTERIOR_WORLD.width,
    height: INTERIOR_WORLD.height,
    tileSize: INTERIOR_WORLD.tileSize,
    defaultSpawn: INTERIOR_WORLD.defaultSpawn,
    buildingName: "Bathroom"
  },
  kitchen: {
    id: "kitchen",
    displayName: "Kitchen",
    width: INTERIOR_WORLD.width,
    height: INTERIOR_WORLD.height,
    tileSize: INTERIOR_WORLD.tileSize,
    defaultSpawn: INTERIOR_WORLD.defaultSpawn,
    buildingName: "Kitchen"
  },
  busybeet: {
    id: "busybeet",
    displayName: "BusyBeet",
    width: INTERIOR_WORLD.width,
    height: INTERIOR_WORLD.height,
    tileSize: INTERIOR_WORLD.tileSize,
    defaultSpawn: INTERIOR_WORLD.defaultSpawn,
    buildingName: "BusyBeet"
  },
  din_break: {
    id: "din_break",
    displayName: "Din Break",
    width: INTERIOR_WORLD.width,
    height: INTERIOR_WORLD.height,
    tileSize: INTERIOR_WORLD.tileSize,
    defaultSpawn: INTERIOR_WORLD.defaultSpawn,
    buildingName: "Din Break"
  }
};

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

const INTERIOR_WALL_COLLISION_RECTS: CollisionRectangle[] = [
  { id: "wall-top", x: 0, y: 0, width: INTERIOR_WORLD.width, height: 28 },
  { id: "wall-bottom-left", x: 0, y: INTERIOR_WORLD.height - 28, width: 430, height: 28 },
  { id: "wall-bottom-right", x: 530, y: INTERIOR_WORLD.height - 28, width: 430, height: 28 },
  { id: "wall-left", x: 0, y: 0, width: 28, height: INTERIOR_WORLD.height },
  { id: "wall-right", x: INTERIOR_WORLD.width - 28, y: 0, width: 28, height: INTERIOR_WORLD.height }
];

export const INTERIOR_COLLISION_RECTS: Record<Exclude<WulandMapId, "overworld">, CollisionRectangle[]> = {
  rpa_coe: [
    ...INTERIOR_WALL_COLLISION_RECTS,
    { id: "automation-desk-left", x: 112, y: 142, width: 170, height: 62 },
    { id: "automation-desk-right", x: 680, y: 142, width: 170, height: 62 },
    { id: "bot-station", x: 388, y: 96, width: 184, height: 74 },
    { id: "server-rack", x: 790, y: 286, width: 58, height: 164 },
    { id: "meeting-table", x: 362, y: 324, width: 236, height: 76 }
  ],
  bathroom: [
    ...INTERIOR_WALL_COLLISION_RECTS,
    { id: "sink-row", x: 118, y: 126, width: 272, height: 58 },
    { id: "mirror-wall", x: 118, y: 74, width: 272, height: 28 },
    { id: "stall-1", x: 620, y: 98, width: 78, height: 170 },
    { id: "stall-2", x: 720, y: 98, width: 78, height: 170 },
    { id: "laundry-cart", x: 164, y: 376, width: 74, height: 72 }
  ],
  kitchen: [
    ...INTERIOR_WALL_COLLISION_RECTS,
    { id: "counter-top", x: 94, y: 92, width: 500, height: 64 },
    { id: "fridge", x: 704, y: 88, width: 82, height: 104 },
    { id: "stove", x: 808, y: 92, width: 74, height: 86 },
    { id: "center-table", x: 352, y: 304, width: 238, height: 92 },
    { id: "coffee-bar", x: 104, y: 494, width: 210, height: 56 }
  ],
  busybeet: [
    ...INTERIOR_WALL_COLLISION_RECTS,
    { id: "notice-board", x: 104, y: 82, width: 228, height: 46 },
    { id: "focus-desk-a", x: 156, y: 208, width: 164, height: 72 },
    { id: "focus-desk-b", x: 644, y: 208, width: 164, height: 72 },
    { id: "honeycomb-table", x: 376, y: 368, width: 210, height: 86 },
    { id: "printer-hive", x: 782, y: 432, width: 76, height: 92 }
  ],
  din_break: [
    ...INTERIOR_WALL_COLLISION_RECTS,
    { id: "couch-left", x: 124, y: 170, width: 210, height: 74 },
    { id: "couch-right", x: 626, y: 170, width: 210, height: 74 },
    { id: "coffee-table", x: 376, y: 310, width: 208, height: 78 },
    { id: "vending-machine", x: 760, y: 402, width: 72, height: 134 },
    { id: "snack-counter", x: 116, y: 492, width: 226, height: 56 }
  ]
};

export const MAP_COLLISION_RECTS: Record<WulandMapId, CollisionRectangle[]> = {
  overworld: WULAND_COLLISION_RECTS,
  ...INTERIOR_COLLISION_RECTS
};

export const WULAND_PORTALS: PortalDefinition[] = [
  {
    id: "overworld-to-rpa-coe",
    fromMapId: "overworld",
    toMapId: "rpa_coe",
    sourceRect: { id: "door-rpa-coe", x: 760, y: 420, width: 80, height: 52 },
    destination: { x: 480, y: 570 },
    label: "enter RPA CoE",
    buildingName: "RPA CoE"
  },
  {
    id: "rpa-coe-to-overworld",
    fromMapId: "rpa_coe",
    toMapId: "overworld",
    sourceRect: { id: "exit-rpa-coe", x: 430, y: 620, width: 100, height: 72 },
    destination: { x: 800, y: 511 },
    label: "exit to WULAND",
    buildingName: "RPA CoE"
  },
  {
    id: "overworld-to-bathroom",
    fromMapId: "overworld",
    toMapId: "bathroom",
    sourceRect: { id: "door-bathroom", x: 350, y: 440, width: 80, height: 52 },
    destination: { x: 480, y: 570 },
    label: "enter Bathroom",
    buildingName: "Bathroom"
  },
  {
    id: "bathroom-to-overworld",
    fromMapId: "bathroom",
    toMapId: "overworld",
    sourceRect: { id: "exit-bathroom", x: 430, y: 620, width: 100, height: 72 },
    destination: { x: 390, y: 531 },
    label: "exit to WULAND",
    buildingName: "Bathroom"
  },
  {
    id: "overworld-to-kitchen",
    fromMapId: "overworld",
    toMapId: "kitchen",
    sourceRect: { id: "door-kitchen", x: 1155, y: 476, width: 80, height: 52 },
    destination: { x: 480, y: 570 },
    label: "enter Kitchen",
    buildingName: "Kitchen"
  },
  {
    id: "kitchen-to-overworld",
    fromMapId: "kitchen",
    toMapId: "overworld",
    sourceRect: { id: "exit-kitchen", x: 430, y: 620, width: 100, height: 72 },
    destination: { x: 1195, y: 566 },
    label: "exit to WULAND",
    buildingName: "Kitchen"
  },
  {
    id: "overworld-to-busybeet",
    fromMapId: "overworld",
    toMapId: "busybeet",
    sourceRect: { id: "door-busybeet", x: 490, y: 834, width: 80, height: 54 },
    destination: { x: 480, y: 570 },
    label: "enter BusyBeet",
    buildingName: "BusyBeet"
  },
  {
    id: "busybeet-to-overworld",
    fromMapId: "busybeet",
    toMapId: "overworld",
    sourceRect: { id: "exit-busybeet", x: 430, y: 620, width: 100, height: 72 },
    destination: { x: 530, y: 924 },
    label: "exit to WULAND",
    buildingName: "BusyBeet"
  },
  {
    id: "overworld-to-din-break",
    fromMapId: "overworld",
    toMapId: "din_break",
    sourceRect: { id: "door-din-break", x: 1055, y: 866, width: 80, height: 54 },
    destination: { x: 480, y: 570 },
    label: "enter Din Break",
    buildingName: "Din Break"
  },
  {
    id: "din-break-to-overworld",
    fromMapId: "din_break",
    toMapId: "overworld",
    sourceRect: { id: "exit-din-break", x: 430, y: 620, width: 100, height: 72 },
    destination: { x: 1095, y: 956 },
    label: "exit to WULAND",
    buildingName: "Din Break"
  }
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
  | "weapon"
  | "consume"
  | "pickup"
  | "drop"
  | "gift"
  | "shop"
  | "notice"
  | "damage"
  | "shield"
  | "buff"
  | "mark"
  | "enemy-defeated"
  | "player-defeated"
  | "delete"
  | "respawn";

export const CHAT_MAX_MESSAGE_LENGTH = 140;
export const CHAT_COOLDOWN_MS = 1000;

export const PLAYER_MAX_HP = 120;
export const PLAYER_RESPAWN_MS = 4200;

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
  mapId?: WulandMapId;
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

export const HOTBAR_SLOT_COUNT = 9;

export const ITEM_DEFINITION_IDS = [
  "sword",
  "magic-wand",
  "rock",
  "cake",
  "chocolate-cake",
  "fruit-cake",
  "honey-cake",
  "cheese-cake",
  "mystery-cake"
] as const;
export type ItemDefinitionId = (typeof ITEM_DEFINITION_IDS)[number];
export type ItemType = "weapon" | "consumable" | "misc";
export type WeaponType = "melee" | "magic" | "thrown";
export type AttackShape = "arc" | "projectile";

export interface ItemDefinition {
  itemDefinitionId: ItemDefinitionId;
  displayName: string;
  itemType: ItemType;
  iconText: string;
  description: string;
  stackable: boolean;
  maxStack: number;
  weaponType?: WeaponType;
  healAmount?: number;
  healAmountMin?: number;
  healAmountMax?: number;
  damage?: number;
  range?: number;
  attackShape?: AttackShape;
  giftable?: boolean;
}

export const ITEM_DEFINITIONS: Record<ItemDefinitionId, ItemDefinition> = {
  sword: {
    itemDefinitionId: "sword",
    displayName: "Sword",
    itemType: "weapon",
    iconText: "SWD",
    description: "A simple short-range melee weapon.",
    stackable: false,
    maxStack: 1,
    weaponType: "melee",
    damage: 22,
    range: 70,
    attackShape: "arc"
  },
  "magic-wand": {
    itemDefinitionId: "magic-wand",
    displayName: "Magic Wand",
    itemType: "weapon",
    iconText: "WND",
    description: "Fires a readable medium-damage magic bolt.",
    stackable: false,
    maxStack: 1,
    weaponType: "magic",
    damage: 18,
    range: 300,
    attackShape: "projectile"
  },
  rock: {
    itemDefinitionId: "rock",
    displayName: "Rock",
    itemType: "weapon",
    iconText: "ROC",
    description: "A suspiciously useful thrown placeholder weapon.",
    stackable: false,
    maxStack: 1,
    weaponType: "thrown",
    damage: 12,
    range: 220,
    attackShape: "projectile"
  },
  cake: {
    itemDefinitionId: "cake",
    displayName: "Cake",
    itemType: "consumable",
    iconText: "CAK",
    description: "Restores a small amount of HP.",
    stackable: true,
    maxStack: 9,
    healAmount: 32,
    giftable: true
  },
  "chocolate-cake": {
    itemDefinitionId: "chocolate-cake",
    displayName: "Chocolate Cake",
    itemType: "consumable",
    iconText: "CHO",
    description: "Rich morale restoration with a very practical amount of frosting.",
    stackable: true,
    maxStack: 9,
    healAmount: 34,
    giftable: true
  },
  "fruit-cake": {
    itemDefinitionId: "fruit-cake",
    displayName: "Fruit Cake",
    itemType: "consumable",
    iconText: "FRU",
    description: "A light snack that restores a small amount of HP.",
    stackable: true,
    maxStack: 9,
    healAmount: 22,
    giftable: true
  },
  "honey-cake": {
    itemDefinitionId: "honey-cake",
    displayName: "Honey Cake",
    itemType: "consumable",
    iconText: "HNY",
    description: "Sticky, bright, and surprisingly effective at patching morale.",
    stackable: true,
    maxStack: 9,
    healAmount: 44,
    giftable: true
  },
  "cheese-cake": {
    itemDefinitionId: "cheese-cake",
    displayName: "Cheese Cake",
    itemType: "consumable",
    iconText: "CHS",
    description: "A dense recovery cake with questionable structural integrity.",
    stackable: true,
    maxStack: 9,
    healAmount: 32,
    giftable: true
  },
  "mystery-cake": {
    itemDefinitionId: "mystery-cake",
    displayName: "Mystery Cake",
    itemType: "consumable",
    iconText: "MYS",
    description: "Restores a safe but unpredictable amount of HP. Probably cake.",
    stackable: true,
    maxStack: 9,
    healAmount: 28,
    healAmountMin: 12,
    healAmountMax: 52,
    giftable: true
  }
} as const;

export interface MerchantDefinition {
  id: string;
  displayName: string;
  mapId: string;
  x: number;
  y: number;
  interactionRange: number;
  speechLines: string[];
}

export interface MerchantStockItem {
  itemDefinitionId: ItemDefinitionId;
  priceLabel: string;
}

export const WULAND_MERCHANT: MerchantDefinition = {
  id: "wuland-traveling-merchant",
  displayName: "Odd Cart Merchant",
  mapId: WULAND_MAP_ID,
  x: 720,
  y: 650,
  interactionRange: 92,
  speechLines: [
    "Fresh tools for tired heroes.",
    "Need something sharp, shiny, or suspiciously useful?",
    "Come closer, friend. WULAND problems need WULAND solutions.",
    "A wand, a blade, or a rock. All proven in production.",
    "Cakes restore morale. Mostly.",
    "No refunds during incidents."
  ]
} as const;

export const WULAND_MERCHANT_STOCK: MerchantStockItem[] = [
  { itemDefinitionId: "sword", priceLabel: "0 WULAND coins" },
  { itemDefinitionId: "magic-wand", priceLabel: "0 WULAND coins" },
  { itemDefinitionId: "rock", priceLabel: "0 WULAND coins" },
  { itemDefinitionId: "chocolate-cake", priceLabel: "free for prototype" },
  { itemDefinitionId: "fruit-cake", priceLabel: "free for prototype" },
  { itemDefinitionId: "honey-cake", priceLabel: "free for prototype" },
  { itemDefinitionId: "cheese-cake", priceLabel: "free for prototype" },
  { itemDefinitionId: "mystery-cake", priceLabel: "free for prototype" }
] as const;

export const AMBIENT_NPC_TYPES = [
  "cleaning-lady",
  "security-guard",
  "hr-specialist",
  "intern",
  "office-manager",
  "lost-client"
] as const;

export type AmbientNpcType = (typeof AMBIENT_NPC_TYPES)[number];

export interface AmbientNpcDefinition {
  npcId: string;
  type: AmbientNpcType;
  displayName: string;
  mapId: WulandMapId;
  x: number;
  y: number;
  wanderRadius: number;
  speed: number;
  color: number;
  accentColor: number;
  speechLines: string[];
}

export interface AmbientNpcNetworkState {
  npcId: string;
  type: AmbientNpcType;
  displayName: string;
  mapId: WulandMapId;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  wanderRadius: number;
  direction: Direction;
  moving: boolean;
  speechText: string;
  speechUntil: number;
}

export const WULAND_AMBIENT_NPCS: AmbientNpcDefinition[] = [
  {
    npcId: "security-overworld",
    type: "security-guard",
    displayName: "Security Guard",
    mapId: "overworld",
    x: 725,
    y: 475,
    wanderRadius: 120,
    speed: 45,
    color: 0x253449,
    accentColor: 0x74c0fc,
    speechLines: [
      "Badge, please. Or at least look confident.",
      "I saw nothing. I report everything.",
      "No incidents today. That is not a challenge.",
      "The bathroom is suspiciously busy."
    ]
  },
  {
    npcId: "security-rpa-coe",
    type: "security-guard",
    displayName: "Security Guard",
    mapId: "rpa_coe",
    x: 480,
    y: 520,
    wanderRadius: 92,
    speed: 42,
    color: 0x253449,
    accentColor: 0x74c0fc,
    speechLines: [
      "Badge, please. Or at least look confident.",
      "I saw nothing. I report everything.",
      "No incidents today. That is not a challenge.",
      "The bathroom is suspiciously busy."
    ]
  },
  {
    npcId: "cleaning-bathroom",
    type: "cleaning-lady",
    displayName: "Cleaning Lady",
    mapId: "bathroom",
    x: 230,
    y: 430,
    wanderRadius: 120,
    speed: 38,
    color: 0x5f7f8f,
    accentColor: 0xe9fbff,
    speechLines: [
      "I just cleaned that tile.",
      "Someone dropped a rock in the hallway again.",
      "These bots leave more mess than people.",
      "No running near wet floors."
    ]
  },
  {
    npcId: "cleaning-kitchen",
    type: "cleaning-lady",
    displayName: "Cleaning Lady",
    mapId: "kitchen",
    x: 210,
    y: 470,
    wanderRadius: 125,
    speed: 38,
    color: 0x5f7f8f,
    accentColor: 0xe9fbff,
    speechLines: [
      "I just cleaned that tile.",
      "Someone dropped a rock in the hallway again.",
      "These bots leave more mess than people.",
      "No running near wet floors."
    ]
  },
  {
    npcId: "hr-busybeet",
    type: "hr-specialist",
    displayName: "HR Specialist",
    mapId: "busybeet",
    x: 520,
    y: 292,
    wanderRadius: 130,
    speed: 36,
    color: 0x8b5cf6,
    accentColor: 0xfef3c7,
    speechLines: [
      "Remember to communicate respectfully.",
      "Conflict is natural. Documentation is forever.",
      "Have you considered a feedback session?",
      "Morale is a resource. Please stop spending it all at once."
    ]
  },
  {
    npcId: "hr-din-break",
    type: "hr-specialist",
    displayName: "HR Specialist",
    mapId: "din_break",
    x: 420,
    y: 488,
    wanderRadius: 120,
    speed: 36,
    color: 0x8b5cf6,
    accentColor: 0xfef3c7,
    speechLines: [
      "Remember to communicate respectfully.",
      "Conflict is natural. Documentation is forever.",
      "Have you considered a feedback session?",
      "Morale is a resource. Please stop spending it all at once."
    ]
  },
  {
    npcId: "intern-overworld",
    type: "intern",
    displayName: "Intern",
    mapId: "overworld",
    x: 905,
    y: 780,
    wanderRadius: 145,
    speed: 48,
    color: 0x2f9e44,
    accentColor: 0xd3f9d8,
    speechLines: [
      "Is this where the deployment happens?",
      "I brought notes. I lost the notes.",
      "Everything is a learning opportunity, right?"
    ]
  }
] as const;

export interface InventorySlotState {
  slotIndex: number;
  itemDefinitionId: ItemDefinitionId | "";
  itemInstanceId: string;
  quantity: number;
}

export interface DroppedItemNetworkState {
  droppedItemId: string;
  itemDefinitionId: ItemDefinitionId;
  itemInstanceId: string;
  quantity: number;
  mapId: WulandMapId;
  x: number;
  y: number;
  droppedByPlayerId: string;
  droppedAt: string;
}

export interface HotbarSelectRequest {
  slotIndex: number;
}

export interface InventoryMoveRequest {
  fromSlotIndex: number;
  toSlotIndex: number;
}

export interface InventorySlotRequest {
  slotIndex: number;
}

export interface PickupItemRequest {
  droppedItemId?: string;
}

export interface BuyItemRequest {
  itemDefinitionId: ItemDefinitionId;
}

export interface GiftItemRequest {
  targetPlayerId?: string;
}

export interface PortalTransitionRequest {
  portalId?: string;
}

export interface ChatRequest {
  text: string;
}

export interface ChatMessage {
  messageId: string;
  playerId: string;
  playerName: string;
  mapId: WulandMapId;
  text: string;
  sentAt: string;
}

export interface SpeechBubbleEvent {
  id: string;
  sourceType: "player" | "npc";
  sourceId: string;
  mapId: WulandMapId;
  text: string;
  sentAt: string;
}

export interface DeleteDroppedItemRequest {
  droppedItemId: string;
  code?: string;
}

export interface DeletePlayerRequest {
  playerId: string;
  code?: string;
}

export interface ForceDeletedEvent {
  playerId: string;
  message: string;
}

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
  mapId: WulandMapId;
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
  inventory: InventorySlotState[];
  selectedHotbarSlot: number;
  role: string;
  joinedAt: string;
  lastSeenAt: string;
  lastSavedAt: string;
}

export interface EnemyNetworkState {
  enemyId: string;
  type: EnemyType;
  name: string;
  mapId: WulandMapId;
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
  mapId?: WulandMapId;
  x: number;
  y: number;
  value: number;
  text: string;
  color: string;
  itemDefinitionId?: ItemDefinitionId;
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

export const isMapId = (value: unknown): value is WulandMapId =>
  isOneOf(WULAND_MAP_IDS, value);

export const normalizeMapId = (value: unknown): WulandMapId =>
  isMapId(value) ? value : WULAND_MAP_ID;

export const isAmbientNpcType = (value: unknown): value is AmbientNpcType =>
  isOneOf(AMBIENT_NPC_TYPES, value);

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

export const isItemDefinitionId = (value: unknown): value is ItemDefinitionId =>
  isOneOf(ITEM_DEFINITION_IDS, value);

export const isCakeItemDefinitionId = (value: unknown): value is ItemDefinitionId =>
  isItemDefinitionId(value) &&
  ITEM_DEFINITIONS[value].itemType === "consumable" &&
  Boolean(ITEM_DEFINITIONS[value].giftable);

export const isDirection = (value: unknown): value is Direction =>
  isOneOf(["down", "up", "left", "right"] as const, value);

export const isValidHotbarSlotIndex = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < HOTBAR_SLOT_COUNT;

export const isInventorySlotState = (value: unknown): value is InventorySlotState => {
  if (!isRecord(value) || !isValidHotbarSlotIndex(value.slotIndex)) {
    return false;
  }

  const hasItem = value.itemDefinitionId !== "";

  return (
    (value.itemDefinitionId === "" || isItemDefinitionId(value.itemDefinitionId)) &&
    typeof value.itemInstanceId === "string" &&
    isFiniteNumber(value.quantity) &&
    value.quantity >= 0 &&
    (!hasItem || (value.itemInstanceId.trim().length > 0 && value.quantity > 0))
  );
};

export const createEmptyInventory = (): InventorySlotState[] =>
  Array.from({ length: HOTBAR_SLOT_COUNT }, (_value, slotIndex) => ({
    slotIndex,
    itemDefinitionId: "",
    itemInstanceId: "",
    quantity: 0
  }));

export const createItemInstanceId = (
  itemDefinitionId: ItemDefinitionId,
  seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`
): string => `${itemDefinitionId}-${seed}`;

export const createStarterInventory = (seedPrefix = "starter"): InventorySlotState[] => {
  const inventory = createEmptyInventory();
  inventory[0] = {
    slotIndex: 0,
    itemDefinitionId: "rock",
    itemInstanceId: createItemInstanceId("rock", `${seedPrefix}-rock`),
    quantity: 1
  };
  inventory[1] = {
    slotIndex: 1,
    itemDefinitionId: "sword",
    itemInstanceId: createItemInstanceId("sword", `${seedPrefix}-sword`),
    quantity: 1
  };
  inventory[2] = {
    slotIndex: 2,
    itemDefinitionId: "magic-wand",
    itemInstanceId: createItemInstanceId("magic-wand", `${seedPrefix}-wand`),
    quantity: 1
  };
  return inventory;
};

export const normalizeInventory = (
  value: unknown,
  seedPrefix = "starter"
): InventorySlotState[] => {
  if (!Array.isArray(value)) {
    return createStarterInventory(seedPrefix);
  }

  const inventory = createEmptyInventory();
  value.filter(isInventorySlotState).forEach((slot) => {
    const definition = slot.itemDefinitionId ? ITEM_DEFINITIONS[slot.itemDefinitionId] : null;
    inventory[slot.slotIndex] = {
      slotIndex: slot.slotIndex,
      itemDefinitionId: definition ? slot.itemDefinitionId : "",
      itemInstanceId: definition ? slot.itemInstanceId : "",
      quantity: definition ? Math.min(Math.max(1, Math.floor(slot.quantity)), definition.maxStack) : 0
    };
  });

  return inventory.some((slot) => slot.itemDefinitionId !== "")
    ? inventory
    : createStarterInventory(seedPrefix);
};

export const isHotbarSelectRequest = (value: unknown): value is HotbarSelectRequest =>
  isRecord(value) && isValidHotbarSlotIndex(value.slotIndex);

export const isInventoryMoveRequest = (value: unknown): value is InventoryMoveRequest =>
  isRecord(value) &&
  isValidHotbarSlotIndex(value.fromSlotIndex) &&
  isValidHotbarSlotIndex(value.toSlotIndex);

export const isInventorySlotRequest = (value: unknown): value is InventorySlotRequest =>
  isRecord(value) && isValidHotbarSlotIndex(value.slotIndex);

export const isPickupItemRequest = (value: unknown): value is PickupItemRequest =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    (value.droppedItemId === undefined || typeof value.droppedItemId === "string"));

export const isBuyItemRequest = (value: unknown): value is BuyItemRequest =>
  isRecord(value) && isItemDefinitionId(value.itemDefinitionId);

export const isGiftItemRequest = (value: unknown): value is GiftItemRequest =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    (value.targetPlayerId === undefined || typeof value.targetPlayerId === "string"));

export const isPortalTransitionRequest = (value: unknown): value is PortalTransitionRequest =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    (value.portalId === undefined || typeof value.portalId === "string"));

export const isChatRequest = (value: unknown): value is ChatRequest =>
  isRecord(value) &&
  typeof value.text === "string" &&
  value.text.length <= CHAT_MAX_MESSAGE_LENGTH * 4;

export const isDeleteDroppedItemRequest = (value: unknown): value is DeleteDroppedItemRequest =>
  isRecord(value) &&
  isNonEmptyString(value.droppedItemId) &&
  (value.code === undefined || typeof value.code === "string");

export const isDeletePlayerRequest = (value: unknown): value is DeletePlayerRequest =>
  isRecord(value) &&
  isNonEmptyString(value.playerId) &&
  (value.code === undefined || typeof value.code === "string");

export const isDroppedItemNetworkState = (value: unknown): value is DroppedItemNetworkState =>
  isRecord(value) &&
  isNonEmptyString(value.droppedItemId) &&
  isItemDefinitionId(value.itemDefinitionId) &&
  isNonEmptyString(value.itemInstanceId) &&
  isFiniteNumber(value.quantity) &&
  value.quantity > 0 &&
  (isMapId(value.mapId) || value.mapId === LEGACY_WULAND_MAP_ID) &&
  isValidMapPosition({ x: value.x, y: value.y }, normalizeMapId(value.mapId)) &&
  typeof value.droppedByPlayerId === "string" &&
  isNonEmptyString(value.droppedAt);

export const isAmbientNpcNetworkState = (value: unknown): value is AmbientNpcNetworkState =>
  isRecord(value) &&
  isNonEmptyString(value.npcId) &&
  isAmbientNpcType(value.type) &&
  isNonEmptyString(value.displayName) &&
  isMapId(value.mapId) &&
  isValidMapPosition({ x: value.x, y: value.y }, value.mapId) &&
  isFiniteNumber(value.spawnX) &&
  isFiniteNumber(value.spawnY) &&
  isFiniteNumber(value.wanderRadius) &&
  value.wanderRadius >= 0 &&
  isDirection(value.direction) &&
  typeof value.moving === "boolean" &&
  typeof value.speechText === "string" &&
  isFiniteNumber(value.speechUntil);

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
    (value.currentMapId === undefined || isMapId(value.currentMapId)) &&
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

export const getMapDefinition = (mapId: WulandMapId): WulandMapDefinition =>
  WULAND_MAPS[mapId] ?? WULAND_MAPS[WULAND_MAP_ID];

export const getMapCollisionRects = (mapId: WulandMapId): readonly CollisionRectangle[] =>
  MAP_COLLISION_RECTS[mapId] ?? WULAND_COLLISION_RECTS;

export const getMapDisplayName = (mapId: WulandMapId): string =>
  getMapDefinition(mapId).displayName;

export const clampWorldPosition = (
  position: WorldPosition,
  world: Pick<WulandMapDefinition, "width" | "height"> = WULAND_WORLD
): WorldPosition => ({
  x: clamp(
    position.x,
    PLAYER_COLLISION_SIZE.width / 2,
    world.width - PLAYER_COLLISION_SIZE.width / 2
  ),
  y: clamp(
    position.y,
    PLAYER_COLLISION_SIZE.height / 2,
    world.height - PLAYER_COLLISION_SIZE.height / 2
  )
});

export const clampMapPosition = (
  position: WorldPosition,
  mapId: WulandMapId
): WorldPosition => clampWorldPosition(position, getMapDefinition(mapId));

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

export const collidesWithMap = (
  position: WorldPosition,
  mapId: WulandMapId
): boolean => collidesWithWorld(position, getMapCollisionRects(mapId));

export const isValidMapPosition = (
  value: unknown,
  mapId: WulandMapId
): value is WorldPosition => {
  const map = getMapDefinition(mapId);
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    value.x >= 0 &&
    value.x <= map.width &&
    value.y >= 0 &&
    value.y <= map.height
  );
};

export const portalsForMap = (mapId: WulandMapId): PortalDefinition[] =>
  WULAND_PORTALS.filter((portal) => portal.fromMapId === mapId);

export const portalAtPosition = (
  mapId: WulandMapId,
  position: WorldPosition
): PortalDefinition | null => {
  const playerRect = playerRectAt(position);
  return portalsForMap(mapId).find((portal) => rectsOverlap(playerRect, portal.sourceRect)) ?? null;
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
  rectangles: readonly CollisionRectangle[] = WULAND_COLLISION_RECTS,
  world: Pick<WulandMapDefinition, "width" | "height"> = WULAND_WORLD
): { position: WorldPosition; moving: boolean; direction: Direction; blocked: boolean } => {
  const moving = vector.x !== 0 || vector.y !== 0;
  const distance = PLAYER_MOVE_SPEED * (deltaMs / 1000);
  const direction = directionFromVector(vector, fallbackDirection);

  if (!moving) {
    return {
      position: clampWorldPosition(position, world),
      moving: false,
      direction,
      blocked: false
    };
  }

  let blocked = false;
  let next = clampWorldPosition({
    x: position.x + vector.x * distance,
    y: position.y
  }, world);

  if (collidesWithWorld(next, rectangles)) {
    next = { ...position };
    blocked = true;
  }

  next = clampWorldPosition({
    x: next.x,
    y: next.y + vector.y * distance
  }, world);

  if (collidesWithWorld(next, rectangles)) {
    next = { x: next.x, y: position.y };
    blocked = true;
  }

  return {
    position: clampWorldPosition(next, world),
    moving: true,
    direction,
    blocked
  };
};

export const applyServerMovement = (
  position: WorldPosition,
  input: MovementInput,
  deltaMs: number,
  rectangles: readonly CollisionRectangle[] = WULAND_COLLISION_RECTS,
  world: Pick<WulandMapDefinition, "width" | "height"> = WULAND_WORLD
): { position: WorldPosition; moving: boolean; direction: Direction } => {
  const vector = movementVectorFromInput(input);
  const result = applyServerVectorMovement(
    position,
    vector,
    deltaMs,
    directionFromInput(input),
    rectangles,
    world
  );

  return {
    position: result.position,
    moving: result.moving,
    direction: result.direction
  };
};
