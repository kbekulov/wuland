import { Client, type Room } from "colyseus.js";
import type {
  AmbientNpcNetworkState,
  CombatEvent,
  DroppedItemNetworkState,
  EnemyNetworkState,
  PlayerNetworkState,
  WulandJoinOptions
} from "@wuland/shared";

export interface WulandPlayersMap {
  forEach(
    callback: (player: PlayerNetworkState, playerId: string) => void
  ): void;
  get(playerId: string): PlayerNetworkState | undefined;
}

export interface WulandEnemiesMap {
  forEach(
    callback: (enemy: EnemyNetworkState, enemyId: string) => void
  ): void;
  get(enemyId: string): EnemyNetworkState | undefined;
}

export interface WulandDroppedItemsMap {
  forEach(
    callback: (item: DroppedItemNetworkState, droppedItemId: string) => void
  ): void;
  get(droppedItemId: string): DroppedItemNetworkState | undefined;
}

export interface WulandNpcsMap {
  forEach(
    callback: (npc: AmbientNpcNetworkState, npcId: string) => void
  ): void;
  get(npcId: string): AmbientNpcNetworkState | undefined;
}

export interface WulandRoomState {
  players: WulandPlayersMap;
  enemies: WulandEnemiesMap;
  droppedItems: WulandDroppedItemsMap;
  npcs: WulandNpcsMap;
  totalPlayers: number;
  onlinePlayers: number;
  sleepingPlayers: number;
  totalEnemies: number;
  aliveEnemies: number;
  totalDroppedItems: number;
  godModeEnabled: boolean;
  godModeCodeRequired: boolean;
}

export type WulandClientRoom = Room<WulandRoomState>;

export type WulandCombatEvent = CombatEvent;

const DEFAULT_SERVER_URL = "ws://localhost:2567";

export const getWulandServerUrl = (): string =>
  import.meta.env.VITE_SERVER_URL?.trim() || DEFAULT_SERVER_URL;

export const joinWulandRoom = async (
  options: WulandJoinOptions
): Promise<WulandClientRoom> => {
  const client = new Client(getWulandServerUrl());
  return client.joinOrCreate<WulandRoomState>("wuland", options);
};
