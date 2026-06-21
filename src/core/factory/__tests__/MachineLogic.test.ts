import { describe, it, expect } from 'vitest';
import { MachineLogic } from '../FactoryWorld';
import { MachineStatus } from '../MachineStatus';
import type { RecipeDef } from '../Recipe';

function makeRecipe(overrides: Partial<RecipeDef> = {}): RecipeDef {
  return {
    id: 'test_recipe',
    name: '测试配方',
    inputs: [
      { type: 'wheat', count: 2 },
      { type: 'water', count: 1 },
    ],
    outputs: [{ type: 'bread', count: 1 }],
    duration: 30,
    ...overrides,
  };
}

describe('MachineLogic', () => {
  describe('initialization', () => {
    it('should start idle with no recipe', () => {
      const m = new MachineLogic('test');
      expect(m.recipe).toBeNull();
      expect(m.status).toBe(MachineStatus.Idle);
      expect(m.productionTimer).toBe(0);
    });

    it('should accept a recipe in constructor', () => {
      const recipe = makeRecipe();
      const m = new MachineLogic('test', recipe);
      expect(m.recipe).toBe(recipe);
    });
  });

  describe('setRecipe', () => {
    it('should update recipe and reset state', () => {
      const m = new MachineLogic('test', makeRecipe());
      m.productionTimer = 10;
      const newRecipe = makeRecipe({ id: 'new_recipe', duration: 20 });
      m.setRecipe(newRecipe);
      expect(m.recipe).toBe(newRecipe);
      expect(m.productionTimer).toBe(0);
      expect(m.status).toBe(MachineStatus.Idle);
    });
  });

  describe('port operations', () => {
    it('should accept input on valid port', () => {
      const m = new MachineLogic('test', makeRecipe());
      const accepted = m.receiveInput('wheat', 0);
      expect(accepted).toBe(true);
      expect(m.getInputCount(0)).toBe(1);
    });

    it('should reject input on invalid port', () => {
      const m = new MachineLogic('test', makeRecipe());
      expect(m.receiveInput('wheat', -1)).toBe(false);
      expect(m.receiveInput('wheat', 3)).toBe(false);
    });

    it('should reject input when port buffer is full', () => {
      const m = new MachineLogic('test', makeRecipe());
      // Fill port 0 to max (MACHINE_MAX_INPUT = 5)
      for (let i = 0; i < 5; i++) {
        m.receiveInput('wheat', 0);
      }
      expect(m.receiveInput('wheat', 0)).toBe(false);
    });

    it('should pull output from a port', () => {
      const m = new MachineLogic('test', makeRecipe());
      // Manually put something in output buffer
      m.outputBuffers[0].push('bread');
      const item = m.pullOutput(0);
      expect(item).toBe('bread');
      expect(m.getOutputCount(0)).toBe(0);
    });

    it('should return null from empty output port', () => {
      const m = new MachineLogic('test', makeRecipe());
      expect(m.pullOutput(0)).toBeNull();
    });

    it('canAcceptInput should check buffer capacity', () => {
      const m = new MachineLogic('test', makeRecipe());
      expect(m.canAcceptInput(0)).toBe(true);
      for (let i = 0; i < 5; i++) m.receiveInput('wheat', 0);
      expect(m.canAcceptInput(0)).toBe(false);
    });
  });

  describe('production', () => {
    it('should start production when inputs are sufficient', () => {
      const recipe = makeRecipe({ inputs: [{ type: 'wheat', count: 2 }], outputs: [{ type: 'bread', count: 1 }], duration: 10 });
      const m = new MachineLogic('test', recipe);
      // Add 2 wheat to input ports
      m.receiveInput('wheat', 0);
      m.receiveInput('wheat', 0);

      m.update(1.0);
      expect(m.status).toBe(MachineStatus.Running);
      expect(m.productionTimer).toBeGreaterThan(0);
    });

    it('should be input blocked when missing ingredients', () => {
      const recipe = makeRecipe();
      const m = new MachineLogic('test', recipe);
      // No inputs added

      m.update(1.0);
      expect(m.status).toBe(MachineStatus.InputBlocked);
      expect(m.missingInputs.length).toBeGreaterThan(0);
    });

    it('should be output blocked when output buffers are full', () => {
      const recipe = makeRecipe({ inputs: [{ type: 'wheat', count: 1 }], outputs: [{ type: 'bread', count: 1 }], duration: 5 });
      const m = new MachineLogic('test', recipe);
      // Fill all output ports (recipe has 1 output, so fill that one)
      for (let port = 0; port < m.outputBuffers.length; port++) {
        for (let i = 0; i < 5; i++) m.outputBuffers[port].push('bread');
      }
      // Add input
      m.receiveInput('wheat', 0);

      m.update(1.0);
      expect(m.status).toBe(MachineStatus.OutputBlocked);
    });

    it('should complete production after multiple ticks', () => {
      const recipe = makeRecipe({ inputs: [{ type: 'wheat', count: 1 }], duration: 2 });
      const m = new MachineLogic('test', recipe);
      m.receiveInput('wheat', 0);

      m.update(1.0); // Frame 1: start production, timer = 2 (not decremented yet)
      expect(m.status).toBe(MachineStatus.Running);

      m.update(1.0); // Frame 2: timer = 2-1 = 1 (still running)
      expect(m.status).toBe(MachineStatus.Running);

      m.update(1.0); // Frame 3: timer = 1-1 = 0 → complete production
      expect(m.status).toBe(MachineStatus.InputBlocked); // tries to start again but no wheat left
      expect(m.getOutputCount(0)).toBe(1); // bread produced
    });

    it('should respect boost multiplier (decrements in subsequent frame)', () => {
      const recipe = makeRecipe({ inputs: [{ type: 'wheat', count: 1 }], duration: 3 });
      const m = new MachineLogic('test', recipe);
      m.receiveInput('wheat', 0);

      m.update(2.0); // Frame 1: start production, timer set to 3
      expect(m.status).toBe(MachineStatus.Running);
      expect(m.productionTimer).toBe(3); // Not decremented in same frame start

      m.update(2.0); // Frame 2: timer = 3-2 = 1
      expect(m.productionTimer).toBe(1);
    });

    it('getProgress should return 0-1 range', () => {
      const recipe = makeRecipe({ inputs: [{ type: 'wheat', count: 1 }], duration: 10 });
      const m = new MachineLogic('test', recipe);
      expect(m.getProgress()).toBe(0);

      m.receiveInput('wheat', 0);
      m.update(1.0); // Start production, timer=10
      // First frame: timer was just set, not decremented yet
      m.update(1.0); // Second frame: timer = 10-1 = 9, currentTotalTicks = 10
      const progress = m.getProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('getRemainingSeconds should return estimated seconds', () => {
      const recipe = makeRecipe({ inputs: [{ type: 'wheat', count: 1 }], duration: 30 });
      const m = new MachineLogic('test', recipe);
      expect(m.getRemainingSeconds()).toBe(0); // not running

      m.receiveInput('wheat', 0);
      m.update(1.0); // Start production
      const secs = m.getRemainingSeconds();
      expect(secs).toBeGreaterThan(0);
    });

    it('should be idle when has no recipe', () => {
      const m = new MachineLogic('test');
      m.update(1.0);
      expect(m.status).toBe(MachineStatus.Idle);
    });
  });
});
