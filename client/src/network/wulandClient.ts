import { Client, type Room } from "colyseus.js";
import type {
  CombatEvent,
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

export interface WulandRoomState {
  players: WulandPlayersMap;
  enemies: WulandEnemiesMap;
  totalPlayers: number;
  onlinePlayers: number;
  sleepingPlayers: number;
  totalEnemies: number;
  aliveEnemies: number;
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
