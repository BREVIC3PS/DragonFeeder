import type { DragonState } from '../core/dragon/DragonState';
import {
  SCALE_MIN_HAPPINESS, SCALE_INTERVAL_NORMAL, SCALE_INTERVAL_HAPPY,
  MOOD_HAPPY_HAPPINESS,
} from '../data/GameConfig';

/**
 * ScaleSystem — 龙鳞自动产出系统
 * UE 类比：UGameplayAbility 被动技能（基于条件自动触发）
 *
 * 规则：
 * - 满意度 < 60 → 不产出
 * - 满意度 60~80 → 每 5 秒产出 1 片（SCALE_INTERVAL_NORMAL）
 * - 满意度 ≥ 80 → 每 3 秒产出 1 片（SCALE_INTERVAL_HAPPY）
 *
 * 由 GameClock 驱动（10Hz），确保跨场景运行
 */
export class ScaleSystem {
  /** 上次产出后经过的时间（秒） */
  private timer: number = 0;

  /** 每次更新回调（DragonScene 注册，用于触发掉落动画） */
  onScaleProduced: ((count: number) => void) | null = null;

  constructor(private state: DragonState) {}

  /**
   * 每逻辑帧调用
   * @param dt 时间步长（秒），GameClock 传入
   * @returns 本次产出的龙鳞数量（0 或 1）
   */
  update(dt: number): number {
    if (this.state.happiness < SCALE_MIN_HAPPINESS) {
      this.timer = 0; // 重置计时器
      return 0;
    }

    const interval = this.state.happiness >= MOOD_HAPPY_HAPPINESS
      ? SCALE_INTERVAL_HAPPY
      : SCALE_INTERVAL_NORMAL;

    this.timer += dt;

    let produced = 0;
    while (this.timer >= interval) {
      this.timer -= interval;
      this.state.dragonScales += 1;
      produced++;
    }

    // 上限保护（防止 dt 极大时产出爆发）
    if (this.timer >= interval) {
      this.timer = 0;
    }

    if (produced > 0) {
      console.log(`[ScaleSystem] +${produced} 龙鳞 (满意度=${Math.round(this.state.happiness)}, 总计=${this.state.dragonScales})`);
      this.onScaleProduced?.(produced);
    }

    return produced;
  }
}
