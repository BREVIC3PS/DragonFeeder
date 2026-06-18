import Phaser from 'phaser';
import { EventBus } from '../events/EventBus';
import { GameClock } from '../utils/GameClock';
import { TICK_RATE, INIT_FOOD_INVENTORY } from '../data/GameConfig';
import { DragonState } from '../core/dragon/DragonState';

/**
 * BootScene — 启动场景
 * UE 类比：GameInstance，负责初始化跨场景共享的数据和子系统
 *
 * 职责：
 * 1. 创建 GameClock（统一逻辑帧）和 EventBus（全局事件总线）
 * 2. 初始化 Game Registry 中的共享数据
 * 3. 启动 DragonScene、FactoryScene、HUDScene
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // ── 创建核心子系统 ──

    // GameClock：固定 Hz 逻辑帧驱动器（频率从 GameConfig.TICK_RATE 读取）
    // 存储在 registry 中，所有场景都能访问
    // HUDScene 负责每帧调用 gameClock.update()（因为只有它永不 sleep）
    const gameClock = new GameClock(TICK_RATE);
    this.game.registry.set('gameClock', gameClock);

    // EventBus 已在 events/EventBus.ts 中作为单例导出
    // 不需要存在 registry 里，直接 import 即可
    // 但为了让调试方便，也存一份引用
    this.game.registry.set('eventBus', EventBus);

    // ── 初始化全局共享数据（放在 Phaser Game Registry 中） ──

    // 龙宝宝状态：在 BootScene 阶段就创建 DragonState 实例，
    // 这样 FactoryScene.create() 中读取时也能拿到正确实例（DragonScene 不再覆盖它）
    this.game.registry.set('dragonState', new DragonState());

    // 食物库存（从 GameConfig 拷贝，避免直接共享同一引用导致配置被运行时修改）
    this.game.registry.set('foodInventory', { ...INIT_FOOD_INVENTORY });

    console.log(`[BootScene] 核心子系统已初始化：GameClock(${TICK_RATE}Hz) + EventBus`);

    // ── 启动三个并行场景 ──

    this.scene.start('DragonScene');
    this.scene.launch('FactoryScene');
    this.scene.sleep('FactoryScene'); // 初始休眠，Tab 切换时 wake
    this.scene.launch('HUDScene');    // 始终运行，驱动 GameClock

    console.log('[BootScene] 场景已启动');
  }
}
