import Phaser from 'phaser';
import { DragonState, MOOD_COLORS, type DragonMood } from '../../core/dragon/DragonState';
import { DragonAnimations } from './DragonAnimations';

/**
 * Dragon — 龙宝宝渲染实体
 *
 * 职责：视觉部件创建 + 颜色过渡 + 眼睛跟踪
 * 动画播放：委托给 DragonAnimations
 */

interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: number): RGB {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function rgbToHex(rgb: RGB): number {
  const r = Phaser.Math.Clamp(Math.round(rgb.r), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(rgb.g), 0, 255);
  const b = Phaser.Math.Clamp(Math.round(rgb.b), 0, 255);
  return (r << 16) | (g << 8) | b;
}

export class Dragon extends Phaser.GameObjects.Container {
  private dragonData: DragonState;

  // 可视化部件（public — DragonAnimations 需要访问）
  readonly bodyCircle: Phaser.GameObjects.Arc;
  readonly leftHorn: Phaser.GameObjects.Triangle;
  readonly rightHorn: Phaser.GameObjects.Triangle;
  readonly leftEye: Phaser.GameObjects.Arc;
  readonly rightEye: Phaser.GameObjects.Arc;
  readonly leftPupil: Phaser.GameObjects.Arc;
  readonly rightPupil: Phaser.GameObjects.Arc;
  readonly mouth: Phaser.GameObjects.Arc;

  // 动画管理器
  readonly anim: DragonAnimations;

  // 眼睛基准位置（相对于 Container）
  private leftEyeBaseX = -20;
  private leftEyeBaseY = -12;
  private rightEyeBaseX = 20;
  private rightEyeBaseY = -12;
  private pupilMaxOffset = 5;

  // 颜色过渡
  private rgbCurrent: RGB;
  private rgbTarget: RGB;
  private colorLerpSpeed: number = 0.08;

  // 当前心情（public — DragonAnimations 需要读取）
  currentMood: DragonMood;

  /** 外部可查询：龙是否正在繁忙（吃食/空闲行为中） */
  get busy(): boolean { return this.anim.busy; }

  constructor(scene: Phaser.Scene, x: number, y: number, state: DragonState) {
    super(scene, x, y);
    this.dragonData = state;

    this.currentMood = state.mood;
    const initialHex = MOOD_COLORS[this.currentMood];
    this.rgbCurrent = hexToRgb(initialHex);
    this.rgbTarget = hexToRgb(initialHex);

    // ── 身体 ──
    this.bodyCircle = scene.add.arc(0, 0, 55, 0, 360, false, initialHex, 1);
    this.add(this.bodyCircle);

    // ── 角 ──
    this.leftHorn = scene.add.triangle(0, 0, 0, 0, 16, 32, 32, 0, initialHex, 0.85);
    this.leftHorn.setPosition(-30, -58);
    this.add(this.leftHorn);

    this.rightHorn = scene.add.triangle(0, 0, 0, 0, 16, 32, 32, 0, initialHex, 0.85);
    this.rightHorn.setPosition(30, -58);
    this.rightHorn.scaleX = -1;
    this.add(this.rightHorn);

    // ── 眼睛 ──
    this.leftEye = scene.add.arc(this.leftEyeBaseX, this.leftEyeBaseY, 12, 0, 360, false, 0xffffff, 1);
    this.add(this.leftEye);
    this.rightEye = scene.add.arc(this.rightEyeBaseX, this.rightEyeBaseY, 12, 0, 360, false, 0xffffff, 1);
    this.add(this.rightEye);

    // ── 瞳孔 ──
    this.leftPupil = scene.add.arc(this.leftEyeBaseX, this.leftEyeBaseY, 5, 0, 360, false, 0x111111, 1);
    this.add(this.leftPupil);
    this.rightPupil = scene.add.arc(this.rightEyeBaseX, this.rightEyeBaseY, 5, 0, 360, false, 0x111111, 1);
    this.add(this.rightPupil);

    // ── 嘴巴 ──
    this.mouth = scene.add.arc(0, 15, 8, 0, 180, false, 0x333333, 1);
    this.add(this.mouth);

    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    // ── 动画管理器 ──
    this.anim = new DragonAnimations(this);
    this.anim.startBreathing();

    console.log(`[Dragon] 龙宝宝已创建 (${state.mood})`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 每帧调用
  // ═══════════════════════════════════════════════════════════════

  /** 每渲染帧调用（颜色过渡 + 眼睛跟踪 + 动画计时） */
  updateVisuals(dt: number): void {
    // 心情 → 颜色
    if (this.dragonData.mood !== this.currentMood) {
      this.currentMood = this.dragonData.mood;
      this.rgbTarget = hexToRgb(MOOD_COLORS[this.currentMood]);
    }
    this.rgbCurrent.r += (this.rgbTarget.r - this.rgbCurrent.r) * this.colorLerpSpeed;
    this.rgbCurrent.g += (this.rgbTarget.g - this.rgbCurrent.g) * this.colorLerpSpeed;
    this.rgbCurrent.b += (this.rgbTarget.b - this.rgbCurrent.b) * this.colorLerpSpeed;
    const currentHex = rgbToHex(this.rgbCurrent);
    this.bodyCircle.setFillStyle(currentHex);
    this.leftHorn.setFillStyle(currentHex, 0.85);
    this.rightHorn.setFillStyle(currentHex, 0.85);

    // 眼睛跟踪鼠标
    this.updateEyeTracking();

    // 动画计时（呼吸参数、跳跃、空闲行为）
    this.anim.updateTimers(dt, this.dragonData.hunger, this.dragonData.happiness);
  }

  // ═══════════════════════════════════════════════════════════════
  // 眼睛跟踪鼠标
  // ═══════════════════════════════════════════════════════════════

  private updateEyeTracking(): void {
    if (this.anim.eyesSquinting) return;

    const pointer = this.scene.input.activePointer;
    const localX = pointer.x - this.x;
    const localY = pointer.y - this.y;

    const dist = Math.sqrt(localX * localX + localY * localY);
    if (dist < 0.1) return;

    const dirX = localX / dist;
    const dirY = localY / dist;

    const offsetX = dirX * this.pupilMaxOffset;
    const offsetY = dirY * this.pupilMaxOffset;

    this.leftPupil.setPosition(this.leftEyeBaseX + offsetX, this.leftEyeBaseY + offsetY);
    this.rightPupil.setPosition(this.rightEyeBaseX + offsetX, this.rightEyeBaseY + offsetY);
  }

  // ═══════════════════════════════════════════════════════════════
  // 公开动画 API（委托给 DragonAnimations）
  // ═══════════════════════════════════════════════════════════════

  playEatAnimation(): void {
    this.anim.playEatAnimation();
  }
}
