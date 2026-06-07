import type { ItemType } from './Item';
import { isFoodProduct, ITEM_NAMES } from './Item';
import type { RecipeDef } from './Recipe';
import { RECIPES } from './Recipe';
import { EventBus } from '../../events/EventBus';
import { MachineStatus } from './MachineStatus';
import {
  SOURCE_INTERVALS, BELT_LENGTHS,
  SOURCE_MAX_BUFFER, MACHINE_MAX_INPUT, MACHINE_MAX_OUTPUT, FEEDER_MAX_BUFFER,
} from '../../data/GameConfig';

/**
 * FactoryWorld — 工厂逻辑总控
 * UE 类比：UFactorySubsystem（管理所有工厂实体的 Tick）
 *
 * 纯逻辑层，不依赖 Phaser 渲染。
 * 由 GameClock 驱动（10Hz），无论哪个场景活跃都在跑。
 *
 * 数据流：
 *   Source.produce() → Belt.transport() → Machine.consume() →
 *   Machine.produce() → Belt.transport() → Feeder.consume() →
 *   EventBus.emit('food_produced')
 */

// ═══════════════════════════════════════════════════════════════
// Source — 采集器（无限产出原料）
// ═══════════════════════════════════════════════════════════════

export class SourceLogic {
  readonly id: string;
  readonly itemType: ItemType;
  /** 基础生产间隔（逻辑帧 tick 数） */
  produceInterval: number;

  /** 渲染坐标（纯数字，无 Phaser 依赖） */
  x: number = 0;
  y: number = 0;

  private timer: number = 0;
  private buffer: ItemType[] = [];
  private readonly maxBuffer = SOURCE_MAX_BUFFER;

  constructor(id: string, itemType: ItemType, interval: number) {
    this.id = id;
    this.itemType = itemType;
    this.produceInterval = interval;
  }

  /**
   * 每逻辑帧调用
   * @param boostMult 加速倍率（1.0 = 正常，2.0 = 双倍速度）
   */
  update(boostMult: number): void {
    const effectiveInterval = this.produceInterval / boostMult;
    this.timer += 1;

    // 使用 while 而非 if：高倍率下可能单帧产出多个
    while (this.timer >= effectiveInterval && this.buffer.length < this.maxBuffer) {
      this.timer -= effectiveInterval;
      this.buffer.push(this.itemType);
    }
    // 防止缓冲区满时 timer 无限累积
    if (this.buffer.length >= this.maxBuffer) {
      this.timer = Math.min(this.timer, effectiveInterval);
    }
  }

  /** 传送带调用：从输出端口取走一个物品 */
  pullOutput(_port: number): ItemType | null {
    return this.buffer.shift() ?? null;
  }

  /** Source 不接受输入 */
  canAcceptInput(_port: number): boolean {
    return false;
  }

  receiveInput(_item: ItemType, _port: number): boolean {
    return false;
  }

  getBufferCount(): number {
    return this.buffer.length;
  }
}

// ═══════════════════════════════════════════════════════════════
// Machine — 生产机器（消耗原料 → 产出成品）
// ═══════════════════════════════════════════════════════════════

export class MachineLogic {
  readonly id: string;
  recipe: RecipeDef | null;

  /** 3 个输入端口 */
  inputBuffers: ItemType[][] = [[], [], []];
  /** 3 个输出端口 */
  outputBuffers: ItemType[][] = [[], [], []];

  private readonly maxInputPerPort = MACHINE_MAX_INPUT;
  private readonly maxOutputPerPort = MACHINE_MAX_OUTPUT;

  /** 当前生产进度（剩余 tick 数） */
  productionTimer: number = 0;
  /** 当前机器状态 */
  status: MachineStatus = MachineStatus.Idle;
  /** 当前生产周期的总 tick（用于计算进度百分比） */
  private currentTotalTicks: number = 0;
  /** 缺料详情：缺什么、需要多少、当前有多少 */
  missingInputs: { type: ItemType; needed: number; available: number }[] = [];

  /** 渲染坐标（纯数字，无 Phaser 依赖） */
  x: number = 0;
  y: number = 0;

  constructor(id: string, recipe?: RecipeDef) {
    this.id = id;
    this.recipe = recipe ?? null;
  }

  setRecipe(recipe: RecipeDef): void {
    this.recipe = recipe;
    // 换配方后重置
    this.productionTimer = 0;
    this.status = MachineStatus.Idle;
    this.currentTotalTicks = 0;
    this.missingInputs = [];
  }

  /** 获取剩余生产时间（秒），供渲染层显示倒计时 */
  getRemainingSeconds(boostMult: number = 1.0): number {
    if (this.status !== MachineStatus.Running) return 0;
    return this.productionTimer / (10 * boostMult);
  }

  /**
   * 每逻辑帧调用
   *
   * 逻辑：
   * 1. 如果正在生产 → 推进进度（受 boost 加速）
   * 2. 如果完成 → 产出物品到输出缓冲区
   * 3. 如果空闲 → 尝试开始新一轮生产
   */
  update(boostMult: number): void {
    if (!this.recipe) return;

    if (this.status === MachineStatus.Running) {
      // boost 加速：每帧扣除 boostMult 个 tick（而非 1 个）
      this.productionTimer -= boostMult;
      if (this.productionTimer <= 0) {
        this.completeProduction();
        this.status = MachineStatus.Idle;
        this.productionTimer = 0;
        this.currentTotalTicks = 0;
      }
    }

    // 空闲时尝试启动生产
    if (this.status !== MachineStatus.Running) {
      this.tryStartProduction();
    }
  }

  /**
   * 检查输入缓冲区是否满足配方要求
   * 如果满足 → 消耗原料 → 启动生产计时器
   */
  private tryStartProduction(): boolean {
    if (!this.recipe) {
      this.status = MachineStatus.Idle;
      return false;
    }

    // 检查输出缓冲区是否有空间
    const totalOutputSlots = this.outputBuffers.reduce((sum, buf) => sum + (this.maxOutputPerPort - buf.length), 0);
    const outputItemCount = this.recipe.outputs.reduce((sum, o) => sum + o.count, 0);
    if (totalOutputSlots < outputItemCount) {
      this.status = MachineStatus.OutputBlocked;
      return false;
    }

    // 检查每个输入原料是否有足够数量（在任何端口）
    const needed = new Map<ItemType, number>();
    for (const input of this.recipe.inputs) {
      needed.set(input.type, (needed.get(input.type) ?? 0) + input.count);
    }

    // 计算当前所有输入端口的物品汇总
    const available = new Map<ItemType, number>();
    for (const buf of this.inputBuffers) {
      for (const item of buf) {
        available.set(item, (available.get(item) ?? 0) + 1);
      }
    }

    // 检查是否足够 → 不够则记录缺料详情
    this.missingInputs = [];
    for (const [type, count] of needed) {
      const avail = available.get(type) ?? 0;
      if (avail < count) {
        this.missingInputs.push({ type, needed: count, available: avail });
      }
    }
    if (this.missingInputs.length > 0) {
      this.status = MachineStatus.InputBlocked;
      return false;
    }

    // 消耗原料（从端口按顺序扣除）
    for (const [type, count] of needed) {
      let remaining = count;
      for (const buf of this.inputBuffers) {
        for (let i = buf.length - 1; i >= 0 && remaining > 0; i--) {
          if (buf[i] === type) {
            buf.splice(i, 1);
            remaining--;
          }
        }
        if (remaining === 0) break;
      }
    }

    // 启动生产
    this.productionTimer = this.recipe.duration;
    this.currentTotalTicks = this.recipe.duration;
    this.status = MachineStatus.Running;
    this.missingInputs = [];
    console.log(`[Machine:${this.id}] 开始生产 ${this.recipe.name} (${this.recipe.duration} ticks)`);
    return true;
  }

  /** 生产完成 → 产物放入输出缓冲区 */
  private completeProduction(): void {
    if (!this.recipe) return;

    for (const output of this.recipe.outputs) {
      let remaining = output.count;
      // 优先放入非空端口（端口 0 → 1 → 2）
      for (let port = 0; port < 3 && remaining > 0; port++) {
        while (this.outputBuffers[port].length < this.maxOutputPerPort && remaining > 0) {
          this.outputBuffers[port].push(output.type);
          remaining--;
        }
      }
    }
    console.log(`[Machine:${this.id}] 完成生产 ${this.recipe.name}`);
  }

  /** 传送带调用：从指定输出端口取走一个物品 */
  pullOutput(port: number): ItemType | null {
    if (port < 0 || port >= 3) return null;
    return this.outputBuffers[port].shift() ?? null;
  }

  /** 传送带调用：给指定输入端口放入一个物品 */
  receiveInput(item: ItemType, port: number): boolean {
    if (port < 0 || port >= 3) return false;
    if (this.inputBuffers[port].length >= this.maxInputPerPort) return false;
    this.inputBuffers[port].push(item);
    return true;
  }

  canAcceptInput(port: number): boolean {
    if (port < 0 || port >= 3) return false;
    return this.inputBuffers[port].length < this.maxInputPerPort;
  }

  /**
   * 获取生产进度（0-1），供渲染层画进度条
   * @param subTick 子帧插值比例 0-1（让进度条平滑增长）
   * @param boostMult 当前加速倍率（progress 每 tick 扣除 boostMult）
   */
  getProgress(subTick: number = 0, boostMult: number = 1.0): number {
    if (this.status !== MachineStatus.Running || this.currentTotalTicks === 0) return 0;
    const effective = this.productionTimer - boostMult * subTick;
    return Math.max(0, Math.min(1, 1 - effective / this.currentTotalTicks));
  }

  /** 获取各输入端口的物品数量 */
  getInputCount(port: number): number {
    return this.inputBuffers[port]?.length ?? 0;
  }

  /** 获取各输出端口的物品数量 */
  getOutputCount(port: number): number {
    return this.outputBuffers[port]?.length ?? 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// BeltSegment — 传送带段（连接两个端口，物品在带上移动）
// ═══════════════════════════════════════════════════════════════

interface BeltItem {
  type: ItemType;
  remaining: number; // 剩余 tick 数到达终点
}

export class BeltSegment {
  readonly id: string;
  /** 传送带长度（物品走完全程需要的 tick 数） */
  readonly length: number;

  readonly sourceObj: SourceLogic | MachineLogic;
  readonly sourcePort: number;
  readonly destObj: MachineLogic | DragonFeederLogic;
  readonly destPort: number;

  /** 带上的物品队列 */
  private queue: BeltItem[] = [];

  constructor(
    id: string,
    source: SourceLogic | MachineLogic,
    sourcePort: number,
    dest: MachineLogic | DragonFeederLogic,
    destPort: number,
    length: number,
  ) {
    this.id = id;
    this.sourceObj = source;
    this.sourcePort = sourcePort;
    this.destObj = dest;
    this.destPort = destPort;
    this.length = length;
  }

  /**
   * 每逻辑帧调用：
   * 1. 带上的物品前进一格
   * 2. 到达终点的物品推入目标端口
   * 3. 从源端口拉取新物品到带上
   */
  update(): void {
    // 物品前进
    for (const entry of this.queue) {
      entry.remaining--;
    }

    // 到达终点的物品 → 推入目标
    while (this.queue.length > 0 && this.queue[0].remaining <= 0) {
      const { type } = this.queue.shift()!;
      const accepted = this.destObj.receiveInput(type, this.destPort);
      if (!accepted) {
        // 目标端口满，物品卡住（放回队首）
        this.queue.unshift({ type, remaining: 0 });
        break;
      }
    }

    // 从源拉取新物品
    if (this.destObj.canAcceptInput(this.destPort)) {
      const item = this.sourceObj.pullOutput(this.sourcePort);
      if (item) {
        this.queue.push({ type: item, remaining: this.length });
      }
    }
  }

  /**
   * 获取带上的物品列表（供渲染层绘制物品位置）
   * @param subTick 子帧插值比例 0-1（GameClock.getSubTickFraction()）
   *                用于在两次逻辑帧之间平滑 lerp 物品位置
   */
  getItems(subTick: number = 0): { type: ItemType; progress: number }[] {
    return this.queue.map(entry => {
      // 在 remaining 上减去 subTick，让物品在两 tick 之间"多走一点"
      // 例如 item 还剩 5 ticks，subTick=0.7 → 相当于走了 4.3 ticks → 进度更靠前
      const remaining = entry.remaining - subTick;
      const progress = Math.max(0, Math.min(1, 1 - remaining / this.length));
      return { type: entry.type, progress };
    });
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

// ═══════════════════════════════════════════════════════════════
// DragonFeederLogic — 喂食仓（工厂终点，接收成品 → 喂龙）
// ═══════════════════════════════════════════════════════════════

export class DragonFeederLogic {
  readonly id: string;
  inputBuffers: ItemType[][] = [[], [], []];

  /** 渲染坐标（纯数字，无 Phaser 依赖） */
  x: number = 0;
  y: number = 0;

  private readonly maxBuffer = FEEDER_MAX_BUFFER;

  constructor(id: string) {
    this.id = id;
  }

  update(): void {
    for (let port = 0; port < 3; port++) {
      const buffer = this.inputBuffers[port];
      while (buffer.length > 0) {
        const item = buffer.shift()!;
        if (isFoodProduct(item)) {
          EventBus.emit('food_produced', { foodId: item });
          console.log(`[Feeder:${this.id}] 喂食: ${ITEM_NAMES[item]}`);
        }
      }
    }
  }

  receiveInput(item: ItemType, port: number): boolean {
    if (port < 0 || port >= 3) return false;
    if (this.inputBuffers[port].length >= this.maxBuffer) return false;
    this.inputBuffers[port].push(item);
    return true;
  }

  canAcceptInput(port: number): boolean {
    if (port < 0 || port >= 3) return false;
    return this.inputBuffers[port].length < this.maxBuffer;
  }

  pullOutput(_port: number): null {
    return null;
  }

  getInputCount(port: number): number {
    return this.inputBuffers[port]?.length ?? 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// FactoryWorld — 工厂总控
// ═══════════════════════════════════════════════════════════════

export class FactoryWorld {
  sources: SourceLogic[] = [];
  machines: MachineLogic[] = [];
  belts: BeltSegment[] = [];
  feeder: DragonFeederLogic | null = null;

  /** 当前加速倍率（1.0 = 正常） */
  boostMultiplier: number = 1.0;
  /** 加速剩余 tick 数 */
  boostRemaining: number = 0;
  /** 加速是否激活 */
  boostActive: boolean = false;

  private nextId = 0;

  private genId(prefix: string): string {
    return `${prefix}_${this.nextId++}`;
  }

  addSource(itemType: ItemType, interval: number): SourceLogic {
    const src = new SourceLogic(this.genId('src'), itemType, interval);
    this.sources.push(src);
    return src;
  }

  addMachine(recipe?: RecipeDef): MachineLogic {
    const m = new MachineLogic(this.genId('mach'), recipe);
    this.machines.push(m);
    return m;
  }

  addFeeder(): DragonFeederLogic {
    const f = new DragonFeederLogic(this.genId('feeder'));
    this.feeder = f;
    return f;
  }

  addBelt(
    source: SourceLogic | MachineLogic, sourcePort: number,
    dest: MachineLogic | DragonFeederLogic, destPort: number,
    length: number,
  ): BeltSegment {
    const belt = new BeltSegment(this.genId('belt'), source, sourcePort, dest, destPort, length);
    this.belts.push(belt);
    return belt;
  }

  /**
   * 激活生产加速
   * @param multiplier 加速倍率（2.0 = 双倍速度）
   * @param durationTicks 持续时间（逻辑帧 tick 数）
   */
  activateBoost(multiplier: number, durationTicks: number): void {
    this.boostMultiplier = multiplier;
    this.boostRemaining = durationTicks;
    this.boostActive = true;
    console.log(`[FactoryWorld] 加速激活: ${multiplier}x, 持续 ${durationTicks} ticks (${durationTicks / 10}s)`);
  }

  /**
   * 取消加速
   */
  cancelBoost(): void {
    this.boostMultiplier = 1.0;
    this.boostRemaining = 0;
    this.boostActive = false;
  }

  /** 按 ID 查找任意实体（用于端口点击解析） */
  getEntityById(id: string): SourceLogic | MachineLogic | DragonFeederLogic | null {
    return this.sources.find(s => s.id === id)
      ?? this.machines.find(m => m.id === id)
      ?? this.feeder;
  }

  /** 删除采集器 + 关联传送带 */
  removeSource(id: string): boolean {
    const idx = this.sources.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this.sources.splice(idx, 1);
    this.belts = this.belts.filter(b => b.sourceObj.id !== id);
    return true;
  }

  /** 删除机器 + 关联传送带 */
  removeMachine(id: string): boolean {
    const idx = this.machines.findIndex(m => m.id === id);
    if (idx === -1) return false;
    this.machines.splice(idx, 1);
    this.belts = this.belts.filter(b => b.sourceObj.id !== id && b.destObj.id !== id);
    return true;
  }

  /** 删除传送带 */
  removeBelt(id: string): boolean {
    const idx = this.belts.findIndex(b => b.id === id);
    if (idx === -1) return false;
    this.belts.splice(idx, 1);
    return true;
  }

  /** 删除喂食仓 + 关联传送带 */
  removeFeeder(): boolean {
    if (!this.feeder) return false;
    this.belts = this.belts.filter(b => b.destObj.id !== this.feeder!.id);
    this.feeder = null;
    return true;
  }

  /**
   * BFS 环检测：从 dest 出发沿传送带前进，是否能走回 source
   * 用于防止玩家创建循环传送带导致物品无限循环
   */
  wouldCreateCycle(sourceId: string, destId: string): boolean {
    const visited = new Set<string>();
    const queue: string[] = [destId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const belt of this.belts) {
        if (belt.sourceObj.id === current && !visited.has(belt.destObj.id)) {
          queue.push(belt.destObj.id);
        }
      }
    }
    return false;
  }

  /**
   * 每逻辑帧调用（由 GameClock 驱动）
   *
   * 执行顺序：
   * 1. 更新加速计时器
   * 2. 采集器产出原料
   * 3. 生产机器消耗原料、产出成品
   * 4. 传送带运输物品
   * 5. 喂食仓消费成品
   */
  update(_dt: number): void {
    // 加速计时
    if (this.boostRemaining > 0) {
      this.boostRemaining--;
      if (this.boostRemaining <= 0) {
        this.boostMultiplier = 1.0;
        this.boostActive = false;
        console.log('[FactoryWorld] 加速结束，恢复 1x 速度');
      }
    }

    const bm = this.boostMultiplier;

    // 采集器产出
    for (const src of this.sources) {
      src.update(bm);
    }

    // 机器生产
    for (const m of this.machines) {
      m.update(bm);
    }

    // 传送带运输
    for (const belt of this.belts) {
      belt.update();
    }

    // 喂食仓消费
    this.feeder?.update();
  }
}

/**
 * 创建默认工厂布局（固定拓扑，MVP 阶段）
 *
 * 拓扑结构：
 *   [水源]──→ belt ──┐
 *   [麦田A]─→ belt ──┤
 *                     ├── [面包机] ──→ belt ──┐
 *   [牧场]──→ belt ───[ 肉机  ] ──→ belt ──┤
 *                                            ├── [喂食仓] → 龙宝宝
 *   [麦田B]─→ belt ──┤                       │
 *   [蔗田]──→ belt ──├── [蛋糕机] ──→ belt ──┘
 */
export function createDefaultFactory(): FactoryWorld {
  const fw = new FactoryWorld();

  // ── 采集器（5 个）─ 间隔从 GameConfig 读取 ──
  const waterSrc = fw.addSource('water', SOURCE_INTERVALS.water);
  const wheatSrcA = fw.addSource('wheat', SOURCE_INTERVALS.wheat_a);
  const meatSrc = fw.addSource('meat_raw', SOURCE_INTERVALS.meat_raw);
  const wheatSrcB = fw.addSource('wheat', SOURCE_INTERVALS.wheat_b);
  const sugarSrc = fw.addSource('sugar', SOURCE_INTERVALS.sugar);

  waterSrc.x = 120; waterSrc.y = 140;
  wheatSrcA.x = 120; wheatSrcA.y = 260;
  meatSrc.x = 120; meatSrc.y = 380;
  wheatSrcB.x = 120; wheatSrcB.y = 500;
  sugarSrc.x = 120; sugarSrc.y = 620;

  // ── 生产机器（3 台，带配方） ──
  const breadMachine = fw.addMachine(RECIPES[0]);
  const meatMachine = fw.addMachine(RECIPES[1]);
  const cakeMachine = fw.addMachine(RECIPES[2]);

  breadMachine.x = 500; breadMachine.y = 200;
  meatMachine.x = 500; meatMachine.y = 380;
  cakeMachine.x = 500; cakeMachine.y = 560;

  // ── 喂食仓 ──
  const feeder = fw.addFeeder();
  feeder.x = 850; feeder.y = 380;

  // ── 传送带连接 ─ 长度从 GameConfig 读取 ──
  const bl = BELT_LENGTHS;
  // 水源 + 麦田A → 面包机（端口 0, 1）
  fw.addBelt(waterSrc, 0, breadMachine, 0, bl.source_to_machine);
  fw.addBelt(wheatSrcA, 0, breadMachine, 1, bl.source_to_machine);
  // 牧场 → 肉机（端口 0）
  fw.addBelt(meatSrc, 0, meatMachine, 0, bl.meat_to_machine);
  // 麦田B + 蔗田 → 蛋糕机（端口 0, 1）
  fw.addBelt(wheatSrcB, 0, cakeMachine, 0, bl.source_to_machine);
  fw.addBelt(sugarSrc, 0, cakeMachine, 1, bl.source_to_machine);
  // 三台机器 → 喂食仓
  fw.addBelt(breadMachine, 0, feeder, 0, bl.machine_to_feeder);
  fw.addBelt(meatMachine, 0, feeder, 1, bl.machine_to_feeder);
  fw.addBelt(cakeMachine, 0, feeder, 2, bl.machine_to_feeder);

  return fw;
}
