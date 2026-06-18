import type { DragonMood } from '../../core/dragon/DragonState';

/**
 * IdleBehaviors — 龙宝宝空闲小动作
 *
 * 5 种行为，心情影响随机概率
 */

export enum IdleBehavior {
  Yawn = 'yawn',
  LookAround = 'lookAround',
  Stretch = 'stretch',
  Sneeze = 'sneeze',
  Sleep = 'sleep',
}

/** 心情 → 行为权重（数值越大越容易被选中） */
const WEIGHTS: Record<DragonMood, Record<IdleBehavior, number>> = {
  happy:   { yawn: 1, lookAround: 3, stretch: 4, sneeze: 2, sleep: 1 },
  normal:  { yawn: 2, lookAround: 2, stretch: 2, sneeze: 2, sleep: 2 },
  hungry:  { yawn: 2, lookAround: 1, stretch: 1, sneeze: 1, sleep: 4 },
  unhappy: { yawn: 4, lookAround: 1, stretch: 1, sneeze: 1, sleep: 3 },
};

/** 加权随机选择空闲行为 */
export function pickIdleBehavior(mood: DragonMood): IdleBehavior {
  const weights = WEIGHTS[mood];
  const entries = Object.entries(weights) as [IdleBehavior, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [behavior, w] of entries) {
    r -= w;
    if (r <= 0) return behavior;
  }
  return IdleBehavior.LookAround;
}

/** 随机空闲间隔（20-40 秒） */
export function pickIdleInterval(): number {
  return 20 + Math.random() * 20;
}
