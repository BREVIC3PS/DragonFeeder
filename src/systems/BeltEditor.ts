import Phaser from 'phaser';
import { SourceLogic, MachineLogic, DragonFeederLogic } from '../core/factory/FactoryWorld';
import type { FactoryWorld } from '../core/factory/FactoryWorld';
import type { FactoryRenderer } from './FactoryRenderer';
import { getPortPos } from './FactoryRenderer';
import { BELT_LENGTHS } from '../data/GameConfig';

/**
 * BeltEditor — 传送带编辑器
 *
 * 从 FactoryScene 提取，负责：
 * - 传送带连接/删除
 * - 端口点击检测
 * - 端口占用检查
 */
export class BeltEditor {
  /** 当前连线的起点 */
  wireStart: { entityId: string; port: number; x: number; y: number } | null = null;

  // 回调
  onShowFeedback: ((text: string, color: string) => void) | null = null;
  onBeltChanged: (() => void) | null = null;

  constructor(
    private fw: FactoryWorld,
    private renderer: FactoryRenderer,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 传送带连接
  // ═══════════════════════════════════════════════════════════════

  handleBeltEditClick(pointer: Phaser.Input.Pointer): void {
    const clicked = this.getClickedPort(pointer);
    if (!clicked) return;

    if (!this.wireStart) {
      if (clicked.isInput) return; // 第一击必须选输出端口
      this.wireStart = { entityId: clicked.entity.id, port: clicked.port, x: clicked.x, y: clicked.y };
    } else {
      if (!clicked.isInput) return;
      if (clicked.entity.id === this.wireStart.entityId) return;

      const src = this.fw.getEntityById(this.wireStart.entityId);
      const dest = clicked.entity;
      if (!src || !(dest instanceof MachineLogic || dest instanceof DragonFeederLogic)) return;
      if (!(src instanceof SourceLogic || src instanceof MachineLogic)) return;

      if (this.fw.wouldCreateCycle(src.id, dest.id)) {
        this.onShowFeedback?.('不能创建循环传送带!', '#ff4444');
        this.wireStart = null;
        return;
      }

      const exists = this.fw.belts.some(
        b => b.sourceObj.id === src.id && b.sourcePort === this.wireStart!.port
          && b.destObj.id === dest.id && b.destPort === clicked.port,
      );
      if (exists) {
        this.onShowFeedback?.('该传送带已存在', '#ff8844');
        this.wireStart = null;
        return;
      }

      this.fw.addBelt(src, this.wireStart.port, dest, clicked.port, BELT_LENGTHS.default);
      this.onBeltChanged?.();
      this.onShowFeedback?.('+传送带', '#44ff44');
      this.wireStart = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 传送带删除
  // ═══════════════════════════════════════════════════════════════

  handleBeltRemoveClick(pointer: Phaser.Input.Pointer): void {
    let closestIdx = -1;
    let minDist = 12;

    for (let i = 0; i < this.renderer.cachedEndpoints.length; i++) {
      const ep = this.renderer.cachedEndpoints[i];
      const d = this.pointToSegmentDist(pointer.worldX, pointer.worldY, ep.fromX, ep.fromY, ep.toX, ep.toY);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }

    if (closestIdx >= 0) {
      const belt = this.fw.belts[closestIdx];
      this.fw.removeBelt(belt.id);
      this.onBeltChanged?.();
      this.onShowFeedback?.('-传送带', '#ff8844');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 端口检测
  // ═══════════════════════════════════════════════════════════════

  getClickedPort(pointer: Phaser.Input.Pointer): {
    entity: SourceLogic | MachineLogic | DragonFeederLogic; port: number; isInput: boolean; x: number; y: number;
  } | null {
    const radius = 10;
    const allEntities: (SourceLogic | MachineLogic | DragonFeederLogic)[] = [
      ...this.fw.sources,
      ...this.fw.machines,
    ];
    if (this.fw.feeder) allEntities.push(this.fw.feeder);

    for (const entity of allEntities) {
      const portCount = entity instanceof DragonFeederLogic
        ? Math.max(3, entity.getConnectedPortCount())
        : (entity instanceof SourceLogic ? 1 : entity.outputBuffers.length);
      // 输出端口
      if (!(entity instanceof DragonFeederLogic)) {
        for (let p = 0; p < portCount; p++) {
          const pos = getPortPos(entity, p, false);
          if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, pos.x, pos.y) < radius) {
            return { entity, port: p, isInput: false, x: pos.x, y: pos.y };
          }
        }
      }
      // 输入端口
      if (entity instanceof MachineLogic || entity instanceof DragonFeederLogic) {
        const inputCount = entity instanceof DragonFeederLogic
          ? Math.max(3, entity.getConnectedPortCount())
          : entity.inputBuffers.length;
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

  isInputPortOccupied(entityId: string, port: number): boolean {
    return this.fw.belts.some(b => b.destObj.id === entityId && b.destPort === port);
  }

  // ═══════════════════════════════════════════════════════════════
  // 几何工具
  // ═══════════════════════════════════════════════════════════════

  pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Phaser.Math.Distance.Between(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Phaser.Math.Clamp(t, 0, 1);
    return Phaser.Math.Distance.Between(px, py, ax + t * dx, ay + t * dy);
  }
}
