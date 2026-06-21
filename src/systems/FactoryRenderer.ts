import Phaser from 'phaser';
import type { GameClock } from '../utils/GameClock';
import {
  FactoryWorld, SourceLogic, MachineLogic, DragonFeederLogic,
} from '../core/factory/FactoryWorld';
import { ITEM_COLORS, ITEM_NAMES } from '../core/factory/Item';
import { MachineStatus } from '../core/factory/MachineStatus';
import {
  GRID_CELL_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_COLS, GRID_ROWS,
  BELT_CAPACITY_PER_TILE,
} from '../data/GameConfig';

/**
 * FactoryRenderer — 工厂渲染层
 *
 * 从 FactoryScene 提取，负责所有与 Phaser Graphics 相关的渲染：
 * - 静态建筑图形创建/销毁
 * - 动态覆盖层渲染（进度条、端口灯）
 * - 传送带物品渲染
 * - 建造/传送带编辑模式覆盖层渲染
 */

interface BeltEndpoints { fromX: number; fromY: number; toX: number; toY: number; }

/** 计算实体端口在屏幕上的坐标 */
export function getPortPos(
  entity: SourceLogic | MachineLogic | DragonFeederLogic,
  port: number, isInput: boolean,
): { x: number; y: number } {
  let w: number;
  if (entity instanceof MachineLogic) w = 90;
  else if (entity instanceof DragonFeederLogic) w = 72;
  else w = 60;
  const dir = isInput ? -1 : 1;
  const spacing = entity instanceof DragonFeederLogic ? 18 : 30;
  const baseOffset = entity instanceof DragonFeederLogic ? 18 : 30;
  const baseY = entity.y - baseOffset + port * spacing;
  return { x: entity.x + dir * (w / 2 + 10), y: baseY };
}

/** 从 FactoryWorld 导出传送带端点列表 */
export function buildBeltEndpoints(fw: FactoryWorld): BeltEndpoints[] {
  return fw.belts.map(belt => {
    const fromPos = getPortPos(belt.sourceObj, belt.sourcePort, false);
    const toPos = getPortPos(belt.destObj, belt.destPort, true);
    return { fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y };
  });
}

export class FactoryRenderer {
  // 静态图形
  beltStaticGfx: Phaser.GameObjects.Graphics;
  // 动态图形
  dynGfx: Phaser.GameObjects.Graphics;
  beltItemGfx: Phaser.GameObjects.Graphics;
  // 模式覆盖层
  gridGfx: Phaser.GameObjects.Graphics;
  ghostGfx: Phaser.GameObjects.Graphics;
  wireGfx: Phaser.GameObjects.Graphics;

  // 实体图形映射
  sourceGfx: Map<string, Phaser.GameObjects.Container> = new Map();
  machineGfx: Map<string, Phaser.GameObjects.Container> = new Map();
  machineStatusTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  feederGfx: Phaser.GameObjects.Container | null = null;

  // 传送带端点缓存
  cachedEndpoints: BeltEndpoints[] = [];

  // 当前选中的机器 ID（供渲染层高亮）
  selectedMachineId: string | null = null;

  constructor(
    private scene: Phaser.Scene,
    private worldLayer: Phaser.GameObjects.Container,
  ) {
    this.beltStaticGfx = scene.add.graphics();
    this.worldLayer.add(this.beltStaticGfx);
    this.beltStaticGfx.setDepth(1);

    this.dynGfx = scene.add.graphics();
    this.worldLayer.add(this.dynGfx);
    this.dynGfx.setDepth(10);

    this.beltItemGfx = scene.add.graphics();
    this.worldLayer.add(this.beltItemGfx);
    this.beltItemGfx.setDepth(5);

    this.gridGfx = scene.add.graphics();
    this.worldLayer.add(this.gridGfx);
    this.gridGfx.setDepth(0);
    this.gridGfx.setVisible(false);

    this.ghostGfx = scene.add.graphics();
    this.worldLayer.add(this.ghostGfx);
    this.ghostGfx.setDepth(2);
    this.ghostGfx.setVisible(false);

    this.wireGfx = scene.add.graphics();
    this.worldLayer.add(this.wireGfx);
    this.wireGfx.setDepth(15);
    this.wireGfx.setVisible(false);
  }

  // ═══════════════════════════════════════════════════════════════
  // 静态建筑创建
  // ═══════════════════════════════════════════════════════════════

  createStaticBuildings(fw: FactoryWorld): void {
    this.drawAllBeltLines();

    for (const src of fw.sources) {
      this.createSourceGraphic(src);
    }
    for (const m of fw.machines) {
      this.createMachineGraphic(m);
    }
    if (fw.feeder) {
      this.createFeederGraphic(fw.feeder);
    }
  }

  drawAllBeltLines(fw?: FactoryWorld): void {
    this.beltStaticGfx.clear();
    for (let i = 0; i < this.cachedEndpoints.length; i++) {
      const ep = this.cachedEndpoints[i];
      // 拥堵着色：需要 FactoryWorld 引用
      let color = 0x555555;
      let alpha = 0.45;
      if (fw && i < fw.belts.length) {
        const belt = fw.belts[i];
        const fullness = belt.getQueueLength() / (belt.length * BELT_CAPACITY_PER_TILE);
        if (fullness > 0.8) { color = 0xff4444; alpha = 0.7; }
        else if (fullness > 0.5) { color = 0xffcc44; alpha = 0.6; }
        else if (fullness > 0) { color = 0x44cc44; alpha = 0.5; }
      }
      this.beltStaticGfx.lineStyle(3, color, alpha);
      this.beltStaticGfx.beginPath();
      this.beltStaticGfx.moveTo(ep.fromX, ep.fromY);
      this.beltStaticGfx.lineTo(ep.toX, ep.toY);
      this.beltStaticGfx.strokePath();
    }
  }

  createSourceGraphic(src: SourceLogic): void {
    const w = 60, h = 60;
    const gfx = this.scene.add.container(src.x, src.y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x445566, 0.9);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, 0x667788, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    gfx.add(bg);

    const itemColor = ITEM_COLORS[src.itemType];
    const itemRect = this.scene.add.graphics();
    itemRect.fillStyle(itemColor, 0.9);
    itemRect.fillRect(-10, -18, 20, 16);
    gfx.add(itemRect);

    const nameText = this.scene.add.text(0, 16, ITEM_NAMES[src.itemType], {
      fontSize: '11px', color: '#aabbcc', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);
    gfx.add(nameText);

    gfx.setDepth(3);
    this.worldLayer.add(gfx);
    this.sourceGfx.set(src.id, gfx);
  }

  createMachineGraphic(m: MachineLogic): void {
    const w = 90, h = 110;
    const gfx = this.scene.add.container(m.x, m.y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x334455, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0x557799, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    gfx.add(bg);

    const recipeName = m.recipe?.name ?? '无配方';
    const recipeText = this.scene.add.text(0, -30, recipeName, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5);
    gfx.add(recipeText);

    const ingredientText = this.scene.add.text(0, -10,
      m.recipe
        ? m.recipe.inputs.map(i => `${ITEM_NAMES[i.type]}×${i.count}`).join(' + ')
        : '—',
      { fontSize: '10px', color: '#889999', fontFamily: 'Arial' },
    ).setOrigin(0.5, 0.5);
    gfx.add(ingredientText);

    const outputText = this.scene.add.text(0, 8,
      m.recipe
        ? `→ ${m.recipe.outputs.map(o => `${ITEM_NAMES[o.type]}×${o.count}`).join(' + ')}`
        : '→ —',
      { fontSize: '10px', color: '#aabb44', fontFamily: 'Arial' },
    ).setOrigin(0.5, 0.5);
    gfx.add(outputText);

    const durationText = this.scene.add.text(0, 28,
      m.recipe ? `${m.recipe.duration / 10}s` : '',
      { fontSize: '10px', color: '#667777', fontFamily: 'Arial' },
    ).setOrigin(0.5, 0.5);
    gfx.add(durationText);

    gfx.setDepth(3);
    this.worldLayer.add(gfx);
    this.machineGfx.set(m.id, gfx);

    // 状态文字（独立，放在机器下方）
    const statusText = this.scene.add.text(m.x, m.y + h / 2 + 8, '', {
      fontSize: '10px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);
    statusText.setDepth(4);
    this.worldLayer.add(statusText);
    this.machineStatusTexts.set(m.id, statusText);
  }

  createFeederGraphic(f: DragonFeederLogic): void {
    const w = 72, h = 72;
    const gfx = this.scene.add.container(f.x, f.y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x443355, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, 0x9977aa, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    gfx.add(bg);

    const label = this.scene.add.text(0, 0, '🐉 喂食仓', {
      fontSize: '12px', color: '#ddaacc', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5);
    gfx.add(label);

    gfx.setDepth(3);
    this.worldLayer.add(gfx);
    this.feederGfx = gfx;
  }

  /** 更新机器图形文本（配方切换后调用） */
  updateMachineGraphic(m: MachineLogic): void {
    const gfx = this.machineGfx.get(m.id);
    if (!gfx) return;

    // 销毁旧文本子元素（保留背景矩形 graphics 和 gfx container 本身）
    const toRemove: Phaser.GameObjects.GameObject[] = [];
    gfx.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Text) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(c => c.destroy());

    // 重新创建文本
    const recipeName = m.recipe?.name ?? '无配方';
    const recipeText = this.scene.add.text(0, -30, recipeName, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0.5);
    gfx.add(recipeText);

    const ingredientText = this.scene.add.text(0, -10,
      m.recipe
        ? m.recipe.inputs.map(i => `${ITEM_NAMES[i.type]}×${i.count}`).join(' + ')
        : '—',
      { fontSize: '10px', color: '#889999', fontFamily: 'Arial' },
    ).setOrigin(0.5, 0.5);
    gfx.add(ingredientText);

    const outputText = this.scene.add.text(0, 8,
      m.recipe
        ? `→ ${m.recipe.outputs.map(o => `${ITEM_NAMES[o.type]}×${o.count}`).join(' + ')}`
        : '→ —',
      { fontSize: '10px', color: '#aabb44', fontFamily: 'Arial' },
    ).setOrigin(0.5, 0.5);
    gfx.add(outputText);

    const durationText = this.scene.add.text(0, 28,
      m.recipe ? `${m.recipe.duration / 10}s` : '',
      { fontSize: '10px', color: '#667777', fontFamily: 'Arial' },
    ).setOrigin(0.5, 0.5);
    gfx.add(durationText);
  }

  rebuildAllBeltLines(fw: FactoryWorld): void {
    this.cachedEndpoints = buildBeltEndpoints(fw);
    this.drawAllBeltLines();
  }

  // ═══════════════════════════════════════════════════════════════
  // 图形清理
  // ═══════════════════════════════════════════════════════════════

  removeSourceGraphic(id: string): void {
    const gfx = this.sourceGfx.get(id);
    if (gfx) { gfx.destroy(); this.sourceGfx.delete(id); }
  }

  removeMachineGraphic(id: string): void {
    const gfx = this.machineGfx.get(id);
    if (gfx) { gfx.destroy(); this.machineGfx.delete(id); }
    const text = this.machineStatusTexts.get(id);
    if (text) { text.destroy(); this.machineStatusTexts.delete(id); }
  }

  removeFeederGraphic(): void {
    if (this.feederGfx) { this.feederGfx.destroy(); this.feederGfx = null; }
  }

  /** 同步实体图形位置（拖拽时调用） */
  syncEntityPosition(entity: SourceLogic | MachineLogic | DragonFeederLogic): void {
    const srcGfx = this.sourceGfx.get(entity.id);
    const machGfx = this.machineGfx.get(entity.id);
    const statusText = this.machineStatusTexts.get(entity.id);
    if (srcGfx) { srcGfx.x = entity.x; srcGfx.y = entity.y; }
    if (machGfx) { machGfx.x = entity.x; machGfx.y = entity.y; }
    if (statusText) { statusText.x = entity.x; statusText.y = entity.y + 63; }
    if (this.feederGfx && entity instanceof DragonFeederLogic) {
      this.feederGfx.x = entity.x;
      this.feederGfx.y = entity.y;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 动态渲染（每帧 60fps）
  // ═══════════════════════════════════════════════════════════════

  renderDynamicLayer(fw: FactoryWorld, gameClock: GameClock): void {
    this.dynGfx.clear();
    this.beltItemGfx.clear();

    // 传送带拥堵着色（每帧更新）
    this.drawAllBeltLines(fw);

    for (const m of fw.machines) {
      this.renderMachineDynamic(m, gameClock, fw.boostMultiplier);
    }
    if (fw.feeder) {
      this.renderFeederPorts(fw.feeder);
    }
    this.renderBeltItems(fw, gameClock);
  }

  renderMachineDynamic(m: MachineLogic, gameClock: GameClock, boostMult: number): void {
    const cx = m.x, cy = m.y;
    const w = 90, h = 110;
    const subTick = gameClock.getSubTickFraction();

    // 状态边框
    if (m.status === MachineStatus.InputBlocked) {
      this.dynGfx.lineStyle(2, 0xff4444, 0.9);
      this.dynGfx.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    } else if (m.status === MachineStatus.OutputBlocked) {
      this.dynGfx.lineStyle(2, 0xff8844, 0.9);
      this.dynGfx.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    }

    // 运行中覆盖
    if (m.status === MachineStatus.Running) {
      this.dynGfx.fillStyle(0x44ff44, 0.08);
      this.dynGfx.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    }

    // 选中机器高亮（金色边框）
    if (m.id === this.selectedMachineId) {
      this.dynGfx.lineStyle(2, 0xffcc44, 0.9);
      this.dynGfx.strokeRoundedRect(cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6, 10);
    }

    // 进度条
    const progress = m.getProgress(subTick, boostMult);
    if (progress > 0) {
      const barW = w - 16, barH = 4, barY = cy + h / 2 - 10;
      this.dynGfx.fillStyle(0x222222, 0.8);
      this.dynGfx.fillRect(cx - barW / 2, barY, barW, barH);
      this.dynGfx.fillStyle(0x44cc44, 1);
      this.dynGfx.fillRect(cx - barW / 2, barY, barW * progress, barH);
    }

    // 端口灯
    const portSize = 8;
    const maxPorts = Math.max(m.inputBuffers.length, m.outputBuffers.length);
    for (let port = 0; port < maxPorts; port++) {
      const py = cy - 30 + port * 30;
      // 输入
      if (port < m.inputBuffers.length) {
        this.dynGfx.fillStyle(m.getInputCount(port) > 0 ? 0x44aa44 : 0x444444, 0.8);
        this.dynGfx.fillRect(cx - w / 2 - portSize - 2, py - portSize / 2, portSize, portSize);
      }
      // 输出
      if (port < m.outputBuffers.length) {
        const blocked = m.blockedOutputPorts.has(port);
        this.dynGfx.fillStyle(blocked ? 0xff2222 : (m.getOutputCount(port) > 0 ? 0xcc8844 : 0x444444), 0.9);
        this.dynGfx.fillRect(cx + w / 2 + 2, py - portSize / 2, portSize, portSize);
        if (blocked) {
          this.dynGfx.lineStyle(1, 0xff4444, 0.8);
          this.dynGfx.strokeRect(cx + w / 2 + 2, py - portSize / 2, portSize, portSize);
        }
      }
    }
  }

  renderFeederPorts(feeder: DragonFeederLogic): void {
    const cx = feeder.x, cy = feeder.y;
    const w = 72;
    const portCount = Math.max(3, feeder.getConnectedPortCount());
    for (let port = 0; port < portCount; port++) {
      const py = cy - 18 + port * 18;
      this.dynGfx.fillStyle(0x44aa44, 0.6);
      this.dynGfx.fillRect(cx - w / 2 - 8, py - 3, 6, 6);
    }
  }

  renderBeltItems(fw: FactoryWorld, gameClock: GameClock): void {
    const subTick = gameClock.getSubTickFraction();
    for (let beltIdx = 0; beltIdx < fw.belts.length; beltIdx++) {
      if (beltIdx >= this.cachedEndpoints.length) continue;
      const belt = fw.belts[beltIdx];
      const endpoints = this.cachedEndpoints[beltIdx];
      const items = belt.getItems(subTick);
      for (const item of items) {
        const x = endpoints.fromX + (endpoints.toX - endpoints.fromX) * item.progress;
        const y = endpoints.fromY + (endpoints.toY - endpoints.fromY) * item.progress;
        const color = ITEM_COLORS[item.type];
        this.beltItemGfx.fillStyle(color, 0.9);
        this.beltItemGfx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 模式覆盖层渲染
  // ═══════════════════════════════════════════════════════════════

  renderModeOverlay(
    mode: 'normal' | 'build' | 'belt_edit',
    camera: Phaser.Cameras.Scene2D.Camera,
    pointer: Phaser.Input.Pointer,
    occupiedCells: Set<string>,
    selectedBuildType: BuildableType | null,
    wireStart: { entityId: string; port: number; x: number; y: number } | null,
    getClickedPortFn: (pointer: Phaser.Input.Pointer) => { entity: SourceLogic | MachineLogic | DragonFeederLogic; port: number; isInput: boolean; x: number; y: number } | null,
    fw: FactoryWorld,
  ): void {
    if (mode === 'build') {
      this.gridGfx.setVisible(true);
      this.ghostGfx.setVisible(true);
      this.renderBuildGrid(camera, occupiedCells);
      this.renderGhostPreview(pointer, selectedBuildType, occupiedCells);
    } else {
      this.gridGfx.setVisible(false);
      this.ghostGfx.setVisible(false);
    }

    if (mode === 'belt_edit') {
      this.wireGfx.setVisible(true);
      this.renderPortHighlights(fw);
      this.renderWirePreview(pointer, wireStart, getClickedPortFn);
    } else {
      this.wireGfx.setVisible(false);
    }
  }

  renderBuildGrid(camera: Phaser.Cameras.Scene2D.Camera, occupiedCells: Set<string>): void {
    this.gridGfx.clear();
    const cellSize = GRID_CELL_SIZE;
    const offsetX = GRID_OFFSET_X;
    const offsetY = GRID_OFFSET_Y;

    // 视口裁剪
    const camBounds = camera.worldView;
    const startCol = Math.max(0, Math.floor((camBounds.x - offsetX) / cellSize));
    const endCol = Math.min(GRID_COLS - 1, Math.floor((camBounds.x + camBounds.width - offsetX) / cellSize));
    const startRow = Math.max(0, Math.floor((camBounds.y - offsetY) / cellSize));
    const endRow = Math.min(GRID_ROWS - 1, Math.floor((camBounds.y + camBounds.height - offsetY) / cellSize));

    // 网格线
    this.gridGfx.lineStyle(1, 0x334455, 0.3);
    for (let col = startCol; col <= endCol + 1; col++) {
      const x = offsetX + col * cellSize;
      this.gridGfx.beginPath();
      this.gridGfx.moveTo(x, offsetY + startRow * cellSize);
      this.gridGfx.lineTo(x, offsetY + (endRow + 1) * cellSize);
      this.gridGfx.strokePath();
    }
    for (let row = startRow; row <= endRow + 1; row++) {
      const y = offsetY + row * cellSize;
      this.gridGfx.beginPath();
      this.gridGfx.moveTo(offsetX + startCol * cellSize, y);
      this.gridGfx.lineTo(offsetX + (endCol + 1) * cellSize, y);
      this.gridGfx.strokePath();
    }

    // 已占用格子
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        if (occupiedCells.has(`${col},${row}`)) {
          this.gridGfx.fillStyle(0xff4444, 0.15);
          this.gridGfx.fillRect(offsetX + col * cellSize + 1, offsetY + row * cellSize + 1, cellSize - 2, cellSize - 2);
        }
      }
    }
  }

  renderGhostPreview(
    pointer: Phaser.Input.Pointer,
    selectedBuildType: BuildableType | null,
    occupiedCells: Set<string>,
  ): void {
    this.ghostGfx.clear();
    if (!selectedBuildType) return;

    const cellSize = GRID_CELL_SIZE;
    const offsetX = GRID_OFFSET_X;
    const offsetY = GRID_OFFSET_Y;
    const col = Math.floor((pointer.worldX - offsetX) / cellSize);
    const row = Math.floor((pointer.worldY - offsetY) / cellSize);
    const cellKey = `${col},${row}`;

    if (!occupiedCells.has(cellKey)) {
      this.ghostGfx.fillStyle(0x44ff44, 0.2);
      this.ghostGfx.fillRect(offsetX + col * cellSize, offsetY + row * cellSize, cellSize, cellSize);
      this.ghostGfx.lineStyle(1, 0x44ff44, 0.5);
      this.ghostGfx.strokeRect(offsetX + col * cellSize, offsetY + row * cellSize, cellSize, cellSize);
    }
  }

  renderPortHighlights(fw: FactoryWorld): void {
    this.wireGfx.clear();
    const allEntities: (SourceLogic | MachineLogic | DragonFeederLogic)[] = [
      ...fw.sources,
      ...fw.machines,
    ];
    if (fw.feeder) allEntities.push(fw.feeder);

    for (const entity of allEntities) {
      const portCount = entity instanceof DragonFeederLogic
        ? Math.max(3, entity.getConnectedPortCount() + 1)
        : (entity instanceof SourceLogic ? 1 : entity.outputBuffers.length);
      // 输出端口（橙色圆点）
      if (!(entity instanceof DragonFeederLogic)) {
        for (let p = 0; p < portCount; p++) {
          const pos = getPortPos(entity, p, false);
          this.wireGfx.fillStyle(0xff8844, 0.7);
          this.wireGfx.fillCircle(pos.x, pos.y, 5);
        }
      }
      // 输入端口（绿色=空闲，红色=已占用）
      if (entity instanceof MachineLogic || entity instanceof DragonFeederLogic) {
        const inputCount = entity instanceof DragonFeederLogic
          ? Math.max(3, entity.getConnectedPortCount())
          : entity.inputBuffers.length;
        for (let p = 0; p < inputCount; p++) {
          const pos = getPortPos(entity, p, true);
          const isOccupied = fw.belts.some(b => b.destObj.id === entity.id && b.destPort === p);
          this.wireGfx.fillStyle(isOccupied ? 0xff2222 : 0x44ff44, 0.7);
          this.wireGfx.fillCircle(pos.x, pos.y, 5);
        }
      }
    }
  }

  renderWirePreview(
    pointer: Phaser.Input.Pointer,
    wireStart: { entityId: string; port: number; x: number; y: number } | null,
    getClickedPortFn: (pointer: Phaser.Input.Pointer) => { entity: SourceLogic | MachineLogic | DragonFeederLogic; port: number; isInput: boolean; x: number; y: number } | null,
  ): void {
    if (!wireStart) return;

    const target = getClickedPortFn(pointer);
    const endX = target ? target.x : pointer.worldX;
    const endY = target ? target.y : pointer.worldY;

    this.wireGfx.lineStyle(2, 0xffcc44, 0.8);
    this.wireGfx.beginPath();
    this.wireGfx.moveTo(wireStart.x, wireStart.y);
    this.wireGfx.lineTo(endX, endY);
    this.wireGfx.strokePath();
  }
}

// Re-export BuildableType for convenience
type BuildableType = import('../data/BuildableDef').BuildableType;
