/**
 * DragonState — 龙宝宝核心状态（纯数据，不依赖渲染）
 * UE 类比：UDragonDataAsset — 只存数据，不关心怎么画
 *
 * 设计原则：
 * - 所有字段公开（原型阶段，getter/setter 过度工程）
 * - mood 是计算属性（由 hunger + happiness 推导）
 * - 不做数据校验（上层逻辑保证合法性）
 */

export type DragonMood = 'happy' | 'normal' | 'hungry' | 'unhappy';

/** 4 种心情对应的颜色（供渲染层读取） */
export const MOOD_COLORS: Record<DragonMood, number> = {
  happy:   0xff88cc, // 粉色
  normal:  0x88ccff, // 浅蓝
  hungry:  0xff8844, // 橙色
  unhappy: 0x777777, // 暗灰
};

export class DragonState {
  /** 饥饿度 0-100（0=饱了，100=极度饥饿） */
  hunger: number = 50;

  /** 满意度 0-100（0=不开心，100=非常开心） */
  happiness: number = 50;

  /** 龙鳞数量（货币） */
  dragonScales: number = 10;

  /**
   * 当前心情（由 hunger 和 happiness 计算得出）
   *
   * 判定优先级（从高到低）：
   * 1. 开心：满意度 ≥ 80 且不饿（hunger < 50）
   * 2. 饥饿：饥饿度 ≥ 70
   * 3. 不开心：满意度 < 30
   * 4. 普通：其余情况
   */
  get mood(): DragonMood {
    if (this.happiness >= 80 && this.hunger < 50) return 'happy';
    if (this.hunger >= 70) return 'hungry';
    if (this.happiness < 30) return 'unhappy';
    return 'normal';
  }

  /** 调试用：输出当前状态 */
  toString(): string {
    return `DragonState(hunger=${this.hunger.toFixed(1)}, happiness=${this.happiness.toFixed(1)}, mood=${this.mood}, scales=${this.dragonScales})`;
  }
}
