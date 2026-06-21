import Phaser from 'phaser';
import { GameClock } from '../utils/GameClock';
import { DragonState } from '../core/dragon/DragonState';
import {
  FactoryWorld, createDefaultFactory,
} from '../core/factory/FactoryWorld';
import { ITEM_NAMES } from '../core/factory/Item';
import { MachineStatus } from '../core/factory/MachineStatus';
import {
  BOOST_MULTIPLIER, BOOST_DURATION_TICKS, BOOST_SCALE_COST,
} from '../data/GameConfig';
import { FactoryRenderer } from '../systems/FactoryRenderer';
import { BuildSystem } from '../systems/BuildSystem';
import { BeltEditor } from '../systems/BeltEditor';
import { InventoryHUD } from '../ui/InventoryHUD';
import { RecipePanel } from '../ui/RecipePanel';
import type { RecipeDef } from '../core/factory/Recipe';

/**
 * FactoryScene — 工厂场景（编排层）
 *
 * 渲染 → FactoryRenderer
 * 建造/拆除/拖拽 → BuildSystem
 * 传送带编辑 → BeltEditor
 * FactoryScene 负责：双摄像头、WASD、UI、模式切换、输入分发、生命周期
 */

export class FactoryScene extends Phaser.Scene {
  private gameClock!: GameClock;
  private inventory!: Record<string, number>;
  private dragonState!: DragonState;
  private factoryWorld!: FactoryWorld;

  // 子系统
  private factoryRenderer!: FactoryRenderer;
  private buildSystem!: BuildSystem;
  private beltEditor!: BeltEditor;

  // UI 元素
  private inventoryHUD!: InventoryHUD;
  private scalesText!: Phaser.GameObjects.Text;
  private boostBtn!: Phaser.GameObjects.Rectangle;
  private boostLabel!: Phaser.GameObjects.Text;
  private boostTimerText!: Phaser.GameObjects.Text;
  private modeLabel!: Phaser.GameObjects.Text;
  private recipePanel!: RecipePanel;
  private statsText!: Phaser.GameObjects.Text;
  // 龙状态条
  private dragonStatusGfx!: Phaser.GameObjects.Graphics;
  private dragonHungerText!: Phaser.GameObjects.Text;
  private dragonHappyText!: Phaser.GameObjects.Text;
  private dragonMoodText!: Phaser.GameObjects.Text;

  // 配方切换
  private selectedMachineId: string | null = null;

  // 模式系统
  private mode: 'normal' | 'build' | 'belt_edit' = 'normal';

  // 摄像机
  private worldLayer!: Phaser.GameObjects.Container;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private keys!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

  // 订阅清理
  private tickUnsub!: () => void;

  // UI 刷新跟踪
  private lastScales = -1;
  private lastBoostActive = false;
  private lastHunger = -1;
  private lastHappiness = -1;
  private lastMood = '';
  private lastStatsKey = '';

  private trackUI(obj: Phaser.GameObjects.GameObject): void {
    this.uiCam.ignore(obj);
  }

  constructor() {
    super('FactoryScene');
  }

  create(): void {
    // 1. Registry 数据
    this.gameClock = this.game.registry.get('gameClock');
    this.inventory = this.game.registry.get('foodInventory');
    this.dragonState = this.game.registry.get('dragonState');

    // 2. 工厂世界
    this.factoryWorld = createDefaultFactory();
    this.game.registry.set('factoryWorld', this.factoryWorld);

    // 3. 双摄像头
    this.uiCam = this.cameras.main;
    const cam = this.cameras.add(0, 0, 1024, 768);
    cam.setScroll(0, 0); cam.setZoom(1.0);
    this.cameras.main = cam;

    // 4. 世界层
    this.worldLayer = this.add.container(0, 0);
    this.worldLayer.setDepth(0);

    // 5. 子系统
    this.factoryRenderer = new FactoryRenderer(this, this.worldLayer);
    this.buildSystem = new BuildSystem(this, this.factoryWorld, this.dragonState, this.factoryRenderer);
    this.beltEditor = new BeltEditor(this.factoryWorld, this.factoryRenderer);

    // 6. 子系统回调
    this.buildSystem.onShowFeedback = (t, c) => this.showFeedback(t, c);
    this.buildSystem.onCellsOrBeltsChanged = () => this.factoryRenderer.rebuildAllBeltLines(this.factoryWorld);
    this.beltEditor.onShowFeedback = (t, c) => this.showFeedback(t, c);
    this.beltEditor.onBeltChanged = () => this.factoryRenderer.rebuildAllBeltLines(this.factoryWorld);

    // 7. 初始化
    this.buildSystem.refreshOccupiedCells();
    this.factoryRenderer.createStaticBuildings(this.factoryWorld);

    // 8. UI
    this.inventoryHUD = new InventoryHUD(this, 700, 12, this.inventory);
    this.createBoostButton();
    this.createModeButtons();
    this.scalesText = this.add.text(16, 60, '', {
      fontSize: '18px', color: '#ffd700', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(30);
    this.trackUI(this.scalesText);

    // 龙状态条（Feature 3）
    this.dragonStatusGfx = this.add.graphics().setScrollFactor(0).setDepth(30);
    this.trackUI(this.dragonStatusGfx);
    this.dragonHungerText = this.add.text(16, 82, '', {
      fontSize: '11px', color: '#ff8844', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(31);
    this.trackUI(this.dragonHungerText);
    this.dragonHappyText = this.add.text(16, 98, '', {
      fontSize: '11px', color: '#ff88cc', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(31);
    this.trackUI(this.dragonHappyText);
    this.dragonMoodText = this.add.text(16, 114, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(31);
    this.trackUI(this.dragonMoodText);

    // 全局效率统计（Feature 2）
    this.statsText = this.add.text(512, 10, '', {
      fontSize: '12px', color: '#88aacc', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(30);
    this.trackUI(this.statsText);

    // 配方面板（Feature 1）
    this.recipePanel = new RecipePanel(this);
    this.recipePanel.onRecipeSelected = (recipe: RecipeDef) => {
      if (!this.selectedMachineId) return;
      const machine = this.factoryWorld.machines.find(m => m.id === this.selectedMachineId);
      if (machine) {
        machine.setRecipe(recipe);
        this.factoryRenderer.updateMachineGraphic(machine);
        this.factoryRenderer.rebuildAllBeltLines(this.factoryWorld);
        this.showFeedback(`切换配方: ${recipe.name}`, '#44ff44');
      }
      this.recipePanel.hide();
    };

    // 9. 滚轮缩放
    this.input.on('wheel', (_p: unknown, _gx: unknown[], _gy: unknown[], _gz: unknown[], event: WheelEvent) => {
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + delta, 0.5, 2.0));
    });

    // 10. 输入事件
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        if (this.mode === 'build') {
          if (!this.buildSystem.tryStartBuildingDrag(pointer)) {
            this.buildSystem.handleBuildClick(pointer);
          }
        } else if (this.mode === 'belt_edit') {
          this.beltEditor.handleBeltEditClick(pointer);
        } else if (this.mode === 'normal') {
          // Feature 1: 点击机器选择/切换配方
          this.handleNormalClick(pointer);
        }
      } else if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.buildSystem.buildingDragTarget) {
        this.buildSystem.finishBuildingDrag(pointer);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.buildSystem.buildingDragTarget) {
        this.buildSystem.updateBuildingDrag(pointer);
      } else if (pointer.middleButtonDown()) {
        cam.scrollX -= pointer.velocity.x / cam.zoom;
        cam.scrollY -= pointer.velocity.y / cam.zoom;
      }
    });

    // 11. 键盘
    this.input.keyboard?.on('keydown-B', () => { if (this.mode !== 'belt_edit') this.toggleMode('build'); });
    this.input.keyboard?.on('keydown-E', () => { if (this.mode !== 'build') this.toggleMode('belt_edit'); });
    this.input.keyboard?.on('keydown-ESC', () => {
      this.selectedMachineId = null;
      this.factoryRenderer.selectedMachineId = null;
      this.recipePanel.hide();
      this.setMode('normal');
    });

    // 12. WASD
    this.keys = {
      W: this.input.keyboard!.addKey('W'), A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'), D: this.input.keyboard!.addKey('D'),
    };

    // 13. 渲染帧（60fps）
    this.events.on('update', () => {
      this.factoryRenderer.renderDynamicLayer(this.factoryWorld, this.gameClock);
      this.factoryRenderer.renderModeOverlay(
        this.mode, cam, this.input.activePointer, this.buildSystem.occupiedCells,
        this.buildSystem.selectedBuildType, this.beltEditor.wireStart,
        (p) => this.beltEditor.getClickedPort(p),
        this.factoryWorld,
      );
      this.handleWASDCamera();
    });

    // 14. 逻辑帧（10Hz）
    this.tickUnsub = this.gameClock.onTick(() => {
      this.factoryWorld.update(0.1);
      this.refreshUIText();
    });

    // 15. 清理
    this.events.on('shutdown', () => { this.tickUnsub(); });
    console.log('[FactoryScene] 工厂场景已创建');
  }

  // ═══════════════════════════════════════════════════════════════
  // 摄像机
  // ═══════════════════════════════════════════════════════════════

  private handleWASDCamera(): void {
    if (this.mode !== 'normal' || this.buildSystem.buildingDragTarget) return;
    const cam = this.cameras.main;
    const speed = 400 / cam.zoom;
    const dt = this.game.loop.delta / 1000;
    if (this.keys.A.isDown) cam.scrollX -= speed * dt;
    if (this.keys.D.isDown) cam.scrollX += speed * dt;
    if (this.keys.W.isDown) cam.scrollY -= speed * dt;
    if (this.keys.S.isDown) cam.scrollY += speed * dt;
  }

  // ═══════════════════════════════════════════════════════════════
  // UI 刷新（10Hz）
  // ═══════════════════════════════════════════════════════════════

  private refreshUIText(): void {
    const scales = this.dragonState.dragonScales;
    if (scales !== this.lastScales) { this.scalesText.setText(`💎 龙鳞: ${scales}`); this.lastScales = scales; }

    // 龙状态条（Feature 3）
    const hunger = this.dragonState.hunger;
    const happiness = this.dragonState.happiness;
    const mood = this.dragonState.mood;
    if (hunger !== this.lastHunger || happiness !== this.lastHappiness || mood !== this.lastMood) {
      this.drawDragonStatusBars(hunger, happiness, mood);
      this.lastHunger = hunger;
      this.lastHappiness = happiness;
      this.lastMood = mood;
    }

    this.inventoryHUD.refresh();

    for (const m of this.factoryWorld.machines) {
      const text = this.factoryRenderer.machineStatusTexts.get(m.id);
      if (!text) continue;
      let s = '';
      if (m.status === MachineStatus.Running) {
        const util = Math.round(m.getUtilization() * 100);
        s = `生产中 ${m.getRemainingSeconds(this.factoryWorld.boostMultiplier).toFixed(1)}s (利用率 ${util}%)`;
      } else if (m.status === MachineStatus.InputBlocked) {
        s = m.missingInputs.map(d => `缺${ITEM_NAMES[d.type]}(${d.available}/${d.needed})`).join(' ');
      } else if (m.status === MachineStatus.OutputBlocked) {
        s = '输出阻塞';
      }
      if (text.text !== s) text.setText(s);
    }

    // 全局效率统计（Feature 2）
    const stats = this.factoryWorld.getStats();
    const statsKey = `${stats.running}/${stats.total}/${stats.blocked}/${stats.avgBeltFullness.toFixed(1)}`;
    if (statsKey !== this.lastStatsKey) {
      this.lastStatsKey = statsKey;
      this.statsText.setText(
        `机器: ${stats.running}/${stats.total} 运行中 | ` +
        `传送带: ${Math.round(stats.avgBeltFullness * 100)}% | ` +
        `均利用率: ${Math.round(stats.avgUtilization * 100)}%`,
      );
    }

    const ba = this.factoryWorld.boostActive;
    if (ba !== this.lastBoostActive) {
      this.lastBoostActive = ba;
      if (ba) { this.boostBtn.setFillStyle(0xff8844, 0.9); this.boostLabel.setText('⚡ 加速中'); }
      else { this.boostBtn.setFillStyle(0x338833, 0.9); this.boostLabel.setText(`⚡ 加速 (${BOOST_SCALE_COST}鳞)`); }
    }
    this.boostTimerText.setText(ba ? `${(this.factoryWorld.boostRemaining / 10).toFixed(0)}s` : '');
  }

  /** 绘制龙状态条（Feature 3） */
  private drawDragonStatusBars(hunger: number, happiness: number, mood: string): void {
    const gfx = this.dragonStatusGfx;
    gfx.clear();
    const x = 16, barW = 120, barH = 6;

    // 饥饿条
    const hy = 92;
    gfx.fillStyle(0x333333, 0.6);
    gfx.fillRect(x, hy, barW, barH);
    gfx.fillStyle(0xff8844, 0.9);
    gfx.fillRect(x, hy, barW * (hunger / 100), barH);
    this.dragonHungerText.setText(`🍖 饥饿: ${hunger.toFixed(0)}%`);

    // 满意度条
    const py = 108;
    gfx.fillStyle(0x333333, 0.6);
    gfx.fillRect(x, py, barW, barH);
    gfx.fillStyle(0xff88cc, 0.9);
    gfx.fillRect(x, py, barW * (happiness / 100), barH);
    this.dragonHappyText.setText(`💖 满意: ${happiness.toFixed(0)}%`);

    // 情绪
    const moodMap: Record<string, string> = { happy: '😊 开心', normal: '😐 普通', hungry: '😡 饥饿', unhappy: '😢 不开心' };
    this.dragonMoodText.setText(moodMap[mood] ?? mood);
  }

  // ═══════════════════════════════════════════════════════════════
  // UI 创建
  // ═══════════════════════════════════════════════════════════════

  private createBoostButton(): void {
    const bx = 850, by = 48;
    this.boostBtn = this.add.rectangle(bx, by, 140, 28, 0x338833, 0.9).setScrollFactor(0).setDepth(30).setInteractive({ useHandCursor: true });
    this.trackUI(this.boostBtn);
    this.boostLabel = this.add.text(bx, by, `⚡ 加速 (${BOOST_SCALE_COST}鳞)`, { fontSize: '13px', color: '#fff', fontFamily: 'Arial' }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this.trackUI(this.boostLabel);
    this.boostTimerText = this.add.text(bx + 75, by, '', { fontSize: '11px', color: '#fc4', fontFamily: 'Arial' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(31);
    this.trackUI(this.boostTimerText);

    this.boostBtn.on('pointerover', () => { if (!this.factoryWorld.boostActive) this.boostBtn.setFillStyle(0x44aa44, 0.95); });
    this.boostBtn.on('pointerout', () => { if (!this.factoryWorld.boostActive) this.boostBtn.setFillStyle(0x338833, 0.9); });
    this.boostBtn.on('pointerdown', () => this.handleBoostClick());
  }

  private handleBoostClick(): void {
    if (this.factoryWorld.boostActive) return;
    if (this.dragonState.dragonScales < BOOST_SCALE_COST) { this.showFeedback('龙鳞不足!', '#ff4444'); return; }
    this.dragonState.dragonScales -= BOOST_SCALE_COST;
    this.factoryWorld.activateBoost(BOOST_MULTIPLIER, BOOST_DURATION_TICKS);
    this.showFeedback('⚡ 生产加速!', '#ffcc44');
  }

  private showFeedback(text: string, color: string): void {
    const t = this.add.text(512, 300, text, {
      fontSize: '20px', color, fontFamily: 'Arial', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    this.trackUI(t);
    this.tweens.add({ targets: t, y: 250, alpha: 0, duration: 1500, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  // ═══════════════════════════════════════════════════════════════
  // 机器点击（normal 模式 — Feature 1）
  // ═══════════════════════════════════════════════════════════════

  private handleNormalClick(pointer: Phaser.Input.Pointer): void {
    const threshold = 45;
    let closest: { id: string; dist: number } | null = null;

    for (const m of this.factoryWorld.machines) {
      const dist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, m.x, m.y);
      if (dist < threshold && (!closest || dist < closest.dist)) {
        closest = { id: m.id, dist };
      }
    }

    if (closest) {
      this.selectedMachineId = closest.id;
      this.factoryRenderer.selectedMachineId = closest.id;
      this.recipePanel.show();
    } else {
      this.selectedMachineId = null;
      this.factoryRenderer.selectedMachineId = null;
      this.recipePanel.hide();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 模式系统
  // ═══════════════════════════════════════════════════════════════

  private setMode(m: 'normal' | 'build' | 'belt_edit'): void {
    this.mode = m;
    this.beltEditor.wireStart = null;
    this.buildSystem.selectedBuildType = null;
    this.buildSystem.buildToolbar?.destroy();
    this.buildSystem.buildToolbar = null;
    this.selectedMachineId = null;
    this.factoryRenderer.selectedMachineId = null;
    this.recipePanel.hide();

    if (m === 'build') {
      this.buildSystem.buildToolbar = this.buildSystem.createBuildToolbar();
      this.modeLabel.setText('[B] 建造模式');
    } else if (m === 'belt_edit') {
      this.modeLabel.setText('[E] 传送带编辑');
    } else {
      this.modeLabel.setText('');
    }
  }

  private toggleMode(m: 'build' | 'belt_edit'): void {
    this.setMode(this.mode === m ? 'normal' : m);
  }

  private createModeButtons(): void {
    this.modeLabel = this.add.text(16, 40, '', {
      fontSize: '13px', color: '#8ac', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(30);
    this.trackUI(this.modeLabel);
  }

  // ═══════════════════════════════════════════════════════════════
  // 输入分发
  // ═══════════════════════════════════════════════════════════════

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.mode === 'build') this.buildSystem.handleDemolishClick(pointer);
    else if (this.mode === 'belt_edit') this.beltEditor.handleBeltRemoveClick(pointer);
  }
}
