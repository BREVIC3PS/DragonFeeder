import type { ItemType } from '../core/factory/Item';

/**
 * BuildableDef — 可建造建筑定义
 * UE 类比：UBuildingDataAsset
 */

export type BuildableType =
  | 'water_source' | 'wheat_source' | 'meat_source' | 'sugar_source'
  | 'bread_machine' | 'meat_machine' | 'cake_machine'
  | 'feeder';

export interface BuildableDef {
  type: BuildableType;
  name: string;
  emoji: string;
  scaleCost: number;
  category: 'source' | 'machine' | 'feeder';
  itemType?: ItemType;
  recipeId?: string;
  /** 建造时需要指定 interval 的 source 用 */
  sourceIntervalKey?: string;
}

export const BUILDABLES: BuildableDef[] = [
  { type: 'water_source',  name: '水源',   emoji: '💧', scaleCost: 2, category: 'source',  itemType: 'water',    sourceIntervalKey: 'water' },
  { type: 'wheat_source',  name: '麦田',   emoji: '🌾', scaleCost: 2, category: 'source',  itemType: 'wheat',    sourceIntervalKey: 'wheat_a' },
  { type: 'meat_source',   name: '牧场',   emoji: '🥩', scaleCost: 3, category: 'source',  itemType: 'meat_raw', sourceIntervalKey: 'meat_raw' },
  { type: 'sugar_source',  name: '蔗田',   emoji: '🍬', scaleCost: 3, category: 'source',  itemType: 'sugar',    sourceIntervalKey: 'sugar' },
  { type: 'bread_machine', name: '面包机', emoji: '🍞', scaleCost: 5, category: 'machine', recipeId: 'bake_bread' },
  { type: 'meat_machine',  name: '肉机',   emoji: '🍖', scaleCost: 5, category: 'machine', recipeId: 'cook_meat' },
  { type: 'cake_machine',  name: '蛋糕机', emoji: '🍰', scaleCost: 8, category: 'machine', recipeId: 'bake_cake' },
  { type: 'feeder',        name: '喂食仓', emoji: '🐲', scaleCost: 4, category: 'feeder' },
];
