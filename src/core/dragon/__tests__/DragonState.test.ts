import { describe, it, expect } from 'vitest';
import { DragonState } from '../DragonState';

describe('DragonState', () => {
  it('should initialize with default hunger and happiness', () => {
    const state = new DragonState();
    expect(state.hunger).toBe(50);
    expect(state.happiness).toBe(50);
  });

  it('should start with 10 dragon scales', () => {
    const state = new DragonState();
    expect(state.dragonScales).toBe(10);
  });

  describe('mood', () => {
    it('should be happy when happiness >= 80 and hunger < 50', () => {
      const state = new DragonState();
      state.happiness = 80;
      state.hunger = 49;
      expect(state.mood).toBe('happy');
    });

    it('should be normal when happiness >= 80 but hunger >= 50', () => {
      const state = new DragonState();
      state.happiness = 80;
      state.hunger = 50;
      // hunger=50 is NOT < MOOD_HAPPY_MAX_HUNGER(50), so happy check fails
      // hunger=50 < MOOD_HUNGRY_THRESHOLD(70), so hungry check fails
      // happiness=80 >= MOOD_UNHAPPY_THRESHOLD(30), so unhappy check fails
      // Falls to normal
      expect(state.mood).toBe('normal');
    });

    it('should be hungry when hunger >= 70', () => {
      const state = new DragonState();
      state.happiness = 50;
      state.hunger = 70;
      expect(state.mood).toBe('hungry');
    });

    it('should be unhappy when happiness < 30', () => {
      const state = new DragonState();
      state.happiness = 29;
      state.hunger = 50;
      expect(state.mood).toBe('unhappy');
    });

    it('should prioritize happy over hungry', () => {
      // hunger >= 70 would normally be hungry, but if happiness >= 80 AND hunger < 50, it's happy
      const state = new DragonState();
      state.happiness = 85;
      state.hunger = 40;
      expect(state.mood).toBe('happy');
    });

    it('should prioritize hungry over unhappy', () => {
      // Both hungry and unhappy conditions met -> hungry wins
      const state = new DragonState();
      state.happiness = 20; // unhappy threshold
      state.hunger = 80; // hungry threshold
      expect(state.mood).toBe('hungry');
    });

    it('should return normal for moderate values', () => {
      const state = new DragonState();
      state.happiness = 50;
      state.hunger = 50;
      expect(state.mood).toBe('normal');
    });

    it('should handle boundary: happiness exactly 80, hunger exactly 49 -> happy', () => {
      const state = new DragonState();
      state.happiness = 80;
      state.hunger = 49;
      expect(state.mood).toBe('happy');
    });

    it('should handle boundary: happiness exactly 30 -> not unhappy (normal)', () => {
      const state = new DragonState();
      state.happiness = 30;
      state.hunger = 50;
      expect(state.mood).toBe('normal'); // 30 is NOT < 30
    });

    it('should handle boundary: hunger exactly 70 -> hungry', () => {
      const state = new DragonState();
      state.happiness = 50;
      state.hunger = 70;
      expect(state.mood).toBe('hungry');
    });
  });

  describe('toString', () => {
    it('should include hunger, happiness, mood, and scales', () => {
      const state = new DragonState();
      const str = state.toString();
      expect(str).toContain('hunger=');
      expect(str).toContain('happiness=');
      expect(str).toContain('mood=');
      expect(str).toContain('scales=');
    });
  });
});
