import type { BuildingName } from "@wuland/shared";

export interface BuildingDefinition {
  name: BuildingName;
  x: number;
  y: number;
  width: number;
  height: number;
  bodyColor: number;
  roofColor: number;
  visitPadding: number;
}

export const BUILDING_LAYOUT: BuildingDefinition[] = [
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
];

export const TREE_OBSTACLES = [
  { x: 245, y: 590 },
  { x: 315, y: 650 },
  { x: 1310, y: 610 },
  { x: 1390, y: 690 },
  { x: 720, y: 990 },
  { x: 890, y: 1015 }
] as const;
