import Phaser from 'phaser';
import { IdleBehavior, pickIdleBehavior, pickIdleInterval } from './IdleBehaviors';
import type { Dragon } from './Dragon';

/**
 * DragonAnimations — 龙宝宝所有动画的管理器
 *
 * 从 Dragon.ts 提取，负责：
 * - 呼吸动画（启动/暂停/参数更新）
 * - 吃食动画（弹跳 + 眼睛眯起 + 嘴巴张大）
 * - 开心跳跃
 * - 空闲小动作（yawn/lookAround/stretch/sneeze/sleep）
 * - 动画状态管理（busy、squint 等）
 */
export class DragonAnimations {
  // 呼吸动画
  breatheTween: Phaser.Tweens.Tween | null = null;
  breatheAmplitude: number = 0.05;
  breatheDuration: number = 2000;

  // 跳跃计时
  jumpTimer: number = 0;
  readonly JUMP_INTERVAL = 10; // 秒

  // 眼睛是否眯着（吃食时）
  eyesSquinting: boolean = false;

  // 空闲小动作
  idleTimer: number = 0;
  idleNextInterval: number;
  isIdleBusy: boolean = false;

  /** 外部可查询：是否正在繁忙（吃食/空闲行为中） */
  get busy(): boolean {
    return this.eyesSquinting || this.isIdleBusy;
  }

  constructor(private dragon: Dragon) {
    this.idleNextInterval = pickIdleInterval();
  }

  // ═══════════════════════════════════════════════════════════════
  // 吃食动画
  // ═══════════════════════════════════════════════════════════════

  playEatAnimation(): void {
    this.breatheTween?.pause();

    this.dragon.scene.tweens.chain({
      targets: this.dragon,
      tweens: [
        {
          scaleX: 0.85, scaleY: 0.85,
          duration: 100,
          ease: 'Quad.easeIn',
          onStart: () => {
            this.dragon.mouth.setRadius(14);
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
            this.dragon.mouth.setRadius(8);
            this.squintEyes(false);
            this.breatheTween?.resume();
          },
        },
      ],
    });
  }

  /** 眼睛眯起/恢复 */
  squintEyes(squint: boolean): void {
    this.eyesSquinting = squint;
    if (squint) {
      this.dragon.leftEye.setStartAngle(180);
      this.dragon.leftEye.setEndAngle(360);
      this.dragon.rightEye.setStartAngle(180);
      this.dragon.rightEye.setEndAngle(360);
      this.dragon.leftPupil.setRadius(2);
      this.dragon.rightPupil.setRadius(2);
    } else {
      this.dragon.leftEye.setStartAngle(0);
      this.dragon.leftEye.setEndAngle(360);
      this.dragon.rightEye.setStartAngle(0);
      this.dragon.rightEye.setEndAngle(360);
      this.dragon.leftPupil.setRadius(5);
      this.dragon.rightPupil.setRadius(5);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 开心跳跃
  // ═══════════════════════════════════════════════════════════════

  playJump(): void {
    if (this.eyesSquinting) return;

    const baseY = this.dragon.y;

    this.dragon.scene.tweens.chain({
      targets: this.dragon,
      tweens: [
        {
          y: baseY - 25,
          duration: 200,
          ease: 'Quad.easeOut',
        },
        {
          y: baseY,
          duration: 250,
          ease: 'Bounce.easeOut',
        },
      ],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 呼吸动画
  // ═══════════════════════════════════════════════════════════════

  startBreathing(): void {
    this.breatheTween = this.dragon.scene.tweens.add({
      targets: this.dragon,
      scaleX: 1 + this.breatheAmplitude,
      scaleY: 1 + this.breatheAmplitude,
      duration: this.breatheDuration,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  updateBreathingParams(): void {
    if (!this.breatheTween) return;
    this.breatheTween.stop();
    this.dragon.setScale(1);
    this.startBreathing();
  }

  // ═══════════════════════════════════════════════════════════════
  // 空闲小动作
  // ═══════════════════════════════════════════════════════════════

  dispatchIdleBehavior(mood: import('../../core/dragon/DragonState').DragonMood): void {
    const behavior = pickIdleBehavior(mood);
    switch (behavior) {
      case IdleBehavior.Yawn: this.playYawn(); break;
      case IdleBehavior.LookAround: this.playLookAround(); break;
      case IdleBehavior.Stretch: this.playStretch(); break;
      case IdleBehavior.Sneeze: this.playSneeze(); break;
      case IdleBehavior.Sleep: this.playSleep(); break;
    }
  }

  private playYawn(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();
    this.squintEyes(true);

    this.dragon.scene.tweens.add({
      targets: this.dragon.mouth,
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

  private playLookAround(): void {
    this.isIdleBusy = true;
    this.dragon.scene.tweens.chain({
      targets: this.dragon,
      tweens: [
        { angle: -8, duration: 400, ease: 'Sine.easeInOut' },
        { angle: 8, duration: 500, ease: 'Sine.easeInOut' },
        { angle: 0, duration: 400, ease: 'Sine.easeInOut', onComplete: () => { this.isIdleBusy = false; } },
      ],
    });
  }

  private playStretch(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();
    this.dragon.scene.tweens.chain({
      targets: this.dragon,
      tweens: [
        { scaleX: 0.88, scaleY: 1.15, duration: 250, ease: 'Quad.easeOut' },
        { scaleX: 1, scaleY: 1, duration: 250, ease: 'Bounce.easeOut',
          onComplete: () => { this.isIdleBusy = false; this.breatheTween?.resume(); } },
      ],
    });
  }

  private playSneeze(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();

    // 震动
    const origX = this.dragon.x;
    const shakes = 4;
    for (let i = 0; i < shakes; i++) {
      this.dragon.scene.tweens.add({
        targets: this.dragon,
        x: origX + (i % 2 === 0 ? 4 : -4),
        duration: 60,
        delay: i * 60,
        yoyo: true,
      });
    }

    // 小气泡"啊嚏!"
    const bubbleY = this.dragon.y - 75;
    const bubble = this.dragon.scene.add.text(this.dragon.x, bubbleY, '啊嚏!', {
      fontSize: '16px', color: '#4466aa', fontFamily: 'Arial',
      fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(200);

    this.dragon.scene.tweens.add({
      targets: bubble,
      y: bubbleY - 30, alpha: 0,
      duration: 1200, delay: 300,
      ease: 'Quad.easeOut',
      onComplete: () => bubble.destroy(),
    });

    this.dragon.scene.time.delayedCall(400, () => {
      this.isIdleBusy = false;
      this.breatheTween?.resume();
    });
  }

  private playSleep(): void {
    this.isIdleBusy = true;
    this.breatheTween?.pause();

    this.squintEyes(true);

    const zzzY = this.dragon.y - 70;
    const zzz = this.dragon.scene.add.text(this.dragon.x, zzzY, 'Z', {
      fontSize: '18px', color: '#8888ff', fontFamily: 'Arial',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setAlpha(0);

    this.dragon.scene.tweens.add({
      targets: zzz,
      alpha: 1, y: zzzY - 15,
      duration: 400,
      onComplete: () => {
        const zz = this.dragon.scene.add.text(this.dragon.x + 12, zzzY - 15, 'z', {
          fontSize: '14px', color: '#8888ff', fontFamily: 'Arial', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5).setDepth(200).setAlpha(0);
        this.dragon.scene.tweens.add({
          targets: zz, alpha: 0.8, y: zzzY - 30, duration: 500,
        });
      },
    });

    this.dragon.scene.time.delayedCall(3000, () => {
      this.squintEyes(false);
      this.isIdleBusy = false;
      this.breatheTween?.resume();
      this.dragon.scene.tweens.add({ targets: zzz, alpha: 0, duration: 300, onComplete: () => zzz.destroy() });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 每帧更新
  // ═══════════════════════════════════════════════════════════════

  /**
   * 更新呼吸参数（饥饿时变弱）、跳跃计时、空闲行为计时
   * 由 Dragon.updateVisuals() 调用
   */
  updateTimers(dt: number, hunger: number, happiness: number): void {
    // 饥饿时呼吸变弱
    const hungryWeak = hunger >= 70;
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
    if (happiness >= 80 && !this.busy) {
      this.jumpTimer += dt;
      if (this.jumpTimer >= this.JUMP_INTERVAL) {
        this.jumpTimer -= this.JUMP_INTERVAL;
        this.playJump();
      }
    } else if (happiness < 80) {
      this.jumpTimer = 0;
    }

    // 空闲小动作计时（繁忙时暂停）
    if (!this.busy) {
      this.idleTimer += dt;
      if (this.idleTimer >= this.idleNextInterval) {
        this.idleTimer = 0;
        this.idleNextInterval = pickIdleInterval();
        this.dispatchIdleBehavior(this.dragon.currentMood);
      }
    }
  }
}
