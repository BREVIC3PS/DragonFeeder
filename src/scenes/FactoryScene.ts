import Phaser from 'phaser';
import { GameClock } from '../utils/GameClock';
import { DragonState } from '../core/dragon/DragonState';
import { FOODS } from '../data/FoodData';
import {
  FactoryWorld, createDefaultFactory,
  SourceLogic, MachineLogic, DragonFeederLogic,
} from '../core/factory/FactoryWorld';
import { ITEM_COLORS, ITEM_NAMES } from '../core/factory/Item';
import { MachineStatus } from '../core/factory/MachineStatus';
import {
  BOOST_MULTIPLIER, BOOST_DURATION_TICKS, BOOST_SCALE_COST,
  GRID_CELL_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y,
  DEMOLISH_REFUND, BELT_LENGTHS, SOURCE_INTERVALS,
} from '../data/GameConfig';
import { BUILDABLES, type BuildableType } from '../data/BuildableDef';
import { RECIPES } from '../core/factory/Recipe';

/**
 * FactoryScene — 工厂场景
 *
 * 性能设计：
 * - 静态建筑用 Phaser GameObjects（创建一次，GPU 缓存，不每帧重绘）
 * - 动态元素（进度条、端口灯、传送带物品）用 Graphics 每帧更新
 * - 文字更新降频到 10Hz（逻辑帧），且只在值变化时 setText
 */

interface BeltEndpoints { fromX: number; fromY: number; toX: number; toY: number; }

/** 计算实体端口在屏幕上的坐标（独立函数，供 buildBeltEndpoints 和类内方法共用） */
function getPortPos(
  entity: SourceLogic | MachineLogic | DragonFeederLogic,
  port: number, isInput: boolean,
): { x: number; y: number } {
  let w: number;
  if (entity instanceof MachineLogic) w = 90;
  else if (entity instanceof DragonFeederLogic) w = 72;
  else w = 60;
  const dir = isInput ? -1 : 1;
  const spacing = entity instanceof DragonFeederLogic ? 18 : 30;
  const baseY = entity.y - (entity instanceof DragonFeederLogic ? 18 : 30) + port * spacing;
  return { x: entity.x + dir * (w / 2 + 10), y: baseY };
}

function buildBeltEndpoints(fw: FactoryWorld): BeltEndpoints[] {
  return fw.belts.map(belt => {
    const fromPos = getPortPos(belt.sourceObj, belt.sourcePort, false);
    const toPos = getPortPos(belt.destObj, belt.destPort, true);
    return { fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y };
  });
}

// ═══════════════════════════════════════════════════════════════
// Scene
// ═══════════════════════════════════════════════════════════════

export class FactoryScene extends Phaser.Scene {
  private gameClock!: GameClock;
  private inventory!: Record<string, number>;
  private dragonState!: DragonState;
  private factoryWorld!: FactoryWorld;

  // 动态 Graphics（每帧重绘）
  private dynGfx!: Phaser.GameObjects.Graphics;
  private beltItemGfx!: Phaser.GameObjects.Graphics;

  // 缓存的传送带端点（工厂拓扑不变）
  private cachedEndpoints!: BeltEndpoints[];

  // 建筑图形追踪（用于动态增删）
  private sourceGfx: Map<string, Phaser.GameObjects.Container> = new Map();
  private machineGfx: Map<string, Phaser.GameObjects.Container> = new Map();
  private feederGfx: Phaser.GameObjects.Container | null = null;
  private beltStaticGfx!: Phaser.GameObjects.Graphics;
  // 机器状态文字（用于 10Hz 更新）
  private machineStatusTexts: Map<string, Phaser.GameObjects.Text> = new Map();

  // UI 文字引用
  private scalesText!: Phaser.GameObjects.Text;
  private boostBtn!: Phaser.GameObjects.Rectangle;
  private boostLabel!: Phaser.GameObjects.Text;
  private boostTimerText!: Phaser.GameObjects.Text;
  private inventoryTexts: Record<string, Phaser.GameObjects.Text> = {};

  // 上一次 UI 快照（避免无变化的 setText）
  private lastScales = -1;
  private lastInventory: Record<string, number> = {};
  private lastBoostState = false;
  private lastBoostRemaining = -1;
  private lastMachineStatus: Map<string, string> = new Map();

  // ── 模式系统（建造 / 传送带编辑） ──
  private mode: 'normal' | 'build' | 'belt_edit' = 'normal';
  private selectedBuildType: BuildableType | null = null;
  private wireStart: { entityId: string; port: number; x: number; y: number } | null = null;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private wireGfx!: Phaser.GameObjects.Graphics;
  private modeLabel!: Phaser.GameObjects.Text;
  private buildToolbar: Phaser.GameObjects.Container | null = null;
  private occupiedCells: Set<string> = new Set();

  // 拖拽状态
  private cameraDragging: boolean = false;
  private buildingDragTarget: { entityId: string; type: 'source' | 'machine' | 'feeder' } | null = null;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;

  // UI 元素追踪（不受相机缩放/平移影响）
  private uiElements: (Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Container)[] = [];

  private trackUI<T extends { setScrollFactor(v: number): unknown }>(obj: T): T {
    obj.setScrollFactor(0);
    this.uiElements.push(obj as unknown as Phaser.GameObjects.Text);
    return obj;
  }

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(): void {
    this.gameClock = this.game.registry.get('gameClock') as GameClock;
    this.inventory = this.game.registry.get('foodInventory') as Record<string, number>;
    this.dragonState = this.game.registry.get('dragonState') as DragonState;

    this.factoryWorld = createDefaultFactory();
    this.game.registry.set('factoryWorld', this.factoryWorld);

    // 禁止浏览器右键菜单
    this.input.mouse?.disableContextMenu();

    // 缓存传送带端点（只算一次）
    this.cachedEndpoints = buildBeltEndpoints(this.factoryWorld);

    // ── 背景 ──
    this.add.rectangle(512, 384, 1024, 768, 0x1a1a2e, 0.3).setDepth(0);
    this.trackUI(this.add.text(512, 15, '🏭 工厂 — 自动化食物生产', {
      fontSize: '20px', color: '#ffaa44', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setDepth(50));

    // ── 静态建筑（用 GameObjects，只创建一次，GPU 缓存） ──
    this.createStaticBuildings();

    // ── 动态 Graphics 层 ──
    this.dynGfx = this.add.graphics().setDepth(11);
    this.beltItemGfx = this.add.graphics().setDepth(12);

    // ── UI ──
    this.scalesText = this.trackUI(this.add.text(820, 12, '', {
      fontSize: '15px', color: '#ffd700', fontFamily: 'Arial',
    }).setDepth(50)) as Phaser.GameObjects.Text;

    this.createInventoryDisplay();
    this.createBoostButton();

    // ── 模式 Graphics 层 ──
    this.gridGfx = this.add.graphics().setDepth(7).setVisible(false);
    this.ghostGfx = this.add.graphics().setDepth(13).setVisible(false);
    this.wireGfx = this.add.graphics().setDepth(14).setVisible(false);

    // ── 模式切换按钮 ──
    this.createModeButtons();
    this.modeLabel = this.trackUI(this.add.text(512, 738, '', {
      fontSize: '12px', color: '#888888', fontFamily: 'Arial',
    }).setOrigin(0.5, 1).setDepth(50)) as Phaser.GameObjects.Text;

    // ── 刷新占用追踪 ──
    this.refreshOccupiedCells();

    // ── 相机缩放（滚轮） ──
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number) => {
      const delta = dy > 0 ? -0.1 : 0.1;
      const newZoom = Phaser.Math.Clamp(this.cameras.main.zoom + delta, 0.5, 2.0);
      this.cameras.main.setZoom(newZoom);
      // UI 元素反向缩放，保持屏幕大小不变
      const inv = 1 / newZoom;
      for (const el of this.uiElements) {
        el.setScale(inv);
      }
    });

    // ── 输入 ──
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 中键 → 相机拖拽
      if (pointer.middleButtonDown()) {
        this.cameraDragging = true;
        return;
      }
      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer);
      } else {
        this.handleLeftClick(pointer);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.cameraDragging) { this.cameraDragging = false; return; }
      // 建筑拖拽释放
      if (this.buildingDragTarget && pointer.leftButtonReleased()) {
        this.finishBuildingDrag(pointer);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      if (this.cameraDragging) {
        const cam = this.cameras.main;
        cam.setScroll(cam.scrollX - (pointer.velocity.x / cam.zoom), cam.scrollY - (pointer.velocity.y / cam.zoom));
        return;
      }
      if (this.buildingDragTarget) {
        this.updateBuildingDrag(pointer);
      }
    });

    // ── 键盘快捷键 ──
    this.input.keyboard?.on('keydown-B', (e: KeyboardEvent) => { e.preventDefault(); this.toggleMode('build'); });
    this.input.keyboard?.on('keydown-E', (e: KeyboardEvent) => { e.preventDefault(); this.toggleMode('belt_edit'); });
    this.input.keyboard?.on('keydown-ESC', (e: KeyboardEvent) => {
      if (this.mode !== 'normal') { e.preventDefault(); this.setMode('normal'); }
    });

    // ── 渲染帧（60fps）：只画动态元素（便宜） ──
    this.events.on('update', () => {
      this.renderDynamicLayer();
      this.renderModeOverlay();
    });

    // ── 逻辑帧（10Hz）：更新 UI 文字（贵） ──
    this.gameClock.onTick((_dt: number) => {
      this.factoryWorld.update(_dt);
      this.refreshUIText();
    });

    console.log('[FactoryScene] 工厂已启动');
  }

  // ═══════════════════════════════════════════════════════════════
  // 静态建筑（只画一次）
  // ═══════════════════════════════════════════════════════════════

  private createStaticBuildings(): void {
    // 传送带线（静态 Graphics，belt 变化时重绘）
    this.beltStaticGfx = this.add.graphics().setDepth(8);
    this.drawAllBeltLines();

    // 采集器
    for (const src of this.factoryWorld.sources) {
      this.createSourceGraphic(src);
    }
    // 生产机器
    for (const m of this.factoryWorld.machines) {
      this.createMachineGraphic(m);
    }
    // 喂食仓
    if (this.factoryWorld.feeder) {
      this.createFeederGraphic(this.factoryWorld.feeder);
    }
  }

  private drawAllBeltLines(): void {
    this.beltStaticGfx.clear();
    this.beltStaticGfx.lineStyle(3, 0x333344, 1);
    for (const ep of this.cachedEndpoints) {
      this.beltStaticGfx.beginPath();
      this.beltStaticGfx.moveTo(ep.fromX, ep.fromY);
      this.beltStaticGfx.lineTo(ep.toX, ep.toY);
      this.beltStaticGfx.strokePath();
    }
  }

  private createSourceGraphic(src: SourceLogic): Phaser.GameObjects.Container {
    const container = this.add.container(src.x, src.y).setDepth(10);
    const w = 60, h = 60;
    const color = ITEM_COLORS[src.itemType];
    container.add(this.add.rectangle(0, 0, w, h, 0x333333, 0.9));
    container.add(this.add.rectangle(0, 0, w, h).setStrokeStyle(1, color, 0.6).setFillStyle());
    container.add(this.add.rectangle(0, -10, 24, 24, color, 1));
    container.add(this.add.text(0, 20, ITEM_NAMES[src.itemType], {
      fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 0));
    this.sourceGfx.set(src.id, container);
    return container;
  }

  private createMachineGraphic(m: MachineLogic): Phaser.GameObjects.Container {
    const container = this.add.container(m.x, m.y).setDepth(10);
    const w = 90, h = 110;
    const recipe = m.recipe;
    container.add(this.add.rectangle(0, 0, w, h, 0x334455, 0.9));
    // 边框稍后动态画（含状态颜色），这里先画静态背景
    container.add(this.add.rectangle(0, 0, w, h).setStrokeStyle(2, 0x4488cc, 0.8).setFillStyle());
    container.add(this.add.text(0, -h / 2 + 10, recipe ? recipe.name : '无配方', {
      fontSize: '11px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setDepth(15));
    // 配方详情：原料 → 产物
    if (recipe) {
      const ingrStr = recipe.inputs.map(i => `${ITEM_NAMES[i.type]}×${i.count}`).join('+');
      const outStr = recipe.outputs.map(o => `${ITEM_NAMES[o.type]}×${o.count}`).join('');
      container.add(this.add.text(0, -h / 2 + 24, `${ingrStr} → ${outStr}`, {
        fontSize: '9px', color: '#aaaaaa', fontFamily: 'Arial',
      }).setOrigin(0.5, 0).setDepth(15));
    }
    this.machineGfx.set(m.id, container);
    // 状态文字（由 refreshUIText 更新）
    const statusTxt = this.add.text(m.x, m.y + h / 2 + 4, '', {
      fontSize: '10px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setDepth(16);
    this.machineStatusTexts.set(m.id, statusTxt);
    return container;
  }

  private createFeederGraphic(f: DragonFeederLogic): Phaser.GameObjects.Container {
    const container = this.add.container(f.x, f.y).setDepth(10);
    const w = 72, h = 72;
    container.add(this.add.rectangle(0, 0, w, h, 0x553344, 0.9));
    container.add(this.add.rectangle(0, 0, w, h).setStrokeStyle(2, 0xcc66aa, 0.8).setFillStyle());
    container.add(this.add.text(0, 0, '🐲 喂食仓', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial', align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(15));
    this.feederGfx = container;
    return container;
  }

  private rebuildAllBeltLines(): void {
    this.cachedEndpoints = buildBeltEndpoints(this.factoryWorld);
    this.drawAllBeltLines();
  }

  // ═══════════════════════════════════════════════════════════════
  // 动态渲染层（60fps：只有 progress bar、端口灯、传送带物品）
  // ═══════════════════════════════════════════════════════════════

  private renderDynamicLayer(): void {
    this.dynGfx.clear();
    this.beltItemGfx.clear();

    // 机器的动态部分：运行状态背景色 + 进度条 + 端口灯
    for (const m of this.factoryWorld.machines) {
      this.renderMachineDynamic(m);
    }

    // 喂食仓端口灯
    if (this.factoryWorld.feeder) {
      this.renderFeederPorts(this.factoryWorld.feeder);
    }

    // 传送带上的物品小方块
    this.renderBeltItems();
  }

  private renderMachineDynamic(m: MachineLogic): void {
    const cx = m.x, cy = m.y;
    const w = 90, h = 110;
    const subTick = this.gameClock.getSubTickFraction();
    const boost = this.factoryWorld.boostMultiplier;

    // 状态边框颜色
    if (m.status === MachineStatus.InputBlocked) {
      this.dynGfx.lineStyle(2, 0xff4444, 0.9);
      this.dynGfx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    } else if (m.status === MachineStatus.OutputBlocked) {
      this.dynGfx.lineStyle(2, 0xffaa00, 0.9);
      this.dynGfx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }

    // 运行时覆盖色
    if (m.status === MachineStatus.Running) {
      this.dynGfx.fillStyle(0x224466, 0.4);
      this.dynGfx.fillRect(cx - w / 2, cy - h / 2, w, h);
    }

    // 进度条
    if (m.status === MachineStatus.Running) {
      const progress = m.getProgress(subTick, boost);
      const barW = w - 8;
      const barH = 6;
      const barY = cy - h / 2 + 4;

      this.dynGfx.fillStyle(0x222222, 0.8);
      this.dynGfx.fillRect(cx - barW / 2, barY, barW, barH);
      this.dynGfx.fillStyle(0x44cc44, 1);
      this.dynGfx.fillRect(cx - barW / 2, barY, barW * progress, barH);
    }

    // 端口灯（6 个 — 3 输入 + 3 输出）
    const portSize = 8;
    for (let port = 0; port < 3; port++) {
      const py = cy - 30 + port * 30;
      // 输入
      this.dynGfx.fillStyle(m.getInputCount(port) > 0 ? 0x44aa44 : 0x444444, 0.8);
      this.dynGfx.fillRect(cx - w / 2 - portSize - 2, py - portSize / 2, portSize, portSize);
      // 输出
      this.dynGfx.fillStyle(m.getOutputCount(port) > 0 ? 0xcc8844 : 0x444444, 0.8);
      this.dynGfx.fillRect(cx + w / 2 + 2, py - portSize / 2, portSize, portSize);
    }
  }

  private renderFeederPorts(feeder: DragonFeederLogic): void {
    const cx = feeder.x, cy = feeder.y;
    const w = 72;
    for (let port = 0; port < 3; port++) {
      const py = cy - 18 + port * 18;
      this.dynGfx.fillStyle(feeder.getInputCount(port) > 0 ? 0xcc66aa : 0x444444, 0.8);
      this.dynGfx.fillRect(cx - w / 2 - 10, py - 4, 8, 8);
    }
  }

  private renderBeltItems(): void {
    const subTick = this.gameClock.getSubTickFraction();

    for (let i = 0; i < this.factoryWorld.belts.length; i++) {
      const belt = this.factoryWorld.belts[i];
      const ep = this.cachedEndpoints[i];
      if (!ep) continue;

      // 子帧插值：物品在两次 tick 之间平滑滑动
      for (const item of belt.getItems(subTick)) {
        const x = Phaser.Math.Linear(ep.fromX, ep.toX, item.progress);
        const y = Phaser.Math.Linear(ep.fromY, ep.toY, item.progress);
        const color = ITEM_COLORS[item.type] ?? 0xffffff;
        this.beltItemGfx.fillStyle(color, 1);
        this.beltItemGfx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UI 文字更新（10Hz，只在变化时 setText）
  // ═══════════════════════════════════════════════════════════════

  private refreshUIText(): void {
    // 龙鳞（变化时才更新）
    const s = this.dragonState.dragonScales;
    if (s !== this.lastScales) {
      this.scalesText.setText(`💰 龙鳞: ${s}`);
      this.lastScales = s;
    }

    // 库存（逐个比较）
    for (const foodId of Object.keys(this.inventoryTexts)) {
      const count = this.inventory[foodId] ?? 0;
      if (count !== (this.lastInventory[foodId] ?? -1)) {
        this.inventoryTexts[foodId]?.setText(`×${count}`);
        this.lastInventory[foodId] = count;
      }
    }

    // 机器状态文字（倒计时 / 缺料警告）
    for (const m of this.factoryWorld.machines) {
      const txt = this.machineStatusTexts.get(m.id);
      if (!txt) continue;
      let statusStr = '';
      if (m.status === MachineStatus.Running) {
        const sec = m.getRemainingSeconds(this.factoryWorld.boostMultiplier);
        statusStr = `⏳ ${sec.toFixed(1)}s`;
      } else if (m.status === MachineStatus.InputBlocked) {
        const missing = m.missingInputs.map(d => `${ITEM_NAMES[d.type]}×${d.needed - d.available}`).join(',');
        statusStr = `🔴 缺: ${missing}`;
      } else if (m.status === MachineStatus.OutputBlocked) {
        statusStr = '🟡 输出已满';
      } else if (m.status === MachineStatus.Idle && !m.recipe) {
        statusStr = '无配方';
      }
      const prev = this.lastMachineStatus.get(m.id) ?? '';
      if (statusStr !== prev) {
        txt.setText(statusStr);
        txt.setVisible(statusStr !== '');
        this.lastMachineStatus.set(m.id, statusStr);
      }
    }

    // 加速按钮状态
    const isBoost = this.factoryWorld.boostActive;
    const boostRem = this.factoryWorld.boostRemaining;

    if (isBoost !== this.lastBoostState || boostRem !== this.lastBoostRemaining) {
      if (isBoost) {
        const remainingSec = Math.ceil(boostRem / 10);
        this.boostLabel.setText('⏳ 加速中 x2');
        this.boostTimerText.setText(`剩余 ${remainingSec}s`);
        this.boostBtn.setFillStyle(0x886622, 0.9);
        this.boostBtn.disableInteractive();
      } else {
        this.boostLabel.setText(`🚀 加速 x${BOOST_MULTIPLIER}`);
        this.boostTimerText.setText(`💰${BOOST_SCALE_COST} 龙鳞 / ${BOOST_DURATION_TICKS / 10}s`);
        this.boostBtn.setFillStyle(0x664400, 0.8);
        this.boostBtn.setInteractive({ useHandCursor: true });
      }
      this.lastBoostState = isBoost;
      this.lastBoostRemaining = boostRem;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 库存显示
  // ═══════════════════════════════════════════════════════════════

  private createInventoryDisplay(): void {
    const foodIds = ['bread', 'meat', 'cake'];
    const startX = 800;
    const y = 40;
    const spacing = 70;

    this.trackUI(this.add.text(startX, y - 10, '📦 库存', {
      fontSize: '13px', color: '#888888', fontFamily: 'Arial',
    }).setOrigin(0, 0.5).setDepth(50));

    foodIds.forEach((foodId, i) => {
      const food = FOODS[foodId];
      const fy = y + 18 + i * spacing;
      this.trackUI(this.add.text(startX, fy, `${food.emoji}`, { fontSize: '16px' }).setOrigin(0, 0.5).setDepth(50));

      const countText = this.trackUI(this.add.text(startX + 30, fy, '×0', {
        fontSize: '14px', color: '#ffdd44', fontFamily: 'Arial', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(50)) as Phaser.GameObjects.Text;

      this.inventoryTexts[foodId] = countText;
      this.lastInventory[foodId] = -1;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 加速按钮
  // ═══════════════════════════════════════════════════════════════

  private createBoostButton(): void {
    const bx = 860;
    const by = 710;

    this.boostBtn = this.trackUI(this.add.rectangle(bx, by, 140, 36, 0x664400, 0.8));
    this.boostBtn.setStrokeStyle(2, 0xffaa00);
    this.boostBtn.setInteractive({ useHandCursor: true });
    this.boostBtn.setDepth(50);

    this.boostLabel = this.trackUI(this.add.text(bx, by - 10, '🚀 加速 x2', {
      fontSize: '13px', color: '#ffd700', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5).setDepth(51)) as Phaser.GameObjects.Text;

    this.boostTimerText = this.trackUI(this.add.text(bx, by + 10, `💰${BOOST_SCALE_COST} 龙鳞 / ${BOOST_DURATION_TICKS / 10}s`, {
      fontSize: '11px', color: '#ff9944', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5).setDepth(51)) as Phaser.GameObjects.Text;

    this.boostBtn.on('pointerover', () => {
      if (!this.factoryWorld.boostActive) this.boostBtn.setFillStyle(0x886600, 0.9);
    });
    this.boostBtn.on('pointerout', () => {
      if (!this.factoryWorld.boostActive) this.boostBtn.setFillStyle(0x664400, 0.8);
    });
    this.boostBtn.on('pointerdown', () => this.handleBoostClick());
  }

  private handleBoostClick(): void {
    if (this.factoryWorld.boostActive) {
      this.showFeedback('⏳ 已在加速中！', '#ffaa44');
      return;
    }
    if (this.dragonState.dragonScales < BOOST_SCALE_COST) {
      this.showFeedback(`💰 龙鳞不足！需要 ${BOOST_SCALE_COST}，当前 ${this.dragonState.dragonScales}`, '#ff4444');
      return;
    }
    this.dragonState.dragonScales -= BOOST_SCALE_COST;
    this.factoryWorld.activateBoost(BOOST_MULTIPLIER, BOOST_DURATION_TICKS);
    this.showFeedback(`🚀 生产加速 x${BOOST_MULTIPLIER}！持续 ${BOOST_DURATION_TICKS / 10} 秒`, '#88ff88');
  }

  private showFeedback(text: string, color: string): void {
    const fb = this.add.text(512, 50, text, {
      fontSize: '16px', color, fontFamily: 'Arial',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(100);

    this.tweens.add({
      targets: fb, y: 35, alpha: 0,
      duration: 1500, ease: 'Quad.easeOut',
      onComplete: () => fb.destroy(),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 模式系统
  // ═══════════════════════════════════════════════════════════════

  private setMode(m: 'normal' | 'build' | 'belt_edit'): void {
    this.mode = m;
    this.wireStart = null;
    this.selectedBuildType = null;
    this.gridGfx.setVisible(m === 'build');
    this.ghostGfx.setVisible(m === 'build');
    this.wireGfx.setVisible(m === 'belt_edit');
    if (m === 'build' && !this.buildToolbar) this.createBuildToolbar();
    if (this.buildToolbar) this.buildToolbar.setVisible(m === 'build');
    const labels: Record<string, string> = { normal: '', build: '🔧 建造模式 (B)', belt_edit: '🔗 编辑传送带 (E)' };
    this.modeLabel.setText(labels[m]);
  }

  private toggleMode(m: 'build' | 'belt_edit'): void {
    this.setMode(this.mode === m ? 'normal' : m);
  }

  private createModeButtons(): void {
    const btnY = 736;
    const buildBtn = this.trackUI(this.add.rectangle(790, btnY, 100, 20, 0x333333, 0.8)
      .setStrokeStyle(1, 0x666666).setInteractive({ useHandCursor: true }).setDepth(50)) as Phaser.GameObjects.Rectangle;
    this.trackUI(this.add.text(790, btnY, '🔧 建造 [B]', { fontSize: '10px', color: '#aaaaaa', fontFamily: 'Arial' })
      .setOrigin(0.5, 0.5).setDepth(51));
    buildBtn.on('pointerdown', () => this.toggleMode('build'));

    const beltBtn = this.trackUI(this.add.rectangle(900, btnY, 114, 20, 0x333333, 0.8)
      .setStrokeStyle(1, 0x666666).setInteractive({ useHandCursor: true }).setDepth(50)) as Phaser.GameObjects.Rectangle;
    this.trackUI(this.add.text(900, btnY, '🔗 编辑传送带 [E]', { fontSize: '10px', color: '#aaaaaa', fontFamily: 'Arial' })
      .setOrigin(0.5, 0.5).setDepth(51));
    beltBtn.on('pointerdown', () => this.toggleMode('belt_edit'));
  }

  // ═══════════════════════════════════════════════════════════════
  // 模式覆盖层渲染（60fps）
  // ═══════════════════════════════════════════════════════════════

  private renderModeOverlay(): void {
    if (this.mode === 'build') {
      this.renderBuildGrid();
      this.renderGhostPreview();
    } else if (this.mode === 'belt_edit') {
      this.renderPortHighlights();
      this.renderWirePreview();
    }
  }

  private renderBuildGrid(): void {
    this.gridGfx.clear();
    const cam = this.cameras.main;
    const vx = cam.worldView.x, vy = cam.worldView.y;
    const vw = cam.worldView.width, vh = cam.worldView.height;
    const startCol = Math.floor((vx - GRID_OFFSET_X) / GRID_CELL_SIZE) - 1;
    const endCol = Math.ceil((vx + vw - GRID_OFFSET_X) / GRID_CELL_SIZE) + 1;
    const startRow = Math.floor((vy - GRID_OFFSET_Y) / GRID_CELL_SIZE) - 1;
    const endRow = Math.ceil((vy + vh - GRID_OFFSET_Y) / GRID_CELL_SIZE) + 1;

    this.gridGfx.lineStyle(1, 0x333355, 0.25);
    for (let col = startCol; col <= endCol; col++) {
      const x = GRID_OFFSET_X + col * GRID_CELL_SIZE;
      this.gridGfx.beginPath();
      this.gridGfx.moveTo(x, GRID_OFFSET_Y + startRow * GRID_CELL_SIZE);
      this.gridGfx.lineTo(x, GRID_OFFSET_Y + endRow * GRID_CELL_SIZE);
      this.gridGfx.strokePath();
    }
    for (let row = startRow; row <= endRow; row++) {
      const y = GRID_OFFSET_Y + row * GRID_CELL_SIZE;
      this.gridGfx.beginPath();
      this.gridGfx.moveTo(GRID_OFFSET_X + startCol * GRID_CELL_SIZE, y);
      this.gridGfx.lineTo(GRID_OFFSET_X + endCol * GRID_CELL_SIZE, y);
      this.gridGfx.strokePath();
    }
    // 显示占用
    this.gridGfx.fillStyle(0x444466, 0.3);
    for (const key of this.occupiedCells) {
      const [cs, rs] = key.split(',').map(Number);
      if (cs >= startCol && cs <= endCol && rs >= startRow && rs <= endRow) {
        this.gridGfx.fillRect(GRID_OFFSET_X + cs * GRID_CELL_SIZE, GRID_OFFSET_Y + rs * GRID_CELL_SIZE, GRID_CELL_SIZE, GRID_CELL_SIZE);
      }
    }
  }

  private renderGhostPreview(): void {
    this.ghostGfx.clear();
    if (!this.selectedBuildType) return;
    const pointer = this.input.activePointer;
    const cell = this.pointerToCell(pointer);
    if (this.isCellOccupied(cell.col, cell.row)) return;
    const px = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE;
    const py = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE;
    this.ghostGfx.fillStyle(0x44ff44, 0.25);
    this.ghostGfx.fillRect(px, py, GRID_CELL_SIZE, GRID_CELL_SIZE);
    this.ghostGfx.lineStyle(1, 0x44ff44, 0.5);
    this.ghostGfx.strokeRect(px, py, GRID_CELL_SIZE, GRID_CELL_SIZE);
  }

  /** 检查输入端口是否已被传送带占用 */
  private isInputPortOccupied(entityId: string, port: number): boolean {
    return this.factoryWorld.belts.some(
      b => b.destObj.id === entityId && b.destPort === port
    );
  }

  private getClickedPort(pointer: Phaser.Input.Pointer): {
    entity: SourceLogic | MachineLogic | DragonFeederLogic;
    port: number; isInput: boolean; x: number; y: number;
  } | null {
    const radius = 10;
    const allEntities: (SourceLogic | MachineLogic | DragonFeederLogic)[] = [
      ...this.factoryWorld.sources,
      ...this.factoryWorld.machines,
    ];
    if (this.factoryWorld.feeder) allEntities.push(this.factoryWorld.feeder);

    for (const entity of allEntities) {
      const portCount = entity instanceof DragonFeederLogic ? 3 : (entity instanceof SourceLogic ? 1 : 3);
      // 输出端口（Source 和 Machine 有输出）
      if (!(entity instanceof DragonFeederLogic)) {
        for (let p = 0; p < portCount; p++) {
          const pos = getPortPos(entity, p, false);
          if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, pos.x, pos.y) < radius) {
            return { entity, port: p, isInput: false, x: pos.x, y: pos.y };
          }
        }
      }
      // 输入端口（Machine 和 Feeder 有输入）— 已被占用的不可选
      if (entity instanceof MachineLogic || entity instanceof DragonFeederLogic) {
        const inputCount = entity instanceof DragonFeederLogic ? 3 : 3;
        for (let p = 0; p < inputCount; p++) {
          if (this.isInputPortOccupied(entity.id, p)) continue;
          const pos = getPortPos(entity, p, true);
          if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, pos.x, pos.y) < radius) {
            return { entity, port: p, isInput: true, x: pos.x, y: pos.y };
          }
        }
      }
    }
    return null;
  }

  private renderPortHighlights(): void {
    this.wireGfx.clear();
    const allEntities: (SourceLogic | MachineLogic | DragonFeederLogic)[] = [
      ...this.factoryWorld.sources,
      ...this.factoryWorld.machines,
    ];
    if (this.factoryWorld.feeder) allEntities.push(this.factoryWorld.feeder);

    for (const entity of allEntities) {
      const portCount = entity instanceof DragonFeederLogic ? 3 : (entity instanceof SourceLogic ? 1 : 3);
      // 输出端口（橙色圆点）
      if (!(entity instanceof DragonFeederLogic)) {
        for (let p = 0; p < portCount; p++) {
          const pos = getPortPos(entity, p, false);
          this.wireGfx.fillStyle(0xcc8844, 0.7);
          this.wireGfx.fillCircle(pos.x, pos.y, 5);
        }
      }
      // 输入端口 — 已占用显示红色，空闲显示绿色
      if (entity instanceof MachineLogic || entity instanceof DragonFeederLogic) {
        const inputCount = entity instanceof DragonFeederLogic ? 3 : 3;
        for (let p = 0; p < inputCount; p++) {
          const pos = getPortPos(entity, p, true);
          const occupied = this.isInputPortOccupied(entity.id, p);
          this.wireGfx.fillStyle(occupied ? 0xff4444 : 0x44aa44, 0.7);
          this.wireGfx.fillCircle(pos.x, pos.y, 5);
        }
      }
    }
  }

  private renderWirePreview(): void {
    if (!this.wireStart) return;
    const pointer = this.input.activePointer;
    this.wireGfx.lineStyle(2, 0xffffff, 0.6);
    this.wireGfx.beginPath();
    this.wireGfx.moveTo(this.wireStart.x, this.wireStart.y);
    // 检查鼠标是否悬停在有效目标端口上
    const target = this.getClickedPort(pointer);
    if (target && target.isInput && target.entity.id !== this.wireStart.entityId) {
      this.wireGfx.lineTo(target.x, target.y);
    } else {
      this.wireGfx.lineTo(pointer.worldX, pointer.worldY);
    }
    this.wireGfx.strokePath();
  }

  // ═══════════════════════════════════════════════════════════════
  // 输入派发
  // ═══════════════════════════════════════════════════════════════

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (this.mode === 'build') {
      this.handleBuildClick(pointer);
    } else if (this.mode === 'belt_edit') {
      this.handleBeltEditClick(pointer);
    } else {
      // 普通模式：尝试开始拖拽建筑
      this.tryStartBuildingDrag(pointer);
    }
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.mode === 'build') this.handleDemolishClick(pointer);
    else if (this.mode === 'belt_edit') this.handleBeltRemoveClick(pointer);
  }

  // ═══════════════════════════════════════════════════════════════
  // 建筑拖拽
  // ═══════════════════════════════════════════════════════════════

  private tryStartBuildingDrag(pointer: Phaser.Input.Pointer): void {
    const threshold = 40;
    let entity: SourceLogic | MachineLogic | DragonFeederLogic | null = null;
    let type: 'source' | 'machine' | 'feeder' = 'source';

    for (const src of this.factoryWorld.sources) {
      if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, src.x, src.y) < threshold) {
        entity = src; type = 'source'; break;
      }
    }
    if (!entity) {
      for (const m of this.factoryWorld.machines) {
        if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, m.x, m.y) < threshold) {
          entity = m; type = 'machine'; break;
        }
      }
    }
    if (!entity && this.factoryWorld.feeder &&
        Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, this.factoryWorld.feeder.x, this.factoryWorld.feeder.y) < threshold) {
      entity = this.factoryWorld.feeder; type = 'feeder';
    }
    if (!entity) return;

    this.buildingDragTarget = { entityId: entity.id, type };
    this.dragOffsetX = entity.x - pointer.worldX;
    this.dragOffsetY = entity.y - pointer.worldY;
  }

  private updateBuildingDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.buildingDragTarget) return;
    const entity = this.factoryWorld.getEntityById(this.buildingDragTarget.entityId);
    if (!entity) { this.buildingDragTarget = null; return; }
    entity.x = pointer.worldX + this.dragOffsetX;
    entity.y = pointer.worldY + this.dragOffsetY;

    // 拖拽中 → 同步移动图形
    const gfx = entity instanceof DragonFeederLogic
      ? this.feederGfx
      : (entity instanceof MachineLogic ? this.machineGfx.get(entity.id) : this.sourceGfx.get(entity.id));
    if (gfx) { gfx.setPosition(entity.x, entity.y); }

    const statusTxt = this.machineStatusTexts.get(entity.id);
    if (statusTxt instanceof Phaser.GameObjects.Text) {
      const h = entity instanceof MachineLogic ? 55 : 0;
      statusTxt.setPosition(entity.x, entity.y + h);
    }
  }

  private finishBuildingDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.buildingDragTarget) return;
    const entity = this.factoryWorld.getEntityById(this.buildingDragTarget.entityId);
    if (!entity) { this.buildingDragTarget = null; return; }

    // 网格吸附
    const cell = this.pointerToCell(pointer);
    if (!this.isCellOccupied(cell.col, cell.row)) {
      entity.x = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
      entity.y = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
      // 同步图形
      const gfx = entity instanceof DragonFeederLogic
        ? this.feederGfx
        : (entity instanceof MachineLogic ? this.machineGfx.get(entity.id) : this.sourceGfx.get(entity.id));
      if (gfx) { gfx.setPosition(entity.x, entity.y); }
      const statusTxt = this.machineStatusTexts.get(entity.id);
      if (statusTxt instanceof Phaser.GameObjects.Text) {
        statusTxt.setPosition(entity.x, entity.y + 55);
      }
    } else {
      // 被占用 → 回到原位（通过 occupiedCells 可判断原位置）
    }
    this.refreshOccupiedCells();
    this.rebuildAllBeltLines();
    this.buildingDragTarget = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // 建造模式
  // ═══════════════════════════════════════════════════════════════

  private createBuildToolbar(): void {
    if (this.buildToolbar) {
      this.buildToolbar.destroy();
      this.buildToolbar = null;
      this.uiElements = this.uiElements.filter(el => el.active !== false);
    }
    const container = this.trackUI(this.add.container(0, 0).setDepth(50));
    const startX = 40;
    const y = 708;
    const spacing = 108;

    BUILDABLES.forEach((def, i) => {
      const x = startX + i * spacing;
      const btn = this.trackUI(this.add.rectangle(x, y, 100, 36, 0x333333, 0.8)
        .setStrokeStyle(1, 0x666666).setInteractive({ useHandCursor: true }));
      const label = this.trackUI(this.add.text(x, y - 6, `${def.emoji} ${def.name}`, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5, 0.5));
      const costLabel = this.trackUI(this.add.text(x, y + 10, `💰${def.scaleCost}`, {
        fontSize: '9px', color: '#ffd700', fontFamily: 'Arial',
      }).setOrigin(0.5, 0.5));
      container.add([btn, label, costLabel]);
      btn.on('pointerdown', () => {
        this.selectedBuildType = def.type;
        container.each((c: Phaser.GameObjects.GameObject) => {
          if (c instanceof Phaser.GameObjects.Rectangle) c.setStrokeStyle(1, 0x666666);
        });
        btn.setStrokeStyle(2, 0x44ff44);
      });
    });
    this.buildToolbar = container;
    container.setVisible(this.mode === 'build');
  }

  private handleBuildClick(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedBuildType) {
      this.showFeedback('请先在底部工具栏选择建筑类型', '#ffaa44');
      return;
    }
    const cell = this.pointerToCell(pointer);
    if (this.isCellOccupied(cell.col, cell.row)) return;

    const def = BUILDABLES.find(d => d.type === this.selectedBuildType);
    if (!def) return;
    if (this.dragonState.dragonScales < def.scaleCost) {
      this.showFeedback(`💰 龙鳞不足！需要 ${def.scaleCost}`, '#ff4444');
      return;
    }

    const px = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    const py = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;

    if (def.category === 'source' && def.itemType) {
      const interval = (SOURCE_INTERVALS as Record<string, number>)[def.sourceIntervalKey ?? ''] ?? 15;
      const src = this.factoryWorld.addSource(def.itemType, interval);
      src.x = px; src.y = py;
      this.createSourceGraphic(src);
    } else if (def.category === 'machine' && def.recipeId) {
      const recipe = RECIPES.find(r => r.id === def.recipeId);
      if (!recipe) return;
      const m = this.factoryWorld.addMachine(recipe);
      m.x = px; m.y = py;
      this.createMachineGraphic(m);
    } else if (def.category === 'feeder') {
      if (this.factoryWorld.feeder) {
        // 先拆旧喂食仓
        this.removeFeederGraphic();
        this.factoryWorld.removeFeeder();
      }
      const f = this.factoryWorld.addFeeder();
      f.x = px; f.y = py;
      this.createFeederGraphic(f);
    }

    this.dragonState.dragonScales -= def.scaleCost;
    this.refreshOccupiedCells();
    this.showFeedback(`✅ 放置 ${def.name} (💰-${def.scaleCost})`, '#88ff88');
  }

  private handleDemolishClick(pointer: Phaser.Input.Pointer): void {
    const cell = this.pointerToCell(pointer);
    const cx = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    const cy = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    const threshold = GRID_CELL_SIZE;

    // 查找点击位置附近的实体
    for (const src of this.factoryWorld.sources) {
      if (Math.abs(src.x - cx) < threshold && Math.abs(src.y - cy) < threshold) {
        const cost = BUILDABLES.find(d => d.itemType === src.itemType && d.category === 'source')?.scaleCost ?? 2;
        const refund = Math.floor(cost * DEMOLISH_REFUND);
        this.factoryWorld.removeSource(src.id);
        this.removeSourceGraphic(src.id);
        this.dragonState.dragonScales += refund;
        this.refreshOccupiedCells();
        this.rebuildAllBeltLines();
        this.showFeedback(`🗑 拆除 采集器 +💰${refund}`, '#ffaa44');
        return;
      }
    }
    for (const m of this.factoryWorld.machines) {
      if (Math.abs(m.x - cx) < threshold && Math.abs(m.y - cy) < threshold) {
        const cost = BUILDABLES.find(d => d.recipeId === m.recipe?.id)?.scaleCost ?? 5;
        const refund = Math.floor(cost * DEMOLISH_REFUND);
        this.factoryWorld.removeMachine(m.id);
        this.removeMachineGraphic(m.id);
        this.dragonState.dragonScales += refund;
        this.refreshOccupiedCells();
        this.rebuildAllBeltLines();
        this.showFeedback(`🗑 拆除 机器 +💰${refund}`, '#ffaa44');
        return;
      }
    }
    if (this.factoryWorld.feeder && Math.abs(this.factoryWorld.feeder.x - cx) < threshold && Math.abs(this.factoryWorld.feeder.y - cy) < threshold) {
      const cost = BUILDABLES.find(d => d.type === 'feeder')?.scaleCost ?? 4;
      const refund = Math.floor(cost * DEMOLISH_REFUND);
      this.factoryWorld.removeFeeder();
      this.removeFeederGraphic();
      this.dragonState.dragonScales += refund;
      this.refreshOccupiedCells();
      this.rebuildAllBeltLines();
      this.showFeedback(`🗑 拆除 喂食仓 +💰${refund}`, '#ffaa44');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 传送带编辑
  // ═══════════════════════════════════════════════════════════════

  private handleBeltEditClick(pointer: Phaser.Input.Pointer): void {
    const port = this.getClickedPort(pointer);
    if (!port) { this.wireStart = null; return; }

    if (!this.wireStart) {
      // 必须从输出端口开始
      if (port.isInput) return;
      this.wireStart = { entityId: port.entity.id, port: port.port, x: port.x, y: port.y };
    } else {
      // 必须连接到输入端口
      if (!port.isInput) return;
      if (port.entity.id === this.wireStart.entityId) { this.wireStart = null; return; }

      const srcEntity = this.factoryWorld.getEntityById(this.wireStart.entityId);
      const dstEntity = port.entity;
      if (!srcEntity) { this.wireStart = null; return; }

      // 类型校验
      if (!(srcEntity instanceof SourceLogic || srcEntity instanceof MachineLogic)) {
        this.wireStart = null; return;
      }
      if (!(dstEntity instanceof MachineLogic || dstEntity instanceof DragonFeederLogic)) {
        this.wireStart = null; return;
      }

      // 环检测
      if (this.factoryWorld.wouldCreateCycle(srcEntity.id, dstEntity.id)) {
        this.showFeedback('❌ 不能创建循环传送带！', '#ff4444');
        this.wireStart = null;
        return;
      }

      // 检查是否已存在相同连接
      const exists = this.factoryWorld.belts.some(
        b => b.sourceObj.id === srcEntity.id && b.sourcePort === this.wireStart!.port
          && b.destObj.id === dstEntity.id && b.destPort === port.port
      );
      if (exists) {
        this.showFeedback('⚠ 该连接已存在', '#ffaa44');
        this.wireStart = null;
        return;
      }

      this.factoryWorld.addBelt(srcEntity, this.wireStart.port, dstEntity, port.port, BELT_LENGTHS.default);
      this.rebuildAllBeltLines();
      this.showFeedback('✅ 传送带连接成功', '#88ff88');
      this.wireStart = null;
    }
  }

  private handleBeltRemoveClick(pointer: Phaser.Input.Pointer): void {
    // 查找点击点最近的传送带线
    const threshold = 12;
    for (const belt of this.factoryWorld.belts) {
      const d = this.pointToSegmentDist(
        pointer.worldX, pointer.worldY,
        belt.sourceObj.x, belt.sourceObj.y,
        belt.destObj.x, belt.destObj.y,
      );
      if (d < threshold) {
        this.factoryWorld.removeBelt(belt.id);
        this.rebuildAllBeltLines();
        this.showFeedback('🗑 传送带已删除', '#ffaa44');
        return;
      }
    }
  }

  private pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Phaser.Math.Distance.Between(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Phaser.Math.Distance.Between(px, py, ax + t * dx, ay + t * dy);
  }

  // ═══════════════════════════════════════════════════════════════
  // 图形增删辅助
  // ═══════════════════════════════════════════════════════════════

  private removeSourceGraphic(id: string): void {
    const gfx = this.sourceGfx.get(id);
    if (gfx) { gfx.destroy(); this.sourceGfx.delete(id); }
  }

  private removeMachineGraphic(id: string): void {
    const gfx = this.machineGfx.get(id);
    if (gfx) { gfx.destroy(); this.machineGfx.delete(id); }
    const txt = this.machineStatusTexts.get(id);
    if (txt) { txt.destroy(); this.machineStatusTexts.delete(id); }
  }

  private removeFeederGraphic(): void {
    if (this.feederGfx) { this.feederGfx.destroy(); this.feederGfx = null; }
  }

  // ═══════════════════════════════════════════════════════════════
  // 工具函数
  // ═══════════════════════════════════════════════════════════════

  private pointerToCell(pointer: Phaser.Input.Pointer): { col: number; row: number } {
    const col = Math.floor((pointer.worldX - GRID_OFFSET_X) / GRID_CELL_SIZE);
    const row = Math.floor((pointer.worldY - GRID_OFFSET_Y) / GRID_CELL_SIZE);
    return { col, row };
  }

  private posToCell(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor((x - GRID_OFFSET_X) / GRID_CELL_SIZE),
      row: Math.floor((y - GRID_OFFSET_Y) / GRID_CELL_SIZE),
    };
  }

  private isCellOccupied(col: number, row: number): boolean {
    return this.occupiedCells.has(`${col},${row}`);
  }

  private refreshOccupiedCells(): void {
    this.occupiedCells.clear();
    for (const src of this.factoryWorld.sources) {
      const c = this.posToCell(src.x, src.y);
      this.occupiedCells.add(`${c.col},${c.row}`);
    }
    for (const m of this.factoryWorld.machines) {
      const c = this.posToCell(m.x, m.y);
      this.occupiedCells.add(`${c.col},${c.row}`);
    }
    if (this.factoryWorld.feeder) {
      const c = this.posToCell(this.factoryWorld.feeder.x, this.factoryWorld.feeder.y);
      this.occupiedCells.add(`${c.col},${c.row}`);
    }
  }
}
