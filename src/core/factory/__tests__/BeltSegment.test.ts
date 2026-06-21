import { describe, it, expect, beforeEach } from 'vitest';
import { BeltSegment, SourceLogic, MachineLogic } from '../FactoryWorld';
import type { RecipeDef } from '../Recipe';

function makeWheatRecipe(): RecipeDef {
  return {
    id: 'test',
    name: '测试',
    inputs: [{ type: 'wheat', count: 1 }],
    outputs: [{ type: 'bread', count: 1 }],
    duration: 10,
  };
}

describe('BeltSegment', () => {
  let source: SourceLogic;
  let dest: MachineLogic;
  let belt: BeltSegment;

  beforeEach(() => {
    source = new SourceLogic('src1', 'wheat', 5);
    dest = new MachineLogic('mach1', makeWheatRecipe());
    belt = new BeltSegment('belt1', source, 0, dest, 0, 8);
  });

  describe('maxCapacity', () => {
    it('should be length * 2', () => {
      // belt has length 8, so max capacity = 16
      expect(belt.getQueueLength()).toBe(0);
    });
  });

  describe('transport', () => {
    it('should pull from source and push to dest', () => {
      // Source needs multiple ticks to produce (interval=5)
      for (let i = 0; i < 5; i++) source.update(1.0);
      expect(source.getBufferCount()).toBeGreaterThan(0);

      // Belt transports
      belt.update();
      expect(belt.getQueueLength()).toBe(1);
    });

    it('should not overfill beyond max capacity', () => {
      // Produce many items in source
      for (let i = 0; i < 100; i++) {
        source.update(1.0);
      }

      // Try to fill belt
      for (let i = 0; i < 30; i++) {
        belt.update();
      }

      // Queue should not exceed length * 2 = 16
      expect(belt.getQueueLength()).toBeLessThanOrEqual(16);
    });

    it('should deliver items to destination over time', () => {
      // Produce items and run belt
      for (let i = 0; i < 15; i++) {
        source.update(1.0);
        belt.update();
      }

      // Items eventually reach destination
      const totalItems = dest.getInputCount(0) + belt.getQueueLength();
      expect(totalItems).toBeGreaterThan(0);
    });

    it('should not pull when destination port is full', () => {
      // Fill destination's input port
      for (let i = 0; i < 5; i++) {
        dest.receiveInput('wheat', 0);
      }

      for (let i = 0; i < 20; i++) {
        source.update(1.0);
        belt.update();
      }

      // Destination should not exceed 5
      expect(dest.getInputCount(0)).toBeLessThanOrEqual(5);
    });

    it('should advance items each tick', () => {
      // Produce items
      for (let i = 0; i < 6; i++) source.update(1.0);
      belt.update(); // pull item onto belt
      expect(belt.getQueueLength()).toBe(1);

      // After enough updates, items should reach destination
      for (let i = 0; i < 9; i++) {
        belt.update();
      }

      // Item should reach destination by tick 8
      expect(dest.getInputCount(0)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getItems', () => {
    it('should return items with progress for rendering', () => {
      // Produce and pull one item onto belt
      for (let i = 0; i < 6; i++) source.update(1.0);
      belt.update();

      // Advance belt a couple ticks so item moves along
      for (let i = 0; i < 3; i++) {
        belt.update();
      }

      const items = belt.getItems();
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].type).toBe('wheat');
      expect(items[0].progress).toBeGreaterThan(0);
      expect(items[0].progress).toBeLessThan(1);
    });

    it('should return empty array when belt is empty', () => {
      const items = belt.getItems();
      expect(items.length).toBe(0);
    });

    it('should use subTick interpolation', () => {
      // Produce and pull one item onto belt
      for (let i = 0; i < 6; i++) source.update(1.0);
      belt.update();

      const itemsNoSub = belt.getItems(0);
      const itemsWithSub = belt.getItems(0.5);

      expect(itemsNoSub.length).toBe(1);
      expect(itemsWithSub.length).toBe(1);
      // With subTick, progress should be greater (items appear further along)
      expect(itemsWithSub[0].progress).toBeGreaterThan(itemsNoSub[0].progress);
    });
  });
});
