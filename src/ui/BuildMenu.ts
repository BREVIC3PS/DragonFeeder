import Phaser from 'phaser';
import { BUILDABLES, type BuildableType } from '../data/BuildableDef';

/**
 * BuildMenu — 建造工具栏组件
 *
 * 可复用的建造类型选择器。
 * 选中项高亮，点击回调通知外部。
 */
export class BuildMenu {
  private container: Phaser.GameObjects.Container;
  selectedType: BuildableType | null = null;

  /** 选中变化时回调 */
  onSelect: ((type: BuildableType | null) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number = 512, y: number = 740) {
    this.container = scene.add.container(x, y).setDepth(30);

    BUILDABLES.forEach((def, i) => {
      const btnX = -((BUILDABLES.length - 1) * 45) + i * 90;
      const btn = scene.add.rectangle(0, 0, 80, 30, 0x334455, 0.9)
        .setInteractive({ useHandCursor: true });
      const label = scene.add.text(0, 0, `${def.emoji} ${def.name}`, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5);
      const itemContainer = scene.add.container(btnX, 0, [btn, label]);
      this.container.add(itemContainer);

      btn.on('pointerdown', () => {
        this.selectedType = def.type;
        // 高亮
        this.container.getAll().forEach(c => {
          const childBtn = (c as Phaser.GameObjects.Container).getAt(0) as Phaser.GameObjects.Rectangle;
          childBtn.setFillStyle(0x334455, 0.9);
          childBtn.setStrokeStyle(0, 0, 0);
        });
        btn.setStrokeStyle(2, 0x44ff44, 0.9);
        this.onSelect?.(def.type);
      });
    });
  }

  setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  destroy(): void {
    this.container.destroy();
  }
}
