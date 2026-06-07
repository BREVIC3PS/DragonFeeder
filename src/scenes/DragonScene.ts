import Phaser from 'phaser';
import { GameClock } from '../utils/GameClock';
import { DragonState } from '../core/dragon/DragonState';
import { DragonLogic } from '../core/dragon/DragonLogic';
import { Dragon } from '../entities/dragon/Dragon';
import { FOODS, type FoodDef } from '../data/FoodData';
import { EventBus } from '../events/EventBus';

/**
 * DragonScene — 龙宝宝主场景
 *
 * 数据来源：foodInventory 和 dragonState 都从 Registry 读取（BootScene 初始化）
 * 任何场景修改 Registry 中的数据，其他场景立即可见
 */
export class DragonScene extends Phaser.Scene {
  private gameClock!: GameClock;
  private dragonState!: DragonState;
  private dragonLogic!: DragonLogic;
  private dragon!: Dragon;

  /** 共享库存引用（指向 Registry 中的对象，不是本地副本） */
  private inventory!: Record<string, number>;

  private hungerBarGfx!: Phaser.GameObjects.Graphics;
  private happinessBarGfx!: Phaser.GameObjects.Graphics;
  private hungerLabel!: Phaser.GameObjects.Text;
  private happinessLabel!: Phaser.GameObjects.Text;

  private inventoryTexts: Record<string, Phaser.GameObjects.Text> = {};

  private readonly BAR_X = 380;
  private readonly BAR_Y = 420;
  private readonly BAR_W = 260;
  private readonly BAR_H = 16;

  constructor() {
    super({ key: 'DragonScene' });
  }

  create(): void {
    this.gameClock = this.game.registry.get('gameClock') as GameClock;

    // ── 1. 核心组件 ──
    this.dragonState = new DragonState();
    this.dragonLogic = new DragonLogic(this.dragonState);
    this.game.registry.set('dragonState', this.dragonState);

    // ★ 关键：从 Registry 读取共享库存（不是本地副本！）
    // BootScene 已初始化 foodInventory，DragonScene 和 FactoryScene 共享此对象
    this.inventory = this.game.registry.get('foodInventory') as Record<string, number>;

    // ── 2. 背景 ──
    this.add.rectangle(512, 384, 1024, 768, 0x1a1a3e, 0.4);
    this.add.text(512, 20, '🐲 龙宝宝', {
      fontSize: '24px', color: '#88ccff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // ── 3. 龙宝宝 ──
    this.dragon = new Dragon(this, 512, 320, this.dragonState);
    this.dragon.setDepth(10);

    // ── 4. 状态条 ──
    this.createStatusBars();

    // ── 5. 食物按钮 ──
    this.createFoodButtons();

    // ── 6. 逻辑帧 ──
    this.gameClock.onTick((dt: number) => {
      this.dragonLogic.update(dt);
    });

    // ── 7. 渲染帧 ──
    this.events.on('update', () => {
      this.dragon.updateVisuals();
      this.updateStatusBars();
      // 每帧刷新库存文字（工厂可能已修改共享库存）
      this.refreshAllInventoryTexts();
    });

    // ── 8. 工厂喂食事件（Step 6 连接） ──
    EventBus.on('feed_dragon', (data: unknown) => {
      const { foodId } = data as { foodId: string };
      const food = FOODS[foodId];
      if (food) {
        this.doFeedDragon(food);
      }
    });

    console.log('[DragonScene] 龙宝宝已就绪，库存来源: Registry');
  }

  // ═══════════════════════════════════════════════════════════
  // 状态条
  // ═══════════════════════════════════════════════════════════

  private createStatusBars(): void {
    this.add.text(this.BAR_X - 10, this.BAR_Y - 5, '饥饿:', {
      fontSize: '14px', color: '#ff9944', fontFamily: 'Arial',
    }).setOrigin(1, 0.5);

    this.add.text(this.BAR_X - 10, this.BAR_Y + 30, '满意:', {
      fontSize: '14px', color: '#ff88cc', fontFamily: 'Arial',
    }).setOrigin(1, 0.5);

    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x333333, 1);
    bgGfx.fillRect(this.BAR_X, this.BAR_Y - this.BAR_H / 2, this.BAR_W, this.BAR_H);
    bgGfx.fillRect(this.BAR_X, this.BAR_Y + 30 - this.BAR_H / 2, this.BAR_W, this.BAR_H);

    this.hungerBarGfx = this.add.graphics();
    this.happinessBarGfx = this.add.graphics();

    this.hungerLabel = this.add.text(this.BAR_X + this.BAR_W / 2, this.BAR_Y, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5).setDepth(1);

    this.happinessLabel = this.add.text(this.BAR_X + this.BAR_W / 2, this.BAR_Y + 30, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5).setDepth(1);
  }

  private updateStatusBars(): void {
    this.hungerBarGfx.clear();
    const hungerW = (this.dragonState.hunger / 100) * this.BAR_W;
    this.hungerBarGfx.fillStyle(0xff6600, 1);
    this.hungerBarGfx.fillRect(this.BAR_X, this.BAR_Y - this.BAR_H / 2, hungerW, this.BAR_H);
    this.hungerLabel.setText(`饥饿: ${Math.round(this.dragonState.hunger)}/100`);

    this.happinessBarGfx.clear();
    const happinessW = (this.dragonState.happiness / 100) * this.BAR_W;
    this.happinessBarGfx.fillStyle(0xff44aa, 1);
    this.happinessBarGfx.fillRect(this.BAR_X, this.BAR_Y + 30 - this.BAR_H / 2, happinessW, this.BAR_H);
    this.happinessLabel.setText(`满意: ${Math.round(this.dragonState.happiness)}/100`);
  }

  // ═══════════════════════════════════════════════════════════
  // 食物按钮（直接添加到场景）
  // ═══════════════════════════════════════════════════════════

  private createFoodButtons(): void {
    const foodIds = ['bread', 'meat', 'cake'];
    const startX = 300;
    const btnY = 700;
    const spacing = 220;

    foodIds.forEach((foodId, i) => {
      const food = FOODS[foodId];
      const x = startX + i * spacing;

      const btn = this.add.rectangle(x, btnY, 180, 60, food.color, 0.7);
      btn.setStrokeStyle(2, 0xffffff, 0.5);
      btn.setInteractive({ useHandCursor: true });
      btn.setDepth(20);

      this.add.text(x, btnY - 8, `${food.emoji} ${food.name}`, {
        fontSize: '18px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5, 0.5).setDepth(21);

      const countText = this.add.text(x, btnY + 16, '', {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial',
        backgroundColor: '#00000088',
        padding: { x: 6, y: 2 },
      }).setOrigin(0.5, 0.5).setDepth(22);

      this.inventoryTexts[foodId] = countText;

      btn.on('pointerover', () => btn.setFillStyle(food.color, 0.9));
      btn.on('pointerout', () => btn.setFillStyle(food.color, 0.7));
      btn.on('pointerdown', () => this.handleFeedClick(food, x, btnY));
    });

    this.add.text(512, 760, '点击食物按钮喂食 | Tab 切换工厂生产补充', {
      fontSize: '12px', color: '#556677', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);
  }

  /**
   * 每渲染帧刷新所有库存文字
   * 因为工厂可能在另一个场景修改了共享库存
   */
  private refreshAllInventoryTexts(): void {
    for (const foodId of Object.keys(this.inventoryTexts)) {
      const textObj = this.inventoryTexts[foodId];
      if (textObj) {
        textObj.setText(`×${this.inventory[foodId] ?? 0}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 喂食
  // ═══════════════════════════════════════════════════════════

  private handleFeedClick(food: FoodDef, fromX: number, fromY: number): void {
    if (this.inventory[food.id] <= 0) {
      this.showFloatingText('食物耗尽！', fromX, fromY, '#ff4444');
      return;
    }

    this.inventory[food.id]--;
    console.log(`[DragonScene] 喂食 ${food.name} → 库存: ${this.inventory[food.id]}`);

    this.playFoodFlight(food, fromX, fromY, () => {
      this.doFeedDragon(food);
    });
  }

  private doFeedDragon(food: FoodDef): void {
    const moodChanged = this.dragonLogic.feed(food);
    this.dragon.playEatAnimation();
    this.spawnEatParticles(food.color);
    this.showFloatingText('啊呜! 🍽️', this.dragon.x, this.dragon.y - 80, '#ffffff');

    if (moodChanged) {
      this.time.delayedCall(800, () => {
        const moodEmoji: Record<string, string> = {
          happy: '😊 好开心~', normal: '😐',
          hungry: '😣 好饿...', unhappy: '😢 ...',
        };
        this.showFloatingText(
          moodEmoji[this.dragonState.mood] || '',
          this.dragon.x, this.dragon.y - 110, '#ffff88'
        );
      });
    }

    // 临时：喂食奖励 1 龙鳞（Step 7 将改为满意度自动产出）
    this.dragonState.dragonScales += 1;

    this.game.registry.set('dragonState', this.dragonState);
  }

  // ═══════════════════════════════════════════════════════════
  // 动画
  // ═══════════════════════════════════════════════════════════

  private playFoodFlight(food: FoodDef, fromX: number, fromY: number, onArrive: () => void): void {
    const foodSprite = this.add.rectangle(fromX, fromY, 20, 20, food.color);
    foodSprite.setDepth(50);

    this.tweens.add({
      targets: foodSprite,
      x: this.dragon.x,
      duration: 500,
      ease: 'Quad.easeIn',
    });

    this.tweens.add({
      targets: foodSprite,
      duration: 500,
      onUpdate: (tween) => {
        const progress = tween.progress;
        const arcOffset = -60 * Math.sin(progress * Math.PI);
        foodSprite.y = Phaser.Math.Linear(fromY, this.dragon.y, progress) + arcOffset;
      },
      onComplete: () => {
        foodSprite.destroy();
        onArrive();
      },
    });
  }

  private spawnEatParticles(color: number): void {
    const count = Phaser.Math.Between(8, 12);
    const cx = this.dragon.x;
    const cy = this.dragon.y;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.Between(60, 120);

      const particle = this.add.rectangle(cx, cy, Phaser.Math.Between(3, 7), Phaser.Math.Between(3, 7), color);
      particle.setDepth(60).setAlpha(0.9);

      this.tweens.add({
        targets: particle,
        x: cx + Math.cos(angle) * speed,
        y: cy + Math.sin(angle) * speed,
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(400, 700),
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private showFloatingText(text: string, x: number, y: number, color: string): void {
    const floatText = this.add.text(x, y, text, {
      fontSize: '20px', color, fontFamily: 'Arial',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(100);

    this.tweens.add({
      targets: floatText,
      y: y - 50, alpha: 0, scaleX: 1.3, scaleY: 1.3,
      duration: 1000, ease: 'Quad.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }
}
