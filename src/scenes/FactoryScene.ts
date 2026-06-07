import Phaser from 'phaser';
import { GameClock } from '../utils/GameClock';
import { DragonState } from '../core/dragon/DragonState';
import { FOODS } from '../data/FoodData';

/**
 * FactoryScene — 工厂场景
 *
 * 数据全部来自 Registry（和 DragonScene 共享同一份数据）：
 * - foodInventory: 食物库存（生产增加、喂食减少）
 * - dragonState: 龙宝宝状态（消耗 dragonScales 来生产食物）
 */

/** 简易配方：生产消耗龙鳞→产出食物 */
interface SimpleRecipe {
  foodId: string;
  scaleCost: number;
  batchSize: number;
}

const RECIPES: SimpleRecipe[] = [
  { foodId: 'bread', scaleCost: 1, batchSize: 5 },
  { foodId: 'meat',  scaleCost: 3, batchSize: 5 },
  { foodId: 'cake',  scaleCost: 5, batchSize: 5 },
];

export class FactoryScene extends Phaser.Scene {
  private gameClock!: GameClock;

  /** 共享数据引用（来自 Registry，不是本地副本） */
  private inventory!: Record<string, number>;
  private dragonState!: DragonState;

  // UI 文字
  private scalesText!: Phaser.GameObjects.Text;
  private inventoryTexts: Record<string, Phaser.GameObjects.Text> = {};
  private statusText!: Phaser.GameObjects.Text;
  private produceBtnTexts: Record<string, Phaser.GameObjects.Text> = {};

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(): void {
    this.gameClock = this.game.registry.get('gameClock') as GameClock;

    // ★ 从 Registry 读取共享数据（和 DragonScene 同一份对象）
    this.inventory = this.game.registry.get('foodInventory') as Record<string, number>;
    this.dragonState = this.game.registry.get('dragonState') as DragonState;

    // ── 背景 ──
    this.add.rectangle(512, 384, 1024, 768, 0x2a2a2a, 0.3);
    this.add.text(512, 30, '🏭 工厂 — 食物生产', {
      fontSize: '24px', color: '#ffaa44', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // ── 龙鳞显示 ──
    this.scalesText = this.add.text(512, 65, '', {
      fontSize: '16px', color: '#ffd700', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // ── 库存显示表格 ──
    this.createInventoryDisplay();

    // ── 生产按钮 ──
    this.createProductionButtons();

    // ── 工厂占位区 ──
    this.add.rectangle(512, 450, 800, 300, 0x444444, 0.3)
      .setStrokeStyle(1, 0x666666);
    this.add.text(512, 450, '工厂流水线区域（Step 4-5 实现传送带+机器）', {
      fontSize: '14px', color: '#666666', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5);

    // ── 状态标识 ──
    this.statusText = this.add.text(512, 600, '', {
      fontSize: '14px', color: '#88aa88', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // ── 渲染帧更新 ──
    this.events.on('update', () => {
      this.refreshUI();
    });

    // ── 逻辑帧（工厂后台运行） ──
    this.gameClock.onTick((_dt: number) => {
      // Step 4 将在这里驱动真正的生产线（Source/Machine/Belt）
    });

    console.log('[FactoryScene] 工厂已就绪，库存来源: Registry');
  }

  // ═══════════════════════════════════════════════════════════
  // 库存显示
  // ═══════════════════════════════════════════════════════════

  private createInventoryDisplay(): void {
    const foodIds = ['bread', 'meat', 'cake'];
    const startX = 350;
    const y = 110;
    const spacing = 180;

    // 表头
    this.add.text(startX - 30, y - 10, '📦 当前库存', {
      fontSize: '15px', color: '#cccccc', fontFamily: 'Arial',
    }).setOrigin(0, 0.5);

    foodIds.forEach((foodId, i) => {
      const food = FOODS[foodId];
      const x = startX + i * spacing;

      // 食物图标 + 名称
      this.add.text(x, y, `${food.emoji} ${food.name}`, {
        fontSize: '16px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5, 0.5);

      // 数量（每帧刷新）
      const countText = this.add.text(x, y + 25, '', {
        fontSize: '20px', color: '#ffdd44', fontFamily: 'Arial',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);

      this.inventoryTexts[foodId] = countText;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 生产按钮
  // ═══════════════════════════════════════════════════════════

  private createProductionButtons(): void {
    const startX = 350;
    const y = 180;
    const spacing = 180;

    RECIPES.forEach((recipe, i) => {
      const food = FOODS[recipe.foodId];
      const x = startX + i * spacing;

      // 按钮
      const btn = this.add.rectangle(x, y, 150, 50, 0x336633, 0.8);
      btn.setStrokeStyle(2, 0x44aa44);
      btn.setInteractive({ useHandCursor: true });
      btn.setDepth(20);

      // 按钮标签
      this.add.text(x, y - 8, `生产 ${food.name} ×${recipe.batchSize}`, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5, 0.5).setDepth(21);

      // 价格（龙鳞消耗）
      const priceText = this.add.text(x, y + 12, '', {
        fontSize: '12px', color: '#ffd700', fontFamily: 'Arial',
      }).setOrigin(0.5, 0.5).setDepth(21);

      this.produceBtnTexts[recipe.foodId] = priceText;

      // 悬浮
      btn.on('pointerover', () => btn.setFillStyle(0x449944, 0.9));
      btn.on('pointerout', () => btn.setFillStyle(0x336633, 0.8));

      // 点击生产
      btn.on('pointerdown', () => {
        this.produce(recipe);
      });
    });
  }

  /**
   * 执行生产（消耗龙鳞 → 产出食物）
   */
  private produce(recipe: SimpleRecipe): void {
    const scales = this.dragonState.dragonScales;

    if (scales < recipe.scaleCost) {
      // 龙鳞不足
      this.showFeedback(`💰 龙鳞不足！需要 ${recipe.scaleCost}，当前 ${scales}`, '#ff4444');
      return;
    }

    // 扣龙鳞
    this.dragonState.dragonScales -= recipe.scaleCost;
    // 加食物（直接修改共享 inventory 对象）
    this.inventory[recipe.foodId] += recipe.batchSize;

    const food = FOODS[recipe.foodId];
    console.log(`[FactoryScene] 生产 ${food.name}×${recipe.batchSize}，消耗 ${recipe.scaleCost} 龙鳞，库存: ${this.inventory[recipe.foodId]}`);
    this.showFeedback(`✅ 生产 ${food.name} ×${recipe.batchSize}！`, '#88ff88');
  }

  /**
   * 短暂反馈文字（生产成功/失败）
   */
  private showFeedback(text: string, color: string): void {
    const fb = this.add.text(512, 240, text, {
      fontSize: '18px', color, fontFamily: 'Arial',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(100);

    this.tweens.add({
      targets: fb,
      y: 220, alpha: 0,
      duration: 1200, ease: 'Quad.easeOut',
      onComplete: () => fb.destroy(),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 每帧刷新 UI
  // ═══════════════════════════════════════════════════════════

  private refreshUI(): void {
    // 龙鳞数
    this.scalesText.setText(`💰 龙鳞: ${this.dragonState.dragonScales}`);

    // 库存文字
    for (const foodId of Object.keys(this.inventoryTexts)) {
      this.inventoryTexts[foodId]?.setText(`×${this.inventory[foodId] ?? 0}`);
    }

    // 配方按钮价格
    for (const recipe of RECIPES) {
      const text = this.produceBtnTexts[recipe.foodId];
      if (text) {
        const affordable = this.dragonState.dragonScales >= recipe.scaleCost;
        const color = affordable ? '#ffd700' : '#ff4444';
        text.setText(`💰${recipe.scaleCost} → ×${recipe.batchSize}`);
        text.setColor(color);
      }
    }

    // 场景状态
    const isAwake = this.scene.isActive('FactoryScene');
    this.statusText.setText(isAwake ? '🟢 工厂活跃' : '🔴 工厂休眠（生产功能仍可用）');
  }
}
