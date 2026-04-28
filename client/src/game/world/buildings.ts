import {
  WULAND_BUILDINGS,
  WULAND_TREE_OBSTACLES,
  type WulandBuildingDefinition
} from "@wuland/shared";

export type BuildingDefinition = WulandBuildingDefinition;

export const BUILDING_LAYOUT: BuildingDefinition[] = [...WULAND_BUILDINGS];

export const TREE_OBSTACLES = WULAND_TREE_OBSTACLES;
