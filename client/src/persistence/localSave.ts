import {
  BUILDING_NAMES,
  DEFAULT_COSMETICS,
  LOCAL_SAVE_VERSION,
  WULAND_MAP_ID,
  WULAND_WORLD,
  clampMapPosition,
  type BuildingName,
  type LocalProgress,
  type PlayerProfile,
  isBuildingName,
  isCharacterCosmetics,
  isGender,
  isMapId,
  isPlayerClass
} from "@wuland/shared";

const STORAGE_KEYS = {
  version: "wuland:saveVersion",
  playerId: "wuland:playerId",
  profile: "wuland:playerProfile",
  progress: "wuland:localProgress"
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const readJson = (key: string): unknown | null => {
  const raw = localStorage.getItem(key);

  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const writeJson = (key: string, value: unknown): void => {
  localStorage.setItem(STORAGE_KEYS.version, String(LOCAL_SAVE_VERSION));
  localStorage.setItem(key, JSON.stringify(value));
};

const createPlayerId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const clampPosition = (x: number, y: number, mapId = WULAND_MAP_ID) =>
  clampMapPosition({ x: clamp(x, 0, Number.MAX_SAFE_INTEGER), y: clamp(y, 0, Number.MAX_SAFE_INTEGER) }, mapId);

export const createInitialProgress = (playerId: string): LocalProgress => ({
  playerId,
  currentMapId: WULAND_MAP_ID,
  lastPosition: { ...WULAND_WORLD.defaultSpawn },
  visitedBuildings: [],
  updatedAt: new Date().toISOString()
});

export const getOrCreatePlayerId = (): string => {
  const savedId = localStorage.getItem(STORAGE_KEYS.playerId);

  if (isNonEmptyString(savedId)) {
    return savedId;
  }

  const playerId = createPlayerId();
  localStorage.setItem(STORAGE_KEYS.playerId, playerId);
  return playerId;
};

export const savePlayerProfile = (profile: PlayerProfile): void => {
  if (!isValidPlayerProfile(profile)) {
    throw new Error("Cannot save invalid WULAND player profile.");
  }

  localStorage.setItem(STORAGE_KEYS.playerId, profile.playerId);
  writeJson(STORAGE_KEYS.profile, profile);
};

export const loadPlayerProfile = (): PlayerProfile | null => {
  const value = readJson(STORAGE_KEYS.profile);

  if (value === null) {
    return null;
  }

  if (!isValidPlayerProfile(value)) {
    clearPlayerProfile();
    clearProgress();
    return null;
  }

  localStorage.setItem(STORAGE_KEYS.playerId, value.playerId);
  return value;
};

export const clearPlayerProfile = (): void => {
  localStorage.removeItem(STORAGE_KEYS.profile);
};

export const saveProgress = (progress: LocalProgress): void => {
  if (!isValidProgress(progress)) {
    throw new Error("Cannot save invalid WULAND progress.");
  }

  const normalized: LocalProgress = {
    ...progress,
    currentMapId: progress.currentMapId ?? WULAND_MAP_ID,
    lastPosition: clampPosition(
      progress.lastPosition.x,
      progress.lastPosition.y,
      progress.currentMapId ?? WULAND_MAP_ID
    ),
    visitedBuildings: uniqueVisitedBuildings(progress.visitedBuildings)
  };

  writeJson(STORAGE_KEYS.progress, normalized);
};

export const loadProgress = (): LocalProgress | null => {
  const value = readJson(STORAGE_KEYS.progress);

  if (value === null) {
    return null;
  }

  if (!isValidProgress(value)) {
    clearProgress();
    return null;
  }

  return {
    ...value,
    currentMapId: value.currentMapId ?? WULAND_MAP_ID,
    lastPosition: clampPosition(
      value.lastPosition.x,
      value.lastPosition.y,
      value.currentMapId ?? WULAND_MAP_ID
    ),
    visitedBuildings: uniqueVisitedBuildings(value.visitedBuildings)
  };
};

export const clearProgress = (): void => {
  localStorage.removeItem(STORAGE_KEYS.progress);
};

export const clearAllSaveData = (): void => {
  localStorage.removeItem(STORAGE_KEYS.version);
  localStorage.removeItem(STORAGE_KEYS.playerId);
  clearPlayerProfile();
  clearProgress();
};

export const buildPlayerProfile = (
  profile: Omit<PlayerProfile, "createdAt" | "updatedAt" | "characterCreationCompleted">,
  existing?: PlayerProfile | null
): PlayerProfile => {
  const timestamp = new Date().toISOString();

  return {
    ...profile,
    cosmetics: profile.cosmetics ?? DEFAULT_COSMETICS,
    characterCreationCompleted: true,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
};

const isValidPlayerProfile = (value: unknown): value is PlayerProfile => {
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

const isValidProgress = (value: unknown): value is LocalProgress => {
  if (!isRecord(value) || !isRecord(value.lastPosition)) {
    return false;
  }

  if (
    !isNonEmptyString(value.playerId) ||
    (value.currentMapId !== undefined && !isMapId(value.currentMapId)) ||
    !isFiniteNumber(value.lastPosition.x) ||
    !isFiniteNumber(value.lastPosition.y) ||
    !Array.isArray(value.visitedBuildings) ||
    !isNonEmptyString(value.updatedAt)
  ) {
    return false;
  }

  return value.visitedBuildings.every(isBuildingName);
};

const uniqueVisitedBuildings = (buildings: BuildingName[]): BuildingName[] =>
  BUILDING_NAMES.filter((building) => buildings.includes(building));
