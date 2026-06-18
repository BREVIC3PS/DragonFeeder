import Phaser from 'phaser';
import { GameClock } from '../utils/GameClock';
import { DragonState } from '../core/dragon/DragonState';
import { DragonLogic } from '../core/dragon/DragonLogic';
import { Dragon } from '../entities/dragon/Dragon';
import { FOODS, type FoodDef } from '../data/FoodData';
import { EventBus } from '../events/EventBus';
import { ScaleSystem } from '../systems/ScaleSystem';
import {
  DRAGON_HUNGER_RATE, DRAGON_HAPPINESS_DECAY, AUTO_FEED_HUNGER_THRESHOLD,
} from '../data/GameConfig';
import { SpeechBubble } from '../entities/dragon/SpeechBubble';
import {
  DIALOGUE_HUNGRY, DIALOGUE_AFTER_EAT,
  DIALOGUE_HAPPY, DIALOGUE_UNHAPPY, pickDialogue,
} from '../data/DialogueData';

/**
 * DragonScene — 龙宝宝主场景
 *
 * Step 7: 龙鳞自动产出（满意度驱动）
 * Step 8: 工厂食物 → 库存面板（非直接喂龙），可切换自动喂食
 */
export class DragonScene extends Phaser.Scene {
  private gameClock!: GameClock;
  private dragonState!: DragonState;
  private dragonLogic!: DragonLogic;
  private dragon!: Dragon;
  private scaleSystem!: ScaleSystem;

  private inventory!: Record<string, number>;
  private autoFeed: boolean = false;

  // 表情气泡
  private speechBubble: SpeechBubble | null = null;
  private idleBubbleTimer: number = 0;     // 空闲气泡计时器（秒）
  private hungryBubbleTimer: number = 0;

  // 互动系统
  private clickCount: number = 0;
  private clickWindowTimer: number = 0;
  private isLongPressing: boolean = false;
  private longPressTimer: number = 0;
  private petInterval: number = 0;

  // 取消订阅句柄
  private tickUnsub?: () => void;
  private foodProducedUnsub?: () => void;

  // 渲染
  private hungerBarGfx!: Phaser.GameObjects.Graphics;
  private happinessBarGfx!: Phaser.GameObjects.Graphics;
  private hungerLabel!: Phaser.GameObjects.Text;
  private happinessLabel!: Phaser.GameObjects.Text;
  private scalesLabel!: Phaser.GameObjects.Text;
  private autoFeedBtn!: Phaser.GameObjects.Rectangle;
  private autoFeedTxt!: Phaser.GameObjects.Text;

  private inventoryTexts: Record<string, Phaser.GameObjects.Text> = {};
  private lastHunger = -1;
  private lastHappiness = -1;
  private lastScales = -1;
  private lastInventoryVal: Record<string, number> = {};

  private readonly BAR_X = 380;
  private readonly BAR_Y = 420;
  private readonly BAR_W = 260;
  private readonly BAR_H = 16;

  constructor() {
    super({ key: 'DragonScene' });
  }

  create(): void {
    this.gameClock = this.game.registry.get('gameClock') as GameClock;

    // ── 核心组件 ──
    // 复用 BootScene 在 registry 中预创建的 DragonState 实例
    // （不再 new DragonState() 后覆写 registry，避免 FactoryScene 已捕获的引用失效）
    this.dragonState = this.game.registry.get('dragonState') as DragonState;
    // 使用 GameConfig 中的速率参数（而非默认值）
    this.dragonLogic = new DragonLogic(this.dragonState, DRAGON_HUNGER_RATE, DRAGON_HAPPINESS_DECAY);
    this.scaleSystem = new ScaleSystem(this.dragonState);

    this.inventory = this.game.registry.get('foodInventory') as Record<string, number>;

    // ── 龙鳞掉落回调 → 播动画 ──
    this.scaleSystem.onScaleProduced = (count) => {
      for (let i = 0; i < count; i++) {
        this.time.delayedCall(i * 120, () => this.playScaleDrop());
      }
    };

    // ── 背景 ──
    this.add.rectangle(512, 384, 1024, 768, 0x1a1a3e, 0.4);
    this.add.text(512, 20, '🐲 龙宝宝', {
      fontSize: '24px', color: '#88ccff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // ── 龙宝宝 ──
    this.dragon = new Dragon(this, 512, 320, this.dragonState);
    this.dragon.setDepth(10);

    // ── 龙宝宝交互（点击 + 长按抚摸） ──
    this.setupDragonInteraction();

    // ── 龙鳞计数（右上角大字） ──
    this.scalesLabel = this.add.text(880, 18, '', {
      fontSize: '22px', color: '#ffd700', fontFamily: 'Arial',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(30);

    // ── 自动喂食开关（右上角，龙鳞下方） ──
    this.createAutoFeedToggle();

    // ── 状态条 + 食物按钮 ──
    this.createStatusBars();
    this.createFoodButtons();

    // ── 逻辑帧（10Hz） ──
    this.tickUnsub = this.gameClock.onTick((dt: number) => {
      this.dragonLogic.update(dt);
      this.scaleSystem.update(dt);
      if (this.scene.isActive()) {
        this.refreshUIText();
        this.updateSpeechBubbles(dt);
      }
      this.updateInteractionTimers(dt);
      if (this.autoFeed) {
        this.tryAutoFeed();
      }
    });

    // ── 渲染帧（60fps）─ 只画 ──
    this.events.on('update', () => {
      const dt = this.game.loop.delta / 1000; // 秒
      this.dragon.updateVisuals(dt);
      this.drawStatusBars();
    });

    // ── Step 8: 工厂食物 → 库存（不是直接喂龙） ──
    this.foodProducedUnsub = EventBus.on('food_produced', (data: unknown) => {
      const { foodId } = data as { foodId: string };
      // 自动喂食模式：直接喂龙，不走库存
      if (this.autoFeed) {
        const food = FOODS[foodId];
        if (food) {
          this.doFeedDragon(food);
          if (this.scene.isActive()) {
            this.showFloatingText(`🏭 ${food.emoji}`, this.dragon.x, this.dragon.y - 80, '#88ffaa');
          }
        }
      } else {
        // 默认：加到库存
        this.inventory[foodId] = (this.inventory[foodId] ?? 0) + 1;
      }
    });

    // ── 场景销毁时清理回调（防止内存泄漏） ──
    this.events.on('shutdown', () => {
      this.tickUnsub?.();
      this.foodProducedUnsub?.();
      console.log('[DragonScene] 回调已清理');
    });

    console.log('[DragonScene] 就绪');
  }

  // ═══════════════════════════════════════════════════════════════
  // 自动喂食开关
  // ═══════════════════════════════════════════════════════════════

  private createAutoFeedToggle(): void {
    this.autoFeedBtn = this.add.rectangle(940, 52, 70, 22, 0x444444, 0.8);
    this.autoFeedBtn.setStrokeStyle(1, 0x888888);
    this.autoFeedBtn.setInteractive({ useHandCursor: true });
    this.autoFeedBtn.setDepth(30);

    this.autoFeedTxt = this.add.text(940, 52, '自动:关', {
      fontSize: '11px', color: '#888888', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5).setDepth(31);

    this.autoFeedBtn.on('pointerdown', () => {
      this.autoFeed = !this.autoFeed;
      const txt = this.autoFeed ? '自动:开' : '自动:关';
      const color = this.autoFeed ? '#88ff88' : '#888888';
      const bgColor = this.autoFeed ? 0x225522 : 0x444444;
      this.autoFeedTxt.setText(txt);
      this.autoFeedTxt.setColor(color);
      this.autoFeedBtn.setFillStyle(bgColor, 0.8);
      console.log(`[DragonScene] 自动喂食: ${this.autoFeed ? 'ON' : 'OFF'}`);
    });
  }

  /** 自动喂食：只在龙饱足度不够时才喂（阈值只 GameConfig），避免浪费 */
  private tryAutoFeed(): void {
    if (this.dragonState.hunger <= AUTO_FEED_HUNGER_THRESHOLD) return; // 不饿，不喂
    // 优先喂满意度最高的食物
    const foods = [FOODS.cake, FOODS.meat, FOODS.bread];
    for (const food of foods) {
      if ((this.inventory[food.id] ?? 0) > 0) {
        this.inventory[food.id]--;
        this.doFeedDragon(food);
        return; // 每次只喂一个
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 龙鳞掉落动画
  // ═══════════════════════════════════════════════════════════════

  private playScaleDrop(): void {
    const startX = this.dragon.x + Phaser.Math.Between(-30, 30);
    const startY = this.dragon.y - 40;

    // 金色小方块从龙身上飘出
    const scale = this.add.rectangle(startX, startY, 10, 10, 0xffd700);
    scale.setDepth(55);

    // 上升 + 左右摇摆 + 渐隐
    this.tweens.add({
      targets: scale,
      x: startX + Phaser.Math.Between(-30, 30),
      y: startY - Phaser.Math.Between(60, 90),
      alpha: 0,
      angle: Phaser.Math.Between(-180, 180),
      scaleX: 1.8, scaleY: 1.8,
      duration: 1200,
      ease: 'Quad.easeOut',
      onComplete: () => scale.destroy(),
    });

    // 右上角数字弹跳
    this.tweens.add({
      targets: this.scalesLabel,
      scaleX: 1.4, scaleY: 1.4,
      duration: 150,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 状态条
  // ═══════════════════════════════════════════════════════════════

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

  private drawStatusBars(): void {
    this.hungerBarGfx.clear();
    const hungerW = (this.dragonState.hunger / 100) * this.BAR_W;
    this.hungerBarGfx.fillStyle(0xff6600, 1);
    this.hungerBarGfx.fillRect(this.BAR_X, this.BAR_Y - this.BAR_H / 2, hungerW, this.BAR_H);

    this.happinessBarGfx.clear();
    const happinessW = (this.dragonState.happiness / 100) * this.BAR_W;
    this.happinessBarGfx.fillStyle(0xff44aa, 1);
    this.happinessBarGfx.fillRect(this.BAR_X, this.BAR_Y + 30 - this.BAR_H / 2, happinessW, this.BAR_H);
  }

  private refreshUIText(): void {
    const h = Math.round(this.dragonState.hunger);
    if (h !== this.lastHunger) {
      this.hungerLabel.setText(`饥饿: ${h}/100`);
      this.lastHunger = h;
    }
    const hp = Math.round(this.dragonState.happiness);
    if (hp !== this.lastHappiness) {
      this.happinessLabel.setText(`满意: ${hp}/100`);
      this.lastHappiness = hp;
    }
    const s = this.dragonState.dragonScales;
    if (s !== this.lastScales) {
      this.scalesLabel.setText(`💰 ${s}`);
      this.lastScales = s;
    }
    for (const foodId of Object.keys(this.inventoryTexts)) {
      const count = this.inventory[foodId] ?? 0;
      if (count !== (this.lastInventoryVal[foodId] ?? -1)) {
        this.inventoryTexts[foodId]?.setText(`×${count}`);
        this.lastInventoryVal[foodId] = count;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 食物按钮
  // ═══════════════════════════════════════════════════════════════

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
      this.lastInventoryVal[foodId] = -1;

      btn.on('pointerover', () => btn.setFillStyle(food.color, 0.9));
      btn.on('pointerout', () => btn.setFillStyle(food.color, 0.7));
      btn.on('pointerdown', () => this.handleFeedClick(food, x, btnY));
    });

    this.add.text(512, 760, '点击按钮喂食 | Tab=工厂 | 自动喂食=工厂直连龙', {
      fontSize: '12px', color: '#556677', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);
  }

  // ═══════════════════════════════════════════════════════════════
  // 喂食
  // ═══════════════════════════════════════════════════════════════

  private handleFeedClick(food: FoodDef, fromX: number, fromY: number): void {
    if (this.inventory[food.id] <= 0) {
      this.showFloatingText('食物耗尽！', fromX, fromY, '#ff4444');
      return;
    }
    this.inventory[food.id]--;
    this.playFoodFlight(food, fromX, fromY, () => {
      this.doFeedDragon(food);
    });
  }

  private doFeedDragon(food: FoodDef): void {
    const moodChanged = this.dragonLogic.feed(food);
    this.dragon.playEatAnimation();
    this.spawnEatParticles(food.color);
    this.showFloatingText('啊呜!', this.dragon.x, this.dragon.y - 80, '#ffffff');

    // 吃完后立刻弹出气泡
    this.showBubble(pickDialogue(DIALOGUE_AFTER_EAT));

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
  }

  // ═══════════════════════════════════════════════════════════════
  // 动画
  // ═══════════════════════════════════════════════════════════════

  private playFoodFlight(food: FoodDef, fromX: number, fromY: number, onArrive: () => void): void {
    const foodSprite = this.add.rectangle(fromX, fromY, 20, 20, food.color);
    foodSprite.setDepth(50);

    // 用 dummy 对象驱动单个 tween，避免双 tween 竞态导致 progress 为 0
    const dummy = { t: 0 };
    const targetX = this.dragon.x;
    const targetY = this.dragon.y;

    this.tweens.add({
      targets: dummy,
      t: 1,
      duration: 500,
      ease: 'Quad.easeInOut',
      onUpdate: () => {
        const progress = dummy.t;
        // 抛物线弧线：中间升高 60px 再落下，食物飞向龙嘴巴
        const arcOffset = -80 * Math.sin(progress * Math.PI);
        foodSprite.x = Phaser.Math.Linear(fromX, targetX, progress);
        foodSprite.y = Phaser.Math.Linear(fromY, targetY, progress) + arcOffset;
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

  // ═══════════════════════════════════════════════════════════════
  // 龙宝宝交互（点击 + 长按抚摸）
  // ═══════════════════════════════════════════════════════════════

  private dragonPointerDown: boolean = false;

  private setupDragonInteraction(): void {
    // Dragon 是 Container，需要设置一个 hit area 才能响应输入
    this.dragon.setInteractive(
      new Phaser.Geom.Circle(0, 0, 55), // 身体大小的圆形碰撞区
      Phaser.Geom.Circle.Contains,
    );

    this.dragon.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation(); // 不冒泡到场景
      this.dragonPointerDown = true;
      if (!this.isLongPressing) {
        this.handleDragonClick();
      }
    });

    this.dragon.on('pointerup', () => {
      this.dragonPointerDown = false;
      if (this.isLongPressing) {
        this.stopPetting();
      }
      this.longPressTimer = 0;
    });

    this.dragon.on('pointerout', () => {
      this.dragonPointerDown = false;
      if (this.isLongPressing) {
        this.stopPetting();
      }
      this.longPressTimer = 0;
    });
  }

  private handleDragonClick(): void {
    this.dragonState.totalClicks++;
    this.clickCount++;

    // 5 秒窗口内点击
    if (this.clickCount === 1) {
      // 第一次点击：惊讶
      this.showBubble('?');
    } else if (this.clickCount >= 10) {
      // 5 秒内超过 10 次：烦躁
      this.showBubble('别戳了！');
      this.dragonState.happiness = Math.max(0, this.dragonState.happiness - 2);
      this.clickCount = 0;
      this.clickWindowTimer = 0;
    } else if (this.clickCount >= 3) {
      // 连点超过 3 次：开心
      this.showBubble('嘿嘿~');
      this.dragonState.happiness = Math.min(100, this.dragonState.happiness + 1);
      this.playHeartParticle();
    }
  }

  private updateInteractionTimers(dt: number): void {
    // 点击窗口计时：5 秒重置
    if (this.clickCount > 0) {
      this.clickWindowTimer += dt;
      if (this.clickWindowTimer >= 5) {
        this.clickCount = 0;
        this.clickWindowTimer = 0;
      }
    }

    // 长按检测（500ms threshold）
    if (this.dragonPointerDown && !this.isLongPressing) {
      this.longPressTimer += dt;
      if (this.longPressTimer >= 0.5) {
        this.startPetting();
      }
    }

    // 抚摸期间生成心形粒子
    if (this.isLongPressing) {
      this.petInterval += dt;
      if (this.petInterval >= 0.5) {
        this.petInterval -= 0.5;
        this.playHeartParticle();
        this.dragonState.happiness = Math.min(100, this.dragonState.happiness + 0.5);
      }
    }
  }

  private startPetting(): void {
    this.isLongPressing = true;
    this.dragonState.totalPats++;
    console.log('[DragonScene] 开始抚摸');
  }

  private stopPetting(): void {
    this.isLongPressing = false;
    this.petInterval = 0;
  }

  /** 心形粒子从龙身上飘出 */
  private playHeartParticle(): void {
    const startX = this.dragon.x + Phaser.Math.Between(-20, 20);
    const startY = this.dragon.y - 30;

    const heart = this.add.text(startX, startY, '♥', {
      fontSize: `${Phaser.Math.Between(12, 20)}px`,
      color: '#ff4488',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5).setDepth(150);

    this.tweens.add({
      targets: heart,
      x: startX + Phaser.Math.Between(-40, 40),
      y: startY - Phaser.Math.Between(50, 100),
      alpha: 0,
      duration: Phaser.Math.Between(800, 1500),
      ease: 'Quad.easeOut',
      onComplete: () => heart.destroy(),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 表情气泡系统
  // ═══════════════════════════════════════════════════════════════

  /** 显示/替换气泡（同一时间最多一个） */
  private showBubble(text: string): void {
    if (this.speechBubble && this.speechBubble.active) {
      this.speechBubble.replaceText(text);
    } else {
      this.speechBubble = new SpeechBubble(
        this, this.dragon.x, this.dragon.y - 90, text,
      ).follow(this.dragon, -90);
    }
  }

  /** 每逻辑帧更新气泡触发条件 */
  private updateSpeechBubbles(dt: number): void {
    const hunger = this.dragonState.hunger;
    const happiness = this.dragonState.happiness;

    // 饥饿触发（hunger >= 30 且 < 70，每 8 秒）
    if (hunger >= 30 && hunger < 70) {
      this.hungryBubbleTimer += dt;
      if (this.hungryBubbleTimer >= 8) {
        this.hungryBubbleTimer = 0;
        this.showBubble(pickDialogue(DIALOGUE_HUNGRY));
      }
    } else {
      this.hungryBubbleTimer = 0;
    }

    // 满意度高触发（happiness > 80，每 15 秒）
    // 满意度低触发（happiness < 30，每 15 秒）
    this.idleBubbleTimer += dt;
    if (this.idleBubbleTimer >= 15) {
      this.idleBubbleTimer = 0;
      if (happiness > 80) {
        this.showBubble(pickDialogue(DIALOGUE_HAPPY));
      } else if (happiness < 30) {
        this.showBubble(pickDialogue(DIALOGUE_UNHAPPY));
      }
    }
  }
}
