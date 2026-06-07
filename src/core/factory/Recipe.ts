import type { ItemType } from './Item';

/**
 * Recipe — 生产配方
 * UE 类比：DataTable 中的配方行
 *
 * 每个配方定义：消耗什么原料、产出什么成品、需要多长时间
 * 时间以"逻辑帧 tick"为单位（10Hz = 每 tick 0.1 秒）
 */

export interface ItemStack {
  type: ItemType;
  count: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  /** 消耗的原料列表（从机器的输入端口取） */
  inputs: ItemStack[];
  /** 产出的成品列表 */
  outputs: ItemStack[];
  /** 生产周期（逻辑帧 tick 数，10Hz） */
  duration: number;
}

export const RECIPES: RecipeDef[] = [
  {
    id: 'bake_bread',
    name: '烘焙面包',
    inputs: [
      { type: 'wheat', count: 2 },
      { type: 'water', count: 1 },
    ],
    outputs: [{ type: 'bread', count: 1 }],
    duration: 30, // 3 秒
  },
  {
    id: 'cook_meat',
    name: '烹饪肉',
    inputs: [
      { type: 'meat_raw', count: 3 },
    ],
    outputs: [{ type: 'meat', count: 1 }],
    duration: 20, // 2 秒
  },
  {
    id: 'bake_cake',
    name: '烘焙蛋糕',
    inputs: [
      { type: 'wheat', count: 2 },
      { type: 'sugar', count: 1 },
    ],
    outputs: [{ type: 'cake', count: 1 }],
    duration: 40, // 4 秒
  },
];

/** 按成品 foodId 查找配方 */
export function getRecipeForFood(foodId: string): RecipeDef | undefined {
  return RECIPES.find(r => r.outputs.some(o => o.type === foodId));
}
