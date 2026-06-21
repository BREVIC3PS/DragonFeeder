import { describe, it, expect, beforeEach } from 'vitest';
import { DragonLogic } from '../DragonLogic';
import { DragonState } from '../DragonState';

describe('DragonLogic', () => {
  let state: DragonState;
  let logic: DragonLogic;

  beforeEach(() => {
    state = new DragonState();
    logic = new DragonLogic(state);
  });

  describe('update', () => {
    it('should increase hunger over time', () => {
      const initialHunger = state.hunger;
      logic.update(0.1); // one tick at 10Hz
      expect(state.hunger).toBeGreaterThan(initialHunger);
    });

    it('should increase hunger by hungerRate * dt', () => {
      logic.update(1.0); // 1 second
      // hungerRate default is 0.3, so after 1s hunger should increase by ~0.3
      expect(state.hunger).toBeCloseTo(50.3, 1);
    });

    it('should cap hunger at 100', () => {
      state.hunger = 99.9;
      logic.update(1.0);
      expect(state.hunger).toBeLessThanOrEqual(100);
    });

    it('should decrease happiness over time', () => {
      const initialHappiness = state.happiness;
      logic.update(0.1);
      expect(state.happiness).toBeLessThan(initialHappiness);
    });

    it('should decrease happiness by happinessDecayRate * dt', () => {
      logic.update(1.0);
      expect(state.happiness).toBeCloseTo(49.8, 1); // 50 - 0.2 = 49.8
    });

    it('should floor happiness at 0', () => {
      state.happiness = 0.1;
      logic.update(1.0);
      expect(state.happiness).toBeGreaterThanOrEqual(0);
    });

    it('should accept custom rates', () => {
      const fastLogic = new DragonLogic(state, 1.0, 0.5);
      fastLogic.update(1.0);
      expect(state.hunger).toBeCloseTo(51.0, 1); // 50 + 1.0 = 51
      expect(state.happiness).toBeCloseTo(49.5, 1); // 50 - 0.5 = 49.5
    });
  });

  describe('feed', () => {
    it('should decrease hunger when fed', () => {
      state.hunger = 80;
      logic.feed({ id: 'bread', name: '面包', hungerRestore: 30, happinessGain: 10, emoji: '🍞', color: 0xffdd44 });
      expect(state.hunger).toBe(50);
    });

    it('should increase happiness when fed', () => {
      state.happiness = 40;
      logic.feed({ id: 'bread', name: '面包', hungerRestore: 30, happinessGain: 10, emoji: '🍞', color: 0xffdd44 });
      expect(state.happiness).toBe(50);
    });

    it('should floor hunger at 0', () => {
      state.hunger = 10;
      logic.feed({ id: 'bread', name: '面包', hungerRestore: 30, happinessGain: 10, emoji: '🍞', color: 0xffdd44 });
      expect(state.hunger).toBe(0);
    });

    it('should cap happiness at 100', () => {
      state.happiness = 95;
      logic.feed({ id: 'bread', name: '面包', hungerRestore: 30, happinessGain: 20, emoji: '🍞', color: 0xffdd44 });
      expect(state.happiness).toBe(100);
    });

    it('should return true when mood changes', () => {
      // Set state to unhappy (happiness < 30), but also very hungry
      state.happiness = 20;
      state.hunger = 80;
      // Now create logic AFTER setting state, so previousMood captures 'hungry'
      const hungryLogic = new DragonLogic(state);
      // After feeding: hunger=80-30=50, happiness=20+10=30
      // hunger 50 < 70, not hungry; happiness 30 >= 30, not unhappy; → normal
      // Mood changes from hungry → normal
      const changed = hungryLogic.feed({ id: 'cake', name: '蛋糕', hungerRestore: 30, happinessGain: 10, emoji: '🍞', color: 0xffdd44 });
      expect(changed).toBe(true);
    });

    it('should return false when mood stays same', () => {
      state.happiness = 50;
      state.hunger = 50;
      const changed = logic.feed({ id: 'bread', name: '面包', hungerRestore: 10, happinessGain: 5, emoji: '🍞', color: 0xffdd44 });
      expect(changed).toBe(false);
    });
  });

  describe('checkMoodChange', () => {
    it('should return true on first call if mood changed externally', () => {
      // Constructor captured mood at happiness=50, hunger=50 → normal
      // Now we externally change happiness to 25 → unhappy (< 30)
      state.happiness = 25;
      state.hunger = 50;
      // checkMoodChange should detect normal → unhappy
      const changed = logic.checkMoodChange();
      expect(changed).toBe(true);
    });

    it('should return true after mood changes', () => {
      // Force state to change mood
      state.happiness = 25; // unhappy
      state.hunger = 50;
      // Now checkMoodChange should detect the change from constructor's mood
      // Constructor captured normal mood (50/50), now it's unhappy
      const changed = logic.checkMoodChange();
      expect(changed).toBe(true);
    });

    it('should return false on second call without state change', () => {
      state.happiness = 25;
      state.hunger = 50;
      logic.checkMoodChange(); // consume the change
      const changedAgain = logic.checkMoodChange();
      expect(changedAgain).toBe(false);
    });
  });
});
