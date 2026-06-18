import Phaser from 'phaser';
import { DragonState, MOOD_COLORS, type DragonMood } from '../../core/dragon/DragonState';
import { IdleBehavior, pickIdleBehavior, pickIdleInterval } from './IdleBehaviors';

/**
 * Dragon — 龙宝宝渲染实体
 *
 * 动画系统：
 * - 呼吸动画：持续轻微缩放
 * - 心情切换：颜色平滑过渡（RGB 插值）
 * - 吃食动画：弹跳 + 眼睛眯起 + 嘴巴张大
 * - 开心跳跃：满意度 > 80 时每 10 秒蹦跳
 * - 眼睛追踪：瞳孔始终看向鼠标
 * - 空闲小动作：yawn/lookAround/stretch/sneeze/sleep
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

  // 可视化部件
  private bodyCircle: Phaser.GameObjects.Arc;
  private leftHorn: Phaser.GameObjects.Triangle;
  private rightHorn: Phaser.GameObjects.Triangle;
  private leftEye: Phaser.GameObjects.Arc;
  private rightEye: Phaser.GameObjects.Arc;
  private leftPupil: Phaser.GameObjects.Arc;
  private rightPupil: Phaser.GameObjects.Arc;
  private mouth: Phaser.GameObjects.Arc;

  // 眼睛基准位置（相对于 Container，瞳孔在此基础上偏移）
  private leftEyeBaseX = -20;
  private leftEyeBaseY = -12;
  private rightEyeBaseX = 20;
  private rightEyeBaseY = -12;
  /** 瞳孔最大偏移半径（不能超出眼白） */
  private pupilMaxOffset = 5;

  // 颜色过渡
  private rgbCurrent: RGB;
  private rgbTarget: RGB;
  private colorLerpSpeed: number = 0.08;

  // 呼吸动画
  private breatheTween: Phaser.Tweens.Tween | null = null;
  private breatheAmplitude: number = 0.05; // 默认 5% 缩放
  private breatheDuration: number = 2000;  // 默认 2 秒周期

  // 跳跃计时
  private jumpTimer: number = 0;
  private readonly JUMP_INTERVAL = 10; // 秒

  // 当前心情
  private currentMood: DragonMood;

  // 眼睛是否眯着（吃食时）
  private eyesSquinting: boolean = false;

  // 空闲小动作
  private idleTimer: number = 0;
  private idleNextInterval: number;
  private isIdleBusy: boolean = false; // 正在执行空闲行为时阻止其他动画冲突

  /** 外部可查询：龙是否正在繁忙（吃食/空闲行为中） */
  get busy(): boolean { return this.eyesSquinting || this.isIdleBusy; }

  constructor(scene: Phaser.Scene, x: number, y: number, state: DragonState) {
    super(scene, x, y);
    this.dragonData = state;

    this.currentMood = state.mood;
    this.idleNextInterval = pickIdleInterval();
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

    // ── 初始呼吸动画 ──
    this.startBreathing();

    console.log(`[Dragon] 龙宝宝已创建 (${state.mood})`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 每帧调用
  // ═══════════════════════════════════════════════════════════════

  /** 每渲染帧调用（颜色过渡 + 眼睛跟踪 + 呼吸振幅调整 + 跳跃计时） */
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

    // 饥饿时呼吸变弱（振幅减半）
    const hungryWeak = this.dragonData.hunger >= 70;
    const targetAmp = hungryWeak ? 0.02 : 0.05;
    const targetDur = hungryWeak ? 3000 : 2000;
    if (Math.abs(this.breatheAmplitude - targetAmp) > 0.001) {
      this.breatheAmplitude += (targetAmp - this.breatheAmplitude) * 0.05;
      this.updateBreathingParams();
    }
    if (this.breatheDuration !== targetDur) {
      this.breatheDuration = targetDur;
      this.updateBreathingParams();
    }

    // 开心跳跃计时
    if (this.dragonData.happiness >= 80 && !this.busy) {
      this.jumpTimer += dt;
      if (this.jumpTimer >= this.JUMP_INTERVAL) {
        this.jumpTimer -= this.JUMP_INTERVAL;
        this.playJump();
      }
    } else if (this.dragonData.happiness < 80) {
      this.jumpTimer = 0;
    }

    // 空闲小动作计时（繁忙时暂停）
    if (!this.busy) {
      this.idleTimer += dt;
      if (this.idleTimer >= this.idleNextInterval) {
        this.idleTimer = 0;
        this.idleNextInterval = pickIdleInterval();
        this.dispatchIdleBehavior();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 眼睛跟踪鼠标
  // ═══════════════════════════════════════════════════════════════

  private updateEyeTracking(): void {
    if (this.eyesSquinting) return; // 眯眼时不追踪

    const pointer = this.scene.input.activePointer;
    // 鼠标在屏幕上的位置 → 转换为 Container 本地坐标
    const localX = pointer.x - this.x;
    const localY = pointer.y - this.y;

    // 计算方向（从 Container 中心指向鼠标）
    const dist = Math.sqrt(localX * localX + localY * localY);
    if (dist < 0.1) return;

    const dirX = localX / dist;
    const dirY = localY / dist;

    // 瞳孔在眼白内偏移（max 5px，即瞳孔半径）
    const offsetX = dirX * this.pupilMaxOffset;
    const offsetY = dirY * this.pupilMaxOffset;

    this.leftPupil.setPosition(this.leftEyeBaseX + offsetX, this.leftEyeBaseY + offsetY);
    this.rightPupil.setPosition(this.rightEyeBaseX + offsetX, this.rightEyeBaseY + offsetY);
  }

  // ═══════════════════════════════════════════════════════════════
  // 吃食动画（含眼睛眯起）
  // ═══════════════════════════════════════════════════════════════

  playEatAnimation(): void {
    this.breatheTween?.pause();

    this.scene.tweens.chain({
      targets: this,
      tweens: [
        {
          scaleX: 0.85, scaleY: 0.85,
          duration: 100,
          ease: 'Quad.easeIn',
          onStart: () => {
            this.mouth.setRadius(14);
            this.squintEyes(true);
          },
        },
        {
          scaleX: 1.15, scaleY: 1.15,
          duration: 120,
          ease: 'Back.easeOut',
        },
        {
          scaleX: 1.0, scaleY: 1.0,
          duration: 200,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            this.mouth.setRadius(8);
            this.squintEyes(false);
            this.breatheTween?.resume();
          },
        },
      ],
    });
  }

  /** 眼睛眯起/恢复（吃食时调用） */
  private squintEyes(squint: boolean): void {
    this.eyesSquinting = squint;
    if (squint) {
      // 眼睛变成横线（半圆弧）
      this.leftEye.setStartAngle(180);
      this.leftEye.setEndAngle(360);
      this.rightEye.setStartAngle(180);
      this.rightEye.setEndAngle(360);
      // 瞳孔缩小
      this.leftPupil.setRadius(2);
      this.rightPupil.setRadius(2);
    } else {
      // 恢复圆形
      this.leftEye.setStartAngle(0);
      this.leftEye.setEndAngle(360);
      this.rightEye.setStartAngle(0);
      this.rightEye.setEndAngle(360);
      this.leftPupil.setRadius(5);
      this.rightPupil.setRadius(5);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 开心跳跃
  // ═══════════════════════════════════════════════════════════════

  private playJump(): void {
    // 防止和吃食动画冲突
    if (this.eyesSquinting) return;

    // 显式锁定起跳点：chain 第二段必须落回起跳点，而不是依赖
    // "chain 创建时读取的 this.y"（如果未来跳跃中途有其他逻辑改 y，这里会出错）
    const baseY = this.y;

    this.scene.tweens.chain({
      targets: this,
      tweens: [
        {
          y: baseY - 25, // 上跳
          duration: 200,
          ease: 'Quad.easeOut',
        },
        {
          y: baseY, // 落下
          duration: 250,
          ease: 'Bounce.easeOut',
        },
      ],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 呼吸动画
  // ═══════════════════════════════════════════════════════════════

  private startBreathing(): void {
    this.breatheTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1 + this.breatheAmplitude,
      scaleY: 1 + this.breatheAmplitude,
      duration: this.breatheDuration,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** 更新呼吸参数（振幅或周期变化时重建 tween） */
  private updateBreathingParams(): void {
    if (!this.breatheTween) return;
    this.breatheTween.stop();
    this.setScale(1);
    this.startBreathing();
  }

  // ═══════════════════════════════════════════════════════════════
  // 空闲小动作
  // ═══════════════════════════════════════════════════════════════

  private dispatchIdleBehavior(): void {
    const behavior = pickIdleBehavior(this.dragonData.mood);
    switch (behavior) {
      case IdleBehavior.Yawn: this.playYawn(); break;
      case IdleBehavior.LookAround: this.playLookAround(); break;
      case IdleBehavior.Stretch: this.playStretch(); break;
      case IdleBehavior.Sneeze: this.playSneeze(); break;
      case IdleBehavior.Sleep: this.playSleep(); break;
    }
  }

  /** 打哈欠：嘴巴张合 0.8s */
  private playYawn(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();
    this.squintEyes(true);

    this.scene.tweens.add({
      targets: this.mouth,
      radius: 18,
      duration: 400,
      ease: 'Quad.easeOut',
      yoyo: true,
      hold: 200,
      onComplete: () => {
        this.squintEyes(false);
        this.isIdleBusy = false;
        this.breatheTween?.resume();
      },
    });
  }

  /** 左右张望：头部旋转 ±8° */
  private playLookAround(): void {
    this.isIdleBusy = true;
    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { angle: -8, duration: 400, ease: 'Sine.easeInOut' },
        { angle: 8, duration: 500, ease: 'Sine.easeInOut' },
        { angle: 0, duration: 400, ease: 'Sine.easeInOut', onComplete: () => { this.isIdleBusy = false; } },
      ],
    });
  }

  /** 伸懒腰：垂直拉伸 0.5s */
  private playStretch(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();
    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { scaleX: 0.88, scaleY: 1.15, duration: 250, ease: 'Quad.easeOut' },
        { scaleX: 1, scaleY: 1, duration: 250, ease: 'Bounce.easeOut',
          onComplete: () => { this.isIdleBusy = false; this.breatheTween?.resume(); } },
      ],
    });
  }

  /** 打喷嚏：震动 + 小气泡 */
  private playSneeze(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();

    // 震动
    const origX = this.x;
    const shakes = 4;
    for (let i = 0; i < shakes; i++) {
      this.scene.tweens.add({
        targets: this,
        x: origX + (i % 2 === 0 ? 4 : -4),
        duration: 60,
        delay: i * 60,
        yoyo: true,
      });
    }

    // 小气泡"啊嚏!"
    const bubbleY = this.y - 75;
    const bubble = this.scene.add.text(this.x, bubbleY, '啊嚏!', {
      fontSize: '16px', color: '#4466aa', fontFamily: 'Arial',
      fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(200);

    this.scene.tweens.add({
      targets: bubble,
      y: bubbleY - 30, alpha: 0,
      duration: 1200, delay: 300,
      ease: 'Quad.easeOut',
      onComplete: () => bubble.destroy(),
    });

    this.scene.time.delayedCall(400, () => {
      this.isIdleBusy = false;
      this.breatheTween?.resume();
    });
  }

  /** 小憩：闭眼 + Zzz 飘浮 */
  private playSleep(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();

    // 闭眼
    this.squintEyes(true);

    // Zzz 文字
    const zzzY = this.y - 70;
    const zzz = this.scene.add.text(this.x, zzzY, 'Z', {
      fontSize: '18px', color: '#8888ff', fontFamily: 'Arial',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setAlpha(0);

    // Zzz 动画序列
    this.scene.tweens.add({
      targets: zzz,
      alpha: 1, y: zzzY - 15,
      duration: 400,
      onComplete: () => {
        // 第二个 Z
        const zz = this.scene.add.text(this.x + 12, zzzY - 15, 'z', {
          fontSize: '14px', color: '#8888ff', fontFamily: 'Arial', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5).setDepth(200).setAlpha(0);
        this.scene.tweens.add({
          targets: zz, alpha: 0.8, y: zzzY - 30, duration: 500,
        });
      },
    });

    // 3 秒后醒来
    this.scene.time.delayedCall(3000, () => {
      this.squintEyes(false);
      this.isIdleBusy = false;
      this.breatheTween?.resume();
      // 淡出所有 Zzz
      this.scene.tweens.add({ targets: zzz, alpha: 0, duration: 300, onComplete: () => zzz.destroy() });
    });
  }
}
