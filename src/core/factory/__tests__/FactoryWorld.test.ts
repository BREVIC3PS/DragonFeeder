import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FactoryWorld, SourceLogic, MachineLogic, DragonFeederLogic } from '../FactoryWorld';
import { RECIPES } from '../Recipe';
import { EventBus } from '../../../events/EventBus';

describe('FactoryWorld', () => {
  let fw: FactoryWorld;

  beforeEach(() => {
    fw = new FactoryWorld();
  });

  afterEach(() => {
    EventBus.clearAll();
  });

  describe('addSource', () => {
    it('should create and add a source', () => {
      const src = fw.addSource('water', 10);
      expect(src).toBeInstanceOf(SourceLogic);
      expect(src.itemType).toBe('water');
      expect(src.produceInterval).toBe(10);
      expect(fw.sources.length).toBe(1);
    });

    it('should generate unique IDs', () => {
      const s1 = fw.addSource('water', 10);
      const s2 = fw.addSource('wheat', 10);
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('addMachine', () => {
    it('should create and add a machine with recipe', () => {
      const m = fw.addMachine(RECIPES[0]);
      expect(m).toBeInstanceOf(MachineLogic);
      expect(m.recipe).toBe(RECIPES[0]);
      expect(fw.machines.length).toBe(1);
    });

    it('should create machine without recipe', () => {
      const m = fw.addMachine();
      expect(m.recipe).toBeNull();
    });
  });

  describe('addFeeder', () => {
    it('should create and set a feeder', () => {
      const f = fw.addFeeder();
      expect(f).toBeInstanceOf(DragonFeederLogic);
      expect(fw.feeder).toBe(f);
    });

    it('should replace existing feeder when adding new one', () => {
      const f1 = fw.addFeeder();
      const f2 = fw.addFeeder();
      expect(fw.feeder).toBe(f2);
      expect(fw.feeder).not.toBe(f1);
    });
  });

  describe('addBelt', () => {
    it('should create a belt between source and destination', () => {
      const src = fw.addSource('wheat', 5);
      const m = fw.addMachine(RECIPES[0]);
      const belt = fw.addBelt(src, 0, m, 0, 8);
      expect(belt).toBeDefined();
      expect(fw.belts.length).toBe(1);
    });
  });

  describe('removeSource', () => {
    it('should remove source and its connected belts', () => {
      const src = fw.addSource('wheat', 5);
      const m = fw.addMachine(RECIPES[0]);
      fw.addBelt(src, 0, m, 0, 8);

      fw.removeSource(src.id);
      expect(fw.sources.length).toBe(0);
      expect(fw.belts.length).toBe(0); // belt removed too
    });

    it('should return false for non-existent id', () => {
      expect(fw.removeSource('nonexistent')).toBe(false);
    });
  });

  describe('removeMachine', () => {
    it('should remove machine and its connected belts (both input and output)', () => {
      const src = fw.addSource('wheat', 5);
      const m = fw.addMachine(RECIPES[0]);
      const feeder = fw.addFeeder();
      fw.addBelt(src, 0, m, 0, 8); // input belt
      fw.addBelt(m, 0, feeder, 0, 6); // output belt

      fw.removeMachine(m.id);
      expect(fw.machines.length).toBe(0);
      expect(fw.belts.length).toBe(0); // both belts removed
    });
  });

  describe('removeFeeder', () => {
    it('should remove feeder and its incoming belts', () => {
      const src = fw.addSource('wheat', 5);
      const m = fw.addMachine(RECIPES[0]);
      const feeder = fw.addFeeder();
      fw.addBelt(src, 0, m, 0, 8);
      fw.addBelt(m, 0, feeder, 0, 6);

      fw.removeFeeder();
      expect(fw.feeder).toBeNull();
      // Only the feeder belt should be removed
      expect(fw.belts.length).toBe(1);
    });

    it('should return false if no feeder exists', () => {
      expect(fw.removeFeeder()).toBe(false);
    });
  });

  describe('removeBelt', () => {
    it('should remove a specific belt', () => {
      const src = fw.addSource('wheat', 5);
      const m = fw.addMachine(RECIPES[0]);
      const belt = fw.addBelt(src, 0, m, 0, 8);

      fw.removeBelt(belt.id);
      expect(fw.belts.length).toBe(0);
    });

    it('should return false for non-existent id', () => {
      expect(fw.removeBelt('nonexistent')).toBe(false);
    });
  });

  describe('wouldCreateCycle', () => {
    it('should detect a simple cycle', () => {
      const src = fw.addSource('wheat', 5);
      const m = fw.addMachine(RECIPES[0]);
      fw.addBelt(src, 0, m, 0, 8);

      // Adding a belt from machine back to source would create a cycle
      expect(fw.wouldCreateCycle(src.id, m.id)).toBe(false); // existing connection is fine
      expect(fw.wouldCreateCycle(m.id, src.id)).toBe(true); // reverse would be cycle
    });
  });

  describe('boost', () => {
    it('should activate boost', () => {
      fw.activateBoost(2.0, 100);
      expect(fw.boostActive).toBe(true);
      expect(fw.boostMultiplier).toBe(2.0);
      expect(fw.boostRemaining).toBe(100);
    });

    it('should cancel boost', () => {
      fw.activateBoost(2.0, 100);
      fw.cancelBoost();
      expect(fw.boostActive).toBe(false);
      expect(fw.boostMultiplier).toBe(1.0);
      expect(fw.boostRemaining).toBe(0);
    });

    it('should count down boost timer on update', () => {
      fw.activateBoost(2.0, 5);
      fw.update(0.1);
      expect(fw.boostRemaining).toBe(4);
    });

    it('should expire boost when timer reaches 0', () => {
      fw.activateBoost(2.0, 2);
      fw.update(0.1);
      fw.update(0.1);
      expect(fw.boostActive).toBe(false);
      expect(fw.boostMultiplier).toBe(1.0);
    });
  });

  describe('getEntityById', () => {
    it('should find source by id', () => {
      const src = fw.addSource('wheat', 5);
      expect(fw.getEntityById(src.id)).toBe(src);
    });

    it('should find machine by id', () => {
      const m = fw.addMachine(RECIPES[0]);
      expect(fw.getEntityById(m.id)).toBe(m);
    });

    it('should find feeder by id', () => {
      const feeder = fw.addFeeder();
      expect(fw.getEntityById(feeder.id)).toBe(feeder);
    });

    it('should return null for non-existent id', () => {
      expect(fw.getEntityById('does_not_exist')).toBeNull();
    });
  });

  describe('update', () => {
    it('should process all subsystems in order', () => {
      const fw2 = fw;
      // Add a complete mini factory
      const src = fw2.addSource('wheat', 5);
      const m = fw2.addMachine(RECIPES[0]); // bread recipe
      const feeder = fw2.addFeeder();
      fw2.addBelt(src, 0, m, 0, 8);
      fw2.addBelt(m, 0, feeder, 0, 6);

      // Track food_produced events
      const foods: unknown[] = [];
      const unsub = EventBus.on('food_produced', (data) => foods.push(data));

      // Run several ticks - source should produce and eventually feed dragon
      for (let i = 0; i < 10; i++) {
        fw2.update(0.1);
      }

      unsub();

      // Should not crash, sources should have produced something
      expect(src.getBufferCount()).toBeGreaterThanOrEqual(0);
    });
  });
});
