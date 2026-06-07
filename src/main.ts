import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { DragonScene } from './scenes/DragonScene';
import { FactoryScene } from './scenes/FactoryScene';
import { HUDScene } from './scenes/HUDScene';

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
