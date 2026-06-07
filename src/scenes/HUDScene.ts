import Phaser from 'phaser';
import { GameClock } from '../utils/GameClock';

/**
 * HUDScene — 全局 HUD 覆盖层 + GameClock 驱动器
 * UE 类比：AGameMode + UMG HUD Widget
 *
 * 关键职责：
 * 1. 每帧驱动 GameClock（因为只有本场景永不 sleep）
 * 2. 顶部状态栏（场景名、龙鳞数、逻辑帧计数）
 * 3. Tab 切换场景
 *
 * 为什么由 HUDScene 驱动 GameClock？
 * - DragonScene sleep 后 update() 不再被调用
 * - FactoryScene sleep 后 update() 也不再被调用
 * - 但 HUDScene 永远不 sleep → 它的 update() 始终运行
 * - 所以 GameClock.update() 放在 HUDScene.update() 中调用
 * - 这保证了无论玩家在哪个场景，逻辑帧始终稳定 10Hz
 */
export class HUDScene extends Phaser.Scene {
  private currentMainScene: 'DragonScene' | 'FactoryScene' = 'DragonScene';
  private gameClock!: GameClock;

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    // 从 registry 获取 GameClock 引用
    this.gameClock = this.game.registry.get('gameClock') as GameClock;

    // ── 顶部状态栏背景 ──
    const hudBg = this.add.rectangle(512, 0, 1024, 50, 0x0d0d1a);
    hudBg.setOrigin(0.5, 0);
    hudBg.setAlpha(0.85);
    hudBg.setDepth(1000);

    // ── UI 元素 ──
    const sceneLabel = this.add.text(16, 8, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial',
    }).setDepth(1001);

    const scalesLabel = this.add.text(400, 8, '', {
      fontSize: '16px',
      color: '#ffd700',
      fontFamily: 'Arial',
    }).setDepth(1001);

    // 逻辑帧计数（验证 GameClock 工作正常）
    const tickLabel = this.add.text(650, 8, '', {
      fontSize: '13px',
      color: '#88ff88',
      fontFamily: 'Arial',
    }).setDepth(1001);

    this.add.text(1010, 8, '[Tab] 切换', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial',
    }).setOrigin(1, 0).setDepth(1001);

    // ── 定期刷新 HUD 文字 ──
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        const sceneName = this.currentMainScene === 'DragonScene' ? '🐲 龙宝宝' : '🏭 工厂';
        sceneLabel.setText(`场景: ${sceneName}`);

        const scales = this.game.registry.get('dragonState')?.dragonScales ?? 0;
        scalesLabel.setText(`💰 龙鳞: ${scales}`);

        tickLabel.setText(`⏱ 逻辑帧: #${this.gameClock.tickCount}`);
      },
    });

    // ── Tab 键切换场景 ──
    this.input.keyboard?.on('keydown-TAB', () => {
      this.toggleMainScene();
    });

    console.log('[HUDScene] 已启动 — 负责驱动 GameClock 和场景切换');
  }

  /**
   * 每渲染帧：驱动 GameClock
   *
   * HUDScene 永不 sleep，所以这个 update() 始终被 Phaser 调用
   * 即使 DragonScene 和 FactoryScene 都 sleep 了，逻辑帧依然运行
   */
  update(_time: number, delta: number): void {
    this.gameClock.update(delta);
  }

  private toggleMainScene(): void {
    if (this.currentMainScene === 'DragonScene') {
      this.scene.sleep('DragonScene');
      this.scene.wake('FactoryScene');
      this.currentMainScene = 'FactoryScene';
      console.log('[HUDScene] → 工厂场景');
    } else {
      this.scene.sleep('FactoryScene');
      this.scene.wake('DragonScene');
      this.currentMainScene = 'DragonScene';
      console.log('[HUDScene] → 龙宝宝场景');
    }
  }
}
