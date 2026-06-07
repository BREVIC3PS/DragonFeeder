/**
 * Item — 工厂物品类型定义
 * UE 类比：UItemDataAsset
 *
 * 所有在传送带/机器中流动的"物品"都是 ItemType
 * 包括 4 种原料 + 3 种成品（成品 ID 与 FoodData 对齐）
 */

export type ItemType = 'water' | 'wheat' | 'meat_raw' | 'sugar' | 'bread' | 'meat' | 'cake';

/** 物品对应的显示颜色（供渲染层使用） */
export const ITEM_COLORS: Record<ItemType, number> = {
  water:    0x4488ff,
  wheat:    0xddbb44,
  meat_raw: 0xcc6666,
  sugar:    0xeeeeee,
  bread:    0xffdd44,
  meat:     0xff4444,
  cake:     0xff88cc,
};

/** 物品中文名 */
export const ITEM_NAMES: Record<ItemType, string> = {
  water:    '水',
  wheat:    '小麦',
  meat_raw: '生肉',
  sugar:    '糖',
  bread:    '面包',
  meat:     '肉',
  cake:     '蛋糕',
};

/** 是否为食物成品（可喂给龙宝宝） */
export function isFoodProduct(type: ItemType): boolean {
  return type === 'bread' || type === 'meat' || type === 'cake';
}
