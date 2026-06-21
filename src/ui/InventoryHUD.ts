import Phaser from 'phaser';
import { FOODS } from '../data/FoodData';

/**
 * InventoryHUD — 物品栏显示组件
 *
 * 可复用的食物库存 HUD，显示 emoji + 名称 + 数量。
 * 支持按需刷新（仅在值变化时更新文本）。
 */
export class InventoryHUD {
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private lastValues: Record<string, number> = {};
  private container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    private inventory: Record<string, number>,
    private foodIds: string[] = ['bread', 'meat', 'cake'],
  ) {
    this.container = scene.add.container(x, y).setDepth(30).setScrollFactor(0);

    this.foodIds.forEach((id, i) => {
      const food = FOODS[id];
      const text = scene.add.text(0, i * 18, `${food.emoji} ${food.name}: ${inventory[id] ?? 0}`, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial',
      });
      this.container.add(text);
      this.texts[id] = text;
      this.lastValues[id] = -1;
    });
  }

  /** 每帧或低频调用：仅在数量变化时更新 */
  refresh(): void {
    for (const id of this.foodIds) {
      const count = this.inventory[id] ?? 0;
      if (count !== this.lastValues[id]) {
        const food = FOODS[id];
        this.texts[id].setText(`${food.emoji} ${food.name}: ${count}`);
        this.lastValues[id] = count;
      }
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
