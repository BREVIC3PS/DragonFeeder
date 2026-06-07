import type { FoodDef } from '../../data/FoodData';
import type { DragonState, DragonMood } from './DragonState';

/**
 * DragonLogic — 龙宝宝核心逻辑
 * UE 类比：UDragonStatComponent — 处理饥饿/满意度的 Tick
 *
 * 纯逻辑层，不依赖 Phaser，可独立测试
 * 由 GameClock 驱动（而非 Phaser update），确保跨场景运行
 */
export class DragonLogic {
  /** 上次心情（用于检测变化） */
  private previousMood: DragonMood;

  /**
   * @param state 龙宝宝状态引用（DragonLogic 直接修改它）
   * @param hungerRate 饥饿增长速率（单位/秒），默认 0.3
   * @param happinessDecayRate 满意度衰减速率（单位/秒），默认 0.2
   */
  constructor(
    public readonly state: DragonState,
    private hungerRate: number = 0.3,
    private happinessDecayRate: number = 0.2,
  ) {
    this.previousMood = state.mood;
  }

  /**
   * 每逻辑帧调用（10Hz，dt=0.1s）
   *
   * 随时间流逝：
   * - 饥饿度上升（越来越饿）
   * - 满意度下降（越来越不开心）
   *
   * @param dt 时间步长（秒），GameClock 传入的固定值 0.1
   */
  update(dt: number): void {
    // 饥饿度上升（越久不吃越饿）
    this.state.hunger = Math.min(100, this.state.hunger + this.hungerRate * dt);

    // 满意度缓慢衰减（需要持续喂养维持）
    this.state.happiness = Math.max(0, this.state.happiness - this.happinessDecayRate * dt);
  }

  /**
   * 喂食
   *
   * @param food 食物配置（从 FoodData 读取数值）
   * @returns 心情是否发生了变化（供渲染层判断是否播放切换动画）
   */
  feed(food: FoodDef): boolean {
    this.state.hunger = Math.max(0, this.state.hunger - food.hungerRestore);
    this.state.happiness = Math.min(100, this.state.happiness + food.happinessGain);

    const moodChanged = this.state.mood !== this.previousMood;
    this.previousMood = this.state.mood;

    if (moodChanged) {
      console.log(`[DragonLogic] 心情变化: ${this.previousMood} → ${this.state.mood}`);
    }

    return moodChanged;
  }

  /**
   * 检查自上次查询后心情是否变化
   * 渲染层调用此方法来判断是否需要播放过渡动画
   */
  checkMoodChange(): boolean {
    if (this.state.mood !== this.previousMood) {
      this.previousMood = this.state.mood;
      return true;
    }
    return false;
  }
}
