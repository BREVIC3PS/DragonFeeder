/**
 * FoodData — 食物配置数据
 * UE 类比：DataTable 中的一行（UDataAsset）
 *
 * 所有食物数值集中在这里，方便策划调整
 * 不需要改任何逻辑代码，只改这里的数字即可
 */

/** 单个食物的定义 */
export interface FoodDef {
  id: string;
  name: string;          // 中文名
  emoji: string;         // UI 显示的 emoji
  color: number;         // 食物方块颜色（hex 0xRRGGBB）
  hungerRestore: number; // 恢复的饥饿值（越高越好）
  happinessGain: number; // 增加的满意度（越高越好）
}

/** 所有食物的配置表 */
export const FOODS: Record<string, FoodDef> = {
  bread: {
    id: 'bread',
    name: '面包',
    emoji: '🍞',
    color: 0xffdd44,
    hungerRestore: 15,
    happinessGain: 5,
  },
  meat: {
    id: 'meat',
    name: '肉',
    emoji: '🥩',
    color: 0xff4444,
    hungerRestore: 25,
    happinessGain: 10,
  },
  cake: {
    id: 'cake',
    name: '蛋糕',
    emoji: '🍰',
    color: 0xff88cc,
    hungerRestore: 10,
    happinessGain: 20,
  },
};
