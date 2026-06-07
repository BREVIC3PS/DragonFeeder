/**
 * EventBus — 全局事件总线
 * UE 类比：UE 的 Multicast Delegate / FEventManager
 *
 * 设计要点：
 * - 纯 TypeScript，不依赖 Phaser（core/ 层可以直接 import）
 * - 类似 Node.js EventEmitter，但更轻量
 * - 弱类型的事件回调（原型阶段保持灵活性，后续可加泛型约束）
 */

type EventHandler = (...args: unknown[]) => void;

class EventBusImpl {
  /** 事件 → 回调集合 */
  private listeners: Map<string, Set<EventHandler>> = new Map();

  /**
   * 订阅事件
   * 相当于 UE 的 MyDelegate.AddDynamic(this, &UMyClass::MyFunc)
   *
   * @returns 取消订阅的函数（调用即移除）
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // 返回取消订阅函数 —— 类似智能指针的 RAII 清理
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * 取消订阅
   * 相当于 UE 的 MyDelegate.RemoveDynamic(this, &UMyClass::MyFunc)
   */
  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * 触发事件（广播）
   * 相当于 UE 的 MyDelegate.Broadcast(...)
   *
   * 注意：回调执行中的异常会被 catch，防止一个订阅者崩溃拖垮全部
   */
  emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
        console.warn(`[EventBus] 事件 "${event}" 回调异常:`, err);
      }
    }
  }

  /**
   * 清除某个事件的全部订阅
   */
  clear(event: string): void {
    this.listeners.delete(event);
  }

  /**
   * 清除所有订阅（游戏重置时使用）
   */
  clearAll(): void {
    this.listeners.clear();
  }

  /**
   * 调试：列出当前所有事件及其订阅数量
   */
  debug(): void {
    console.log('[EventBus] 当前事件注册:');
    for (const [event, handlers] of this.listeners) {
      console.log(`  "${event}" → ${handlers.size} 个订阅者`);
    }
  }
}

/** 全局单例 —— 类似 UE 的全局 EventManager */
export const EventBus = new EventBusImpl();
