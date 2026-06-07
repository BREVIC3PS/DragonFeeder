/**
 * MachineStatus — 生产机器状态枚举
 * UE 类比：UEnum for production state machine
 */
export enum MachineStatus {
  /** 空闲，有原料可启动 */
  Idle = 'idle',
  /** 正在生产 */
  Running = 'running',
  /** 缺原料，无法启动（标红） */
  InputBlocked = 'input_blocked',
  /** 输出缓冲区满，无法产出（标黄） */
  OutputBlocked = 'output_blocked',
}
