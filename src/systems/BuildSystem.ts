import Phaser from 'phaser';
import type { FactoryWorld, SourceLogic, MachineLogic, DragonFeederLogic } from '../core/factory/FactoryWorld';
import type { FactoryRenderer } from './FactoryRenderer';
import type { DragonState } from '../core/dragon/DragonState';
import type { BuildableType } from '../data/BuildableDef';
import { BUILDABLES } from '../data/BuildableDef';
import {
  GRID_CELL_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y,
  DEMOLISH_REFUND, SOURCE_INTERVALS,
} from '../data/GameConfig';
import { RECIPES } from '../core/factory/Recipe';

/**
 * BuildSystem — 建造系统
 *
 * 从 FactoryScene 提取，负责：
 * - 网格坐标计算和占用追踪
 * - 建筑放置/拆除
 * - 建筑拖拽
 * - 建造工具栏
 */
export class BuildSystem {
  /** 网格占用追踪 */
  readonly occupiedCells: Set<string> = new Set();

  /** 当前选中的建筑类型 */
  selectedBuildType: BuildableType | null = null;

  /** 建造工具栏容器 */
  buildToolbar: Phaser.GameObjects.Container | null = null;

  /** 拖拽目标 ID */
  buildingDragTarget: string | null = null;

  // 回调
  onShowFeedback: ((text: string, color: string) => void) | null = null;
  onCellsOrBeltsChanged: (() => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private fw: FactoryWorld,
    private dragonState: DragonState,
    private renderer: FactoryRenderer,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 网格工具
  // ═══════════════════════════════════════════════════════════════

  pointerToCell(pointer: Phaser.Input.Pointer): { col: number; row: number } {
    return this.posToCell(pointer.worldX, pointer.worldY);
  }

  posToCell(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor((x - GRID_OFFSET_X) / GRID_CELL_SIZE),
      row: Math.floor((y - GRID_OFFSET_Y) / GRID_CELL_SIZE),
    };
  }

  isOccupied(col: number, row: number): boolean {
    return this.occupiedCells.has(`${col},${row}`);
  }

  refreshOccupiedCells(): void {
    this.occupiedCells.clear();
    for (const s of this.fw.sources) this.markArea(s.x - 30, s.y - 30, 60, 60);
    for (const m of this.fw.machines) this.markArea(m.x - 45, m.y - 55, 90, 110);
    if (this.fw.feeder) this.markArea(this.fw.feeder.x - 36, this.fw.feeder.y - 36, 72, 72);
  }

  refreshOccupiedCellsExcept(excludeId: string): void {
    this.occupiedCells.clear();
    for (const s of this.fw.sources) {
      if (s.id !== excludeId) this.markArea(s.x - 30, s.y - 30, 60, 60);
    }
    for (const m of this.fw.machines) {
      if (m.id !== excludeId) this.markArea(m.x - 45, m.y - 55, 90, 110);
    }
    if (this.fw.feeder && this.fw.feeder.id !== excludeId) {
      this.markArea(this.fw.feeder.x - 36, this.fw.feeder.y - 36, 72, 72);
    }
  }

  markArea(cx: number, cy: number, w: number, h: number): void {
    const startCol = Math.floor((cx - GRID_OFFSET_X) / GRID_CELL_SIZE);
    const startRow = Math.floor((cy - GRID_OFFSET_Y) / GRID_CELL_SIZE);
    const endCol = Math.floor((cx + w - GRID_OFFSET_X) / GRID_CELL_SIZE);
    const endRow = Math.floor((cy + h - GRID_OFFSET_Y) / GRID_CELL_SIZE);
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        this.occupiedCells.add(`${col},${row}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 建造工具栏
  // ═══════════════════════════════════════════════════════════════

  createBuildToolbar(): Phaser.GameObjects.Container {
    const toolbar = this.scene.add.container(0, 0).setDepth(30);
    BUILDABLES.forEach((def, i) => {
      const x = 512 - ((BUILDABLES.length - 1) * 45) + i * 90;
      const y = 740;
      const btn = this.scene.add.rectangle(0, 0, 80, 30, 0x334455, 0.9)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add.text(0, 0, `${def.emoji} ${def.name}`, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5);
      const container = this.scene.add.container(x, y, [btn, label]);
      toolbar.add(container);

      btn.on('pointerdown', () => {
        this.selectedBuildType = def.type;
        toolbar.getAll().forEach(c => {
          const childBtn = (c as Phaser.GameObjects.Container).getAt(0) as Phaser.GameObjects.Rectangle;
          childBtn.setFillStyle(0x334455, 0.9);
          childBtn.setStrokeStyle(0, 0, 0);
        });
        btn.setStrokeStyle(2, 0x44ff44, 0.9);
      });
    });
    return toolbar;
  }

  // ═══════════════════════════════════════════════════════════════
  // 建造
  // ═══════════════════════════════════════════════════════════════

  handleBuildClick(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedBuildType) return;

    const cell = this.pointerToCell(pointer);
    if (this.isOccupied(cell.col, cell.row)) return;

    const def = BUILDABLES.find(d => d.type === this.selectedBuildType);
    if (!def) return;

    if (this.dragonState.dragonScales < def.scaleCost) {
      this.onShowFeedback?.('龙鳞不足!', '#ff4444');
      return;
    }

    const cx = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    const cy = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;

    if (def.category === 'source') {
      const src = this.fw.addSource(def.itemType!, SOURCE_INTERVALS[def.sourceIntervalKey!] ?? 12);
      src.x = cx; src.y = cy;
      this.renderer.createSourceGraphic(src);
      this.onShowFeedback?.(`+${def.name}`, '#44ff44');
    } else if (def.category === 'machine') {
      const recipe = def.recipeId ? RECIPES.find(r => r.id === def.recipeId) : undefined;
      const m = this.fw.addMachine(recipe);
      m.x = cx; m.y = cy;
      this.renderer.createMachineGraphic(m);
      this.onShowFeedback?.(`+${def.name}`, '#44ff44');
    } else if (def.category === 'feeder') {
      if (this.fw.feeder) {
        this.renderer.removeFeederGraphic();
        this.fw.removeFeeder();
      }
      const f = this.fw.addFeeder();
      f.x = cx; f.y = cy;
      this.renderer.createFeederGraphic(f);
      this.onShowFeedback?.('+喂食仓', '#44ff44');
    }

    this.dragonState.dragonScales -= def.scaleCost;
    this.refreshOccupiedCells();
  }

  // ═══════════════════════════════════════════════════════════════
  // 拆除
  // ═══════════════════════════════════════════════════════════════

  handleDemolishClick(pointer: Phaser.Input.Pointer): void {
    const cell = this.pointerToCell(pointer);
    const cx = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    const cy = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    const threshold = GRID_CELL_SIZE;

    for (const s of this.fw.sources) {
      if (Phaser.Math.Distance.Between(cx, cy, s.x, s.y) < threshold) {
        const cost = BUILDABLES.find(d => d.category === 'source')?.scaleCost ?? 2;
        const refund = Math.floor(cost * DEMOLISH_REFUND);
        this.dragonState.dragonScales += refund;
        this.fw.removeSource(s.id);
        this.renderer.removeSourceGraphic(s.id);
        this.onShowFeedback?.(`拆除 +${refund}鳞`, '#ffaa44');
        this.refreshOccupiedCells();
        this.onCellsOrBeltsChanged?.();
        return;
      }
    }

    for (const m of this.fw.machines) {
      if (Phaser.Math.Distance.Between(cx, cy, m.x, m.y) < threshold) {
        const cost = BUILDABLES.find(d => d.category === 'machine')?.scaleCost ?? 3;
        const refund = Math.floor(cost * DEMOLISH_REFUND);
        this.dragonState.dragonScales += refund;
        this.fw.removeMachine(m.id);
        this.renderer.removeMachineGraphic(m.id);
        this.onShowFeedback?.(`拆除 +${refund}鳞`, '#ffaa44');
        this.refreshOccupiedCells();
        this.onCellsOrBeltsChanged?.();
        return;
      }
    }

    if (this.fw.feeder && Phaser.Math.Distance.Between(cx, cy, this.fw.feeder.x, this.fw.feeder.y) < threshold) {
      const cost = BUILDABLES.find(d => d.category === 'feeder')?.scaleCost ?? 5;
      const refund = Math.floor(cost * DEMOLISH_REFUND);
      this.dragonState.dragonScales += refund;
      this.fw.removeFeeder();
      this.renderer.removeFeederGraphic();
      this.onShowFeedback?.(`拆除 +${refund}鳞`, '#ffaa44');
      this.refreshOccupiedCells();
      this.onCellsOrBeltsChanged?.();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 建筑拖拽
  // ═══════════════════════════════════════════════════════════════

  tryStartBuildingDrag(pointer: Phaser.Input.Pointer): boolean {
    const threshold = 40;
    const all: (SourceLogic | MachineLogic | DragonFeederLogic)[] = [
      ...this.fw.sources,
      ...this.fw.machines,
    ];
    if (this.fw.feeder) all.push(this.fw.feeder);

    let closestId: string | null = null;
    let minDist = threshold;

    for (const entity of all) {
      const dist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, entity.x, entity.y);
      if (dist < minDist) { minDist = dist; closestId = entity.id; }
    }

    if (!closestId) return false;
    this.buildingDragTarget = closestId;
    this.refreshOccupiedCellsExcept(closestId);
    return true;
  }

  updateBuildingDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.buildingDragTarget) return;
    const entity = this.fw.getEntityById(this.buildingDragTarget);
    if (!entity) return;

    const cell = this.pointerToCell(pointer);
    entity.x = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    entity.y = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;

    // 同步图形位置
    this.renderer.syncEntityPosition(entity);
  }

  finishBuildingDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.buildingDragTarget) return;
    const entity = this.fw.getEntityById(this.buildingDragTarget);
    this.buildingDragTarget = null;
    if (!entity) return;

    const cell = this.pointerToCell(pointer);
    entity.x = GRID_OFFSET_X + cell.col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    entity.y = GRID_OFFSET_Y + cell.row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    this.refreshOccupiedCells();
    this.onCellsOrBeltsChanged?.();
  }
}
