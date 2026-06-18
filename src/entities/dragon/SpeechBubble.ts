import Phaser from 'phaser';

/**
 * SpeechBubble — 龙宝宝头顶文字气泡
 *
 * 特性：
 * - 圆角矩形 + 尾部三角，云朵感
 * - 同一时间最多一个（新的替换旧的）
 * - 持续 2 秒后淡出销毁
 * - 可选跟随目标（如龙宝宝），每帧同步位置以避免跳跃/拖动时气泡脱节
 */
interface FollowTarget {
  x: number;
  y: number;
  active?: boolean;
}

export class SpeechBubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private fadeTween: Phaser.Tweens.Tween | null = null;
  private lifetime: number = 2000;

  /** 跟随目标（每帧 preUpdate 时同步位置）；为 null 则保持构造时的固定位置 */
  private followTarget: FollowTarget | null = null;
  private followOffsetY: number = -90;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string) {
    super(scene, x, y);

    // ── 背景（圆角矩形气泡 + 底部三角） ──
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, {
      fontSize: '14px',
      color: '#333333',
      fontFamily: 'Arial',
      wordWrap: { width: 160 },
      align: 'center',
    }).setOrigin(0.5, 0.5);

    this.redrawBackground();

    this.add(this.bg);
    this.add(this.label);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    this.setDepth(200);
    this.setAlpha(0);
    this.setScale(0.3);

    // 弹出动画
    scene.tweens.add({
      targets: this,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // 持续一段时间后淡出
    this.fadeTween = scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleY: 0.5,
      delay: this.lifetime,
      duration: 400,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    });
  }

  /**
   * 设置跟随目标，气泡每帧自动跟随其位置（保持 offsetY 高度）
   * @param target 任意有 x/y 字段的对象（如龙 Container）
   * @param offsetY 相对于目标 y 的偏移（负值=在目标上方），默认 -90
   */
  follow(target: FollowTarget, offsetY: number = -90): this {
    this.followTarget = target;
    this.followOffsetY = offsetY;
    // 立即同步一次，避免首帧出现位置错位
    this.x = target.x;
    this.y = target.y + offsetY;
    return this;
  }

  /** Phaser 每帧自动调用（Container 的 preUpdate 在 add.existing 后由场景调度） */
  protected preUpdate(_time: number, _delta: number): void {
    if (this.followTarget && this.followTarget.active !== false) {
      this.x = this.followTarget.x;
      this.y = this.followTarget.y + this.followOffsetY;
    }
  }

  /** 立即替换为新文字（重置计时器） */
  replaceText(text: string): void {
    this.label.setText(text);
    this.redrawBackground();

    // 重置淡出计时器
    this.fadeTween?.stop();
    this.setAlpha(1);
    this.setScale(1);
    this.fadeTween = this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleY: 0.5,
      delay: this.lifetime,
      duration: 400,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    });
  }

  /** 重新绘制背景（构造和换文字时复用，避免重复代码） */
  private redrawBackground(): void {
    const padX = 14;
    const padY = 8;
    const w = this.label.width + padX * 2;
    const h = this.label.height + padY * 2;
    const rx = Math.min(w, h) / 2;

    this.bg.clear();
    this.bg.fillStyle(0xffffff, 0.92);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, rx);
    // 底部小三角指向龙
    this.bg.fillTriangle(-6, h / 2, 6, h / 2, 0, h / 2 + 8);
  }
}
