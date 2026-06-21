import Phaser from 'phaser';
import { RECIPES, type RecipeDef } from '../core/factory/Recipe';
import { ITEM_NAMES } from '../core/factory/Item';

/**
 * RecipePanel — 食谱选择面板
 *
 * 为机器切换生产配方。弹出式面板，列出所有可用食谱。
 */
export class RecipePanel {
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;

  /** 选中食谱后回调 */
  onRecipeSelected: ((recipe: RecipeDef) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number = 512, y: number = 384) {
    this.container = scene.add.container(x, y).setDepth(100).setScrollFactor(0);
    this.container.setVisible(false);

    // 半透明背景
    const bg = scene.add.rectangle(0, 0, 300, RECIPES.length * 50 + 40, 0x222244, 0.95)
      .setStrokeStyle(2, 0x446688);
    this.container.add(bg);

    // 标题
    const title = scene.add.text(0, -(RECIPES.length * 25 + 5), '选择配方', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(title);

    // 食谱列表
    RECIPES.forEach((recipe, i) => {
      const y = -RECIPES.length * 25 + 20 + i * 50;
      const btn = scene.add.rectangle(0, y, 260, 40, 0x334466, 0.9)
        .setInteractive({ useHandCursor: true });
      const inputs = recipe.inputs.map(inp => `${ITEM_NAMES[inp.type]}×${inp.count}`).join(' + ');
      const outputs = recipe.outputs.map(o => `${ITEM_NAMES[o.type]}×${o.count}`).join(' + ');
      const label = scene.add.text(0, y, `${recipe.name}: ${inputs} → ${outputs} (${recipe.duration / 10}s)`, {
        fontSize: '11px', color: '#cccccc', fontFamily: 'Arial',
      }).setOrigin(0.5);

      this.container.add([btn, label]);

      btn.on('pointerover', () => btn.setFillStyle(0x446688, 0.9));
      btn.on('pointerout', () => btn.setFillStyle(0x334466, 0.9));
      btn.on('pointerdown', () => {
        this.onRecipeSelected?.(recipe);
        this.hide();
      });
    });
  }

  show(): void {
    this.visible = true;
    this.container.setVisible(true);
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  destroy(): void {
    this.container.destroy();
  }
}
