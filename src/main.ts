import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { DragonScene } from './scenes/DragonScene';
import { FactoryScene } from './scenes/FactoryScene';
import { HUDScene } from './scenes/HUDScene';

// ── 全局错误边界 ───────────────────────────────────────────────
// 捕获未被 try-catch 处理的异常，显示友好提示而非白屏
function showErrorOverlay(message: string): void {
  // 避免重复覆盖
  if (document.getElementById('error-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'error-overlay';
  overlay.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%;',
    'background:rgba(0,0,0,0.85);z-index:99999;',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;',
    'color:#fff;font-family:Arial,sans-serif;text-align:center;padding:20px;',
  ].join('');
  overlay.innerHTML = `
    <div style="font-size:64px;margin-bottom:16px;">&#x1F41B;</div>
    <h2 style="margin:0 0 8px;">游戏遇到了一个错误</h2>
    <p style="color:#aaa;margin:0 0 24px;">${message}</p>
    <button onclick="location.reload()" style="
      padding:10px 32px;font-size:16px;background:#ff8844;color:#fff;
      border:none;border-radius:6px;cursor:pointer;
    ">刷新页面</button>
  `;
  document.body.appendChild(overlay);
}

window.addEventListener('error', (event) => {
  console.error('[GlobalError] 未捕获的异常:', event.error);
  // 只处理脚本运行时错误（非资源加载错误）
  if (event.error) {
    showErrorOverlay('发生了意外错误，请刷新页面重试');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[GlobalError] 未处理的 Promise 拒绝:', event.reason);
  showErrorOverlay('发生了意外错误，请刷新页面重试');
});

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1024,
  height: 768,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  // 场景列表：先启动 BootScene，它负责初始化数据并启动其他场景
  scene: [BootScene, DragonScene, FactoryScene, HUDScene],
  // 像素风缩放（占位图阶段不需要抗锯齿）
  render: {
    pixelArt: false,
    antialias: true,
  },
  // 物理引擎暂时不用，但先声明（后续传送带物品碰撞可能用到）
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
