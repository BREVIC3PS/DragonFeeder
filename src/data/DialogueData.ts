/**
 * DialogueData — 龙宝宝台词池
 * 按触发条件分组，每次随机抽取一条
 */

/** 饥饿时说的台词 (hunger >= 30，非紧急) */
export const DIALOGUE_HUNGRY = [
  '好饿...',
  '肚子叫了',
  '想吃东西...',
  '咕噜噜...',
  '有吃的吗？',
  '饿了饿了',
];

/** 吃完食物后的即时反应 */
export const DIALOGUE_AFTER_EAT = [
  '好吃!',
  '啊呜~',
  '再来!',
  '美味！',
  '还要还要！',
  '太棒了！',
];

/** 满意度很高时的台词 */
export const DIALOGUE_HAPPY = [
  '好开心!',
  '最爱主人了',
  '今天真棒~',
  '嘿嘿~',
  '好幸福~',
  '主人最好啦！',
];

/** 满意度很低时的台词 */
export const DIALOGUE_UNHAPPY = [
  '...',
  '不开心',
  '...',
  '哼...',
  '理我一下嘛',
  '好无聊...',
];

/** 随机抽取一句 */
export function pickDialogue(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}
