/**
 * GameConfig — 游戏全局参数配置
 * UE 类比：DefaultGame.ini / UGameUserSettings
 *
 * 所有可调数值集中在此文件，修改即可调整游戏平衡。
 * 分类注释标明每个参数影响什么机制。
 */

// ═══════════════════════════════════════════════════════════════
// 一、时间与时钟
// ═══════════════════════════════════════════════════════════════

/** 逻辑帧频率（Hz），越高模拟越精细但 CPU 开销越大。
 *  修改后需要同步更新 GameClock 构造参数（BootScene.ts）。
 *  当前统一使用 10Hz（10 tick/s = 每 tick 0.1 秒）。 */
export const TICK_RATE = 10;

// ═══════════════════════════════════════════════════════════════
// 二、龙宝宝
// ═══════════════════════════════════════════════════════════════

/** 饥饿度初始值（0=饱，100=极度饥饿） */
export const DRAGON_INIT_HUNGER = 50;

/** 满意度初始值（0=不开心，100=非常开心） */
export const DRAGON_INIT_HAPPINESS = 50;

/** 龙鳞初始数量 */
export const DRAGON_INIT_SCALES = 10;

/** 饥饿增长速度（单位/秒），越高饿得越快。默认 0.3/秒 = 约 5.5 分钟从饱到饿。 */
export const DRAGON_HUNGER_RATE = 0.3;

/** 满意度衰减速度（单位/秒），越高掉得越快。默认 0.2/秒。 */
export const DRAGON_HAPPINESS_DECAY = 0.2;

/** 自动喂食触发阈值：饥饿度 ≤ 此值时不喂（避免浪费食物）。
 *  也即：只有饥饿度 > AUTO_FEED_HUNGER_THRESHOLD 时自动喂食才会扣食物。 */
export const AUTO_FEED_HUNGER_THRESHOLD = 20;

/** 心情判定阈值 */

/** 满意度 ≥ 此值 + 不饿 → 开心 */
export const MOOD_HAPPY_HAPPINESS = 80;
export const MOOD_HAPPY_MAX_HUNGER = 50;

/** 饥饿度 ≥ 此值 → 饥饿 */
export const MOOD_HUNGRY_THRESHOLD = 70;

/** 满意度 < 此值 → 不开心 */
export const MOOD_UNHAPPY_THRESHOLD = 30;

// ═══════════════════════════════════════════════════════════════
// 三、食物
// ═══════════════════════════════════════════════════════════════

// FOOD_CONFIGS 已移除 — 统一使用 src/data/FoodData.ts 中的 FOODS 定义

/** 初始食物库存 */
export const INIT_FOOD_INVENTORY: Record<string, number> = {
  bread: 10,
  meat: 5,
  cake: 3,
};

// ═══════════════════════════════════════════════════════════════
// 四、龙鳞产出
// ═══════════════════════════════════════════════════════════════

/** 满意度低于此值不产出龙鳞 */
export const SCALE_MIN_HAPPINESS = 60;

/** 满意度 60-80：产出一个龙鳞需要的秒数 */
export const SCALE_INTERVAL_NORMAL = 5;

/** 满意度 ≥ 80：产出一个龙鳞需要的秒数（更快） */
export const SCALE_INTERVAL_HAPPY = 3;

// ═══════════════════════════════════════════════════════════════
// 五、工厂 — 采集器
// ═══════════════════════════════════════════════════════════════

/** 采集器产出间隔（tick 数），越小越快 */
export const SOURCE_INTERVALS: Record<string, number> = {
  water: 15,     // 每 1.5s 产 1 水
  wheat_a: 12,   // 每 1.2s 产 1 小麦（供面包机）
  meat_raw: 8,   // 每 0.8s 产 1 生肉
  wheat_b: 12,   // 每 1.2s 产 1 小麦（供蛋糕机）
  sugar: 20,     // 每 2.0s 产 1 糖
};

/** 采集器输出缓冲区上限 */
export const SOURCE_MAX_BUFFER = 10;

// ═══════════════════════════════════════════════════════════════
// 六、工厂 — 生产配方
// ═══════════════════════════════════════════════════════════════

// 配方定义统一在 src/core/factory/Recipe.ts 中（RECIPES 数组）。
// 这里不再重复定义，避免两份数据不一致。

// ═══════════════════════════════════════════════════════════════
// 七、工厂 — 生产机器
// ═══════════════════════════════════════════════════════════════

/** 每个输入端口的缓冲区上限 */
export const MACHINE_MAX_INPUT = 5;

/** 每个输出端口的缓冲区上限 */
export const MACHINE_MAX_OUTPUT = 5;

// ═══════════════════════════════════════════════════════════════
// 八、工厂 — 传送带
// ═══════════════════════════════════════════════════════════════

/** 各段传送带长度（物品走完全程需要的 tick 数），越大越慢 */
export const BELT_LENGTHS: Record<string, number> = {
  source_to_machine: 8,   // 采集器 → 机器
  meat_to_machine: 10,    // 牧场 → 肉机（稍远）
  machine_to_feeder: 6,   // 机器 → 喂食仓
  default: 8,             // 玩家手动创建的传送带默认长度
};

/** 传送带每格可容纳的物品数量（maxCapacity = length × BELT_CAPACITY_PER_TILE） */
export const BELT_CAPACITY_PER_TILE = 2;

// ═══════════════════════════════════════════════════════════════
// 九、工厂 — 喂食仓
// ═══════════════════════════════════════════════════════════════

/** 喂食仓输入缓冲区上限 */
export const FEEDER_MAX_BUFFER = 10;

// ═══════════════════════════════════════════════════════════════
// 十、工厂 — 生产加速（龙鳞消耗）
// ═══════════════════════════════════════════════════════════════

/** 加速倍率 */
export const BOOST_MULTIPLIER = 2.0;

/** 加速持续时间（tick 数） */
export const BOOST_DURATION_TICKS = 300; // 30 秒

/** 加速消耗龙鳞数 */
export const BOOST_SCALE_COST = 2;

// ═══════════════════════════════════════════════════════════════
// 十一、游戏窗口
// ═══════════════════════════════════════════════════════════════

export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;

// ═══════════════════════════════════════════════════════════════
// 十二、建造系统
// ═══════════════════════════════════════════════════════════════

/** 网格单元格大小（像素） */
export const GRID_CELL_SIZE = 32;

/** 网格区域左上角偏移 */
export const GRID_OFFSET_X = 50;
export const GRID_OFFSET_Y = 80;

/** 网格列数 / 行数 */
export const GRID_COLS = 28;
export const GRID_ROWS = 19;

/** 拆除建筑返还比例（0-1） */
export const DEMOLISH_REFUND = 0.5;
