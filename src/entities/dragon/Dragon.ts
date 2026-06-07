import Phaser from 'phaser';
import { DragonState, MOOD_COLORS, type DragonMood } from '../../core/dragon/DragonState';

/**
 * Dragon — 龙宝宝渲染实体
 * UE 类比：ADragonActor（包含 UStaticMeshComponent + 动画）
 *
 * 视觉构成（纯几何图形占位）：
 * - 身体：大圆形（颜色 = 心情色）
 * - 耳朵/角：两个小三角形（身体颜色微调）
 * - 眼睛：白色圆 + 黑色瞳孔
 * - 嘴巴：小弧线
 *
 * 动画：
 * - 呼吸动画：持续轻微缩放（scale 1.0 ↔ 1.05）
 * - 心情切换：颜色平滑过渡（RGB 插值）
 * - 吃食动画：快速弹跳缩放
 */

// ── 工具函数：颜色转换 ──

interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: number): RGB {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

function rgbToHex(rgb: RGB): number {
  const r = Phaser.Math.Clamp(Math.round(rgb.r), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(rgb.g), 0, 255);
  const b = Phaser.Math.Clamp(Math.round(rgb.b), 0, 255);
  return (r << 16) | (g << 8) | b;
}

export class Dragon extends Phaser.GameObjects.Container {
  // 注意：属性名避开 Container 基类的 state/body 保留字段
  private dragonData: DragonState;

  // 可视化部件
  private bodyCircle: Phaser.GameObjects.Arc;
  private leftHorn: Phaser.GameObjects.Triangle;
  private rightHorn: Phaser.GameObjects.Triangle;
  private leftEye: Phaser.GameObjects.Arc;
  private rightEye: Phaser.GameObjects.Arc;
  private leftPupil: Phaser.GameObjects.Arc;
  private rightPupil: Phaser.GameObjects.Arc;
  private mouth: Phaser.GameObjects.Arc;

  // 颜色过渡状态（类似 UE 的 Material Parameter Lerp）
  private rgbCurrent: RGB;
  private rgbTarget: RGB;
  private colorLerpSpeed: number = 0.08; // 每帧插值速率

  // 呼吸动画 tween 引用
  private breatheTween: Phaser.Tweens.Tween | null = null;

  // 当前心情（用于检测变化）
  private currentMood: DragonMood;

  constructor(scene: Phaser.Scene, x: number, y: number, state: DragonState) {
    super(scene, x, y);
    this.dragonData = state;

    // ── 初始化颜色 ──
    this.currentMood = state.mood;
    const initialHex = MOOD_COLORS[this.currentMood];
    this.rgbCurrent = hexToRgb(initialHex);
    this.rgbTarget = hexToRgb(initialHex);

    // ── 身体（大圆） ──
    this.bodyCircle = scene.add.arc(0, 0, 55, 0, 360, false, initialHex, 1);
    this.add(this.bodyCircle);

    // ── 角/耳朵（两个三角形） ──
    // 注意：Phaser Triangle 的坐标是相对于 Container 的
    this.leftHorn = scene.add.triangle(0, 0, 0, 0, 16, 32, 32, 0, initialHex, 0.85);
    this.leftHorn.setPosition(-30, -58);
    this.add(this.leftHorn);

    this.rightHorn = scene.add.triangle(0, 0, 0, 0, 16, 32, 32, 0, initialHex, 0.85);
    this.rightHorn.setPosition(30, -58);
    this.rightHorn.scaleX = -1; // 镜像翻转
    this.add(this.rightHorn);

    // ── 眼睛（白色） ──
    this.leftEye = scene.add.arc(-20, -12, 12, 0, 360, false, 0xffffff, 1);
    this.add(this.leftEye);

    this.rightEye = scene.add.arc(20, -12, 12, 0, 360, false, 0xffffff, 1);
    this.add(this.rightEye);

    // ── 瞳孔（黑色） ──
    this.leftPupil = scene.add.arc(-22, -12, 5, 0, 360, false, 0x111111, 1);
    this.add(this.leftPupil);

    this.rightPupil = scene.add.arc(18, -12, 5, 0, 360, false, 0x111111, 1);
    this.add(this.rightPupil);

    // ── 嘴巴（小弧线 — 用半圆代替） ──
    this.mouth = scene.add.arc(0, 15, 8, 0, 180, false, 0x333333, 1);
    this.add(this.mouth);

    // 注册到场景显示列表
    // 注意：Container 已经通过 super() 注册，但需要显式添加到场景
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    // ── 启动呼吸动画 ──
    this.startBreathing();

    console.log(`[Dragon] 龙宝宝已创建 (${state.mood})`);
  }

  /**
   * 每渲染帧调用（由 DragonScene.events('update') 驱动）
   *
   * 职责：
   * - 检测心情变化 → 更新目标颜色
   * - 逐帧插值颜色（平滑过渡）
   * - 更新所有部件的填充色
   */
  updateVisuals(): void {
    // 检测心情变化
    if (this.dragonData.mood !== this.currentMood) {
      this.currentMood = this.dragonData.mood;
      this.rgbTarget = hexToRgb(MOOD_COLORS[this.currentMood]);
      console.log(`[Dragon] 心情切换: ${this.dragonData.mood} → 颜色: #${MOOD_COLORS[this.currentMood].toString(16)}`);
    }

    // RGB 逐帧插值（类似 UE 的 FMath::Lerp / Material 中的 Lerp 节点）
    this.rgbCurrent.r += (this.rgbTarget.r - this.rgbCurrent.r) * this.colorLerpSpeed;
    this.rgbCurrent.g += (this.rgbTarget.g - this.rgbCurrent.g) * this.colorLerpSpeed;
    this.rgbCurrent.b += (this.rgbTarget.b - this.rgbCurrent.b) * this.colorLerpSpeed;

    const currentHex = rgbToHex(this.rgbCurrent);

    // 更新部件颜色
    this.bodyCircle.setFillStyle(currentHex);
    this.leftHorn.setFillStyle(currentHex, 0.85);
    this.rightHorn.setFillStyle(currentHex, 0.85);
  }

  /**
   * 吃食动画：快速弹跳 + 嘴巴张大
   *
   * 序列：
   * 1. 缩小到 0.85（张嘴准备）
   * 2. 放大到 1.15（大口咬下）
   * 3. 恢复 1.0（咀嚼）
   */
  playEatAnimation(): void {
    // 暂停呼吸动画
    this.breatheTween?.pause();

    this.scene.tweens.chain({
      targets: this,
      tweens: [
        {
          scaleX: 0.85,
          scaleY: 0.85,
          duration: 100,
          ease: 'Quad.easeIn',
          onStart: () => {
            // 嘴巴张大
            this.mouth.setRadius(14);
          },
        },
        {
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 120,
          ease: 'Back.easeOut',
        },
        {
          scaleX: 1.0,
          scaleY: 1.0,
          duration: 200,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            // 嘴巴恢复
            this.mouth.setRadius(8);
            // 恢复呼吸动画
            this.breatheTween?.resume();
          },
        },
      ],
    });
  }

  /**
   * 呼吸动画（持续循环）
   *
   * scaleX/Y 在 1.0 ↔ 1.05 之间缓慢振荡
   * 用 Sine 缓动模拟生物的自然呼吸节奏
   */
  private startBreathing(): void {
    this.breatheTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 2000,   // 2 秒一个完整呼吸周期
      ease: 'Sine.easeInOut',
      yoyo: true,       // 来回（放大→缩小→放大→...）
      repeat: -1,       // 无限循环
    });
  }
}
