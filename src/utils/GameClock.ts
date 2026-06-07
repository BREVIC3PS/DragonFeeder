/**
 * GameClock — 统一逻辑帧驱动器
 * UE 类比：UE 的 Fixed Timestep（UWorld::Tick 的 Physics Tick）
 *
 * 核心概念：
 * - 渲染帧 60fps（Phaser 的 update），不稳定、依赖显示器刷新率
 * - 逻辑帧 10Hz（GameClock 的 onTick），稳定、固定时间步长
 * - GameClock 用"时间累加器"模式：累积渲染帧的 delta，每满 100ms 触发一次逻辑 tick
 *
 * 为什么用 10Hz？
 * - 工厂模拟（传送带物品移动、机器生产进度）不需要 60fps 精度
 * - 降低 CPU 开销
 * - 渲染层通过 getSubTickFraction() 在两次 tick 间插值，保证 60fps 视觉流畅
 *
 * 使用方式：
 * 1. 某一个永不 sleep 的 Scene.update() 中调用 gameClock.update(delta)
 * 2. 核心逻辑订阅 gameClock.onTick(callback)
 */

type TickCallback = (dt: number) => void;

export class GameClock {
  /** 逻辑帧频率（每秒 tick 次数） */
  readonly tickRate: number;

  /** 每次 tick 的固定时间步长（毫秒） */
  readonly tickInterval: number;

  /** 时间累加器：累积渲染帧的 delta，满了就触发 tick */
  private accumulator: number = 0;

  /** 已执行的 tick 总数（用于调试和序列化） */
  tickCount: number = 0;

  /** 订阅者列表 */
  private listeners: Set<TickCallback> = new Set();

  /**
   * 子帧插值比例（0-1）
   * UE 类比：Fraction 参数，用于在 Fixed Timestep 之间做平滑插值
   *
   * 渲染层用这个值在两次 tick 之间 lerp 物品位置：
   * - 0 = 刚好在本次 tick 的位置
   * - 0.5 = 在两次 tick 中间
   * - 接近 1 = 快到下一次 tick
   *
   * 这样即使逻辑只有 10Hz，画面上物品也能以 60fps 平滑移动
   */
  getSubTickFraction(): number {
    return this.accumulator / this.tickInterval;
  }

  constructor(tickRate: number = 10) {
    this.tickRate = tickRate;
    this.tickInterval = 1000 / tickRate; // 10Hz = 100ms per tick
  }

  /**
   * 每渲染帧调用此方法（由 Phaser Scene.update() 驱动）
   *
   * @param delta 距离上一帧的时间，单位毫秒（Phaser 标准）
   *
   * 实现原理（时间累加器模式）：
   * ```
   * 渲染帧  delta=16ms  accumulator=16   < 100, 不触发
   * 渲染帧  delta=17ms  accumulator=33   < 100, 不触发
   * ...6 帧后...
   * 渲染帧  delta=16ms  accumulator=98   < 100, 不触发
   * 渲染帧  delta=16ms  accumulator=114  ≥ 100, 触发! → accumulator=14
   * ```
   * 此时 getSubTickFraction() = 14/100 = 0.14
   * 渲染层用这个值在两次 tick 间 lerp 物品位置，保证 60fps 视觉流畅
   *
   * 这样即使渲染帧率波动，逻辑帧始终稳定 10Hz
   */
  update(delta: number): void {
    this.accumulator += delta;

    // 为什么用 while 而不是 if？
    // 如果一帧的 delta 很大（比如切换 Tab 回来，浏览器补了一帧 500ms），
    // 可能需要触发多次逻辑 tick 来"追赶"——while 确保不丢 tick
    // 但也要设上限，防止"死亡螺旋"（delta 极大时无限循环）
    let ticksThisFrame = 0;
    const maxTicksPerFrame = 20; // 最多一次追 20 帧（2 秒），超过就丢弃

    while (this.accumulator >= this.tickInterval && ticksThisFrame < maxTicksPerFrame) {
      this.accumulator -= this.tickInterval;
      this.tickCount++;
      ticksThisFrame++;

      // 触发所有订阅者，传递固定时间步长（秒）
      const dtSeconds = this.tickInterval / 1000; // 0.1 秒 (10Hz)
      for (const listener of this.listeners) {
        try {
          listener(dtSeconds);
        } catch (err) {
          console.warn('[GameClock] tick 回调异常:', err);
        }
      }
    }

    // 如果超过了上限，重置累加器防止追赶不及
    if (ticksThisFrame >= maxTicksPerFrame) {
      this.accumulator = 0;
      console.warn(`[GameClock] 丢帧！跳过 ${maxTicksPerFrame}+ 个 tick 以追赶`);
    }
  }

  /**
   * 订阅逻辑帧回调
   *
   * @returns 取消订阅的函数
   */
  onTick(callback: TickCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 重置时钟（场景重启用）
   */
  reset(): void {
    this.accumulator = 0;
    this.tickCount = 0;
    this.listeners.clear();
  }
}
